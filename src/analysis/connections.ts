import { getDb, makeId } from '../db/index.ts';

// ─── Co-mention ──────────────────────────────────────────────────────────────
// Two articles share an entity → they are connected.
// Strength = how rarely that entity appears (rare co-mentions are more surprising).

function computeCoMentions(): number {
  const db = getDb();
  const now = new Date().toISOString();

  // Find all article pairs that share at least one entity and aren't already linked.
  const pairs = db.prepare(`
    SELECT
      ae1.entity_id,
      ae1.article_id AS article_id_a,
      ae2.article_id AS article_id_b,
      COUNT(*) AS shared_count,
      (
        SELECT COUNT(DISTINCT article_id) FROM article_entities
        WHERE entity_id = ae1.entity_id
      ) AS entity_frequency
    FROM article_entities ae1
    JOIN article_entities ae2
      ON ae1.entity_id = ae2.entity_id
     AND ae1.article_id < ae2.article_id
    GROUP BY ae1.entity_id, ae1.article_id, ae2.article_id
  `).all() as {
    entity_id: string;
    article_id_a: string;
    article_id_b: string;
    shared_count: number;
    entity_frequency: number;
  }[];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO connections
      (id, entity_id, article_id_a, article_id_b, connection_type, strength, discovered_at)
    VALUES
      (@id, @entity_id, @article_id_a, @article_id_b, 'co_mention', @strength, @discovered_at)
  `);

  const run = db.transaction(() => {
    for (const p of pairs) {
      // Rare entities connecting two articles = high strength signal.
      const strength = 1 / Math.log2(p.entity_frequency + 2);
      insert.run({
        id: makeId('co', p.entity_id, p.article_id_a, p.article_id_b),
        entity_id: p.entity_id,
        article_id_a: p.article_id_a,
        article_id_b: p.article_id_b,
        strength,
        discovered_at: now,
      });
    }
  });

  run();
  return pairs.length;
}

// ─── Sentiment Divergence ─────────────────────────────────────────────────────
// Two articles mention the same entity with opposite sentiment.
// Strength = 1.0 for positive↔negative, 0.5 for either↔neutral.

function computeSentimentDivergence(): number {
  const db = getDb();
  const now = new Date().toISOString();

  const pairs = db.prepare(`
    SELECT
      ae1.entity_id,
      ae1.article_id AS article_id_a,
      ae2.article_id AS article_id_b,
      ae1.sentiment AS sentiment_a,
      ae2.sentiment AS sentiment_b
    FROM article_entities ae1
    JOIN article_entities ae2
      ON ae1.entity_id = ae2.entity_id
     AND ae1.article_id < ae2.article_id
     AND ae1.sentiment IS NOT NULL
     AND ae2.sentiment IS NOT NULL
     AND ae1.sentiment != ae2.sentiment
  `).all() as {
    entity_id: string;
    article_id_a: string;
    article_id_b: string;
    sentiment_a: string;
    sentiment_b: string;
  }[];

  const insert = db.prepare(`
    INSERT OR REPLACE INTO connections
      (id, entity_id, article_id_a, article_id_b, connection_type, strength, discovered_at)
    VALUES
      (@id, @entity_id, @article_id_a, @article_id_b, 'sentiment_divergence', @strength, @discovered_at)
  `);

  const run = db.transaction(() => {
    for (const p of pairs) {
      const isOpposite =
        (p.sentiment_a === 'positive' && p.sentiment_b === 'negative') ||
        (p.sentiment_a === 'negative' && p.sentiment_b === 'positive');
      const strength = isOpposite ? 1.0 : 0.5;

      insert.run({
        id: makeId('div', p.entity_id, p.article_id_a, p.article_id_b),
        entity_id: p.entity_id,
        article_id_a: p.article_id_a,
        article_id_b: p.article_id_b,
        strength,
        discovered_at: now,
      });
    }
  });

  run();
  return pairs.length;
}

// ─── Temporal Spike ───────────────────────────────────────────────────────────
// An entity that appears in many more articles today than its rolling average.
// Creates a self-connection on the entity (no specific article pair).
// We model this as connections where article_id_a = article_id_b (same article).

function computeTemporalSpikes(): number {
  const db = getDb();
  const now = new Date().toISOString();

  // Count mentions per entity per day over last 30 days.
  const dailyCounts = db.prepare(`
    SELECT
      ae.entity_id,
      DATE(a.published_at) AS day,
      COUNT(*) AS cnt
    FROM article_entities ae
    JOIN articles a ON a.id = ae.article_id
    WHERE a.published_at >= DATE('now', '-30 days')
    GROUP BY ae.entity_id, DATE(a.published_at)
  `).all() as { entity_id: string; day: string; cnt: number }[];

  // Group by entity, compute mean + stddev over past days (excluding today).
  const byEntity = new Map<string, { day: string; cnt: number }[]>();
  for (const row of dailyCounts) {
    if (!byEntity.has(row.entity_id)) byEntity.set(row.entity_id, []);
    byEntity.get(row.entity_id)!.push(row);
  }

  const today = new Date().toISOString().slice(0, 10);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO connections
      (id, entity_id, article_id_a, article_id_b, connection_type, strength, discovered_at)
    SELECT
      @id, @entity_id, a.id, a.id, 'temporal_spike', @strength, @discovered_at
    FROM articles a
    JOIN article_entities ae ON ae.article_id = a.id AND ae.entity_id = @entity_id
    LIMIT 1
  `);

  let spikeCount = 0;
  const run = db.transaction(() => {
    for (const [entityId, days] of byEntity) {
      const todayRow = days.find(d => d.day === today);
      if (!todayRow) continue;

      const historical = days.filter(d => d.day !== today);
      if (historical.length < 3) continue; // need enough history

      const mean = historical.reduce((s, d) => s + d.cnt, 0) / historical.length;
      const variance = historical.reduce((s, d) => s + (d.cnt - mean) ** 2, 0) / historical.length;
      const stddev = Math.sqrt(variance);

      if (stddev === 0) continue;
      const zScore = (todayRow.cnt - mean) / stddev;
      if (zScore < 2.0) continue; // only flag > 2 standard deviations

      const strength = Math.min(zScore / 5, 1.0); // normalize to 0–1
      insert.run({
        id: makeId('spike', entityId, today),
        entity_id: entityId,
        strength,
        discovered_at: now,
      });
      spikeCount++;
    }
  });

  run();
  return spikeCount;
}

// ─── Public API ───────────────────────────────────────────────────────────────

type GraphResult = {
  coMentions: number;
  sentimentDivergences: number;
  temporalSpikes: number;
  total: number;
};

export function computeConnections(): GraphResult {
  console.log('[Graph] Computing co-mentions...');
  const coMentions = computeCoMentions();

  console.log('[Graph] Computing sentiment divergences...');
  const sentimentDivergences = computeSentimentDivergence();

  console.log('[Graph] Computing temporal spikes...');
  const temporalSpikes = computeTemporalSpikes();

  const total = coMentions + sentimentDivergences + temporalSpikes;
  console.log(`[Graph] Done: ${coMentions} co-mentions, ${sentimentDivergences} divergences, ${temporalSpikes} spikes`);
  return { coMentions, sentimentDivergences, temporalSpikes, total };
}
