import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { getDb } from './src/db/index.ts';
import { startScheduler } from './src/ingestion/scheduler.ts';
import { runIngestion } from './src/ingestion/pipeline.ts';
import { enrichPendingArticles } from './src/enrichment/entities.ts';
import { computeConnections } from './src/analysis/connections.ts';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());

// ─── Articles ─────────────────────────────────────────────────────────────────

app.get('/api/articles', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const source = req.query.source as string | undefined;
  const domain = req.query.domain as string | undefined;
  const hours = Number(req.query.hours ?? 48);

  const params: (string | number)[] = [];
  let where = `WHERE a.published_at >= datetime('now', '-' || ? || ' hours')`;
  params.push(hours);

  if (source) { where += ' AND a.source = ?'; params.push(source); }
  if (domain) { where += ' AND a.domain = ?'; params.push(domain); }

  const articles = db.prepare(`
    SELECT a.id, a.source, a.title, a.url, a.published_at, a.domain, a.extracted,
           COUNT(ae.entity_id) AS entity_count
    FROM articles a
    LEFT JOIN article_entities ae ON ae.article_id = a.id
    ${where}
    GROUP BY a.id
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ articles, limit, offset });
});

// ─── Entities ─────────────────────────────────────────────────────────────────

app.get('/api/entities', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const type = req.query.type as string | undefined;
  const hours = Number(req.query.hours ?? 48);

  const params: (string | number)[] = [hours];
  let typeFilter = '';
  if (type) { typeFilter = 'AND e.type = ?'; params.push(type); }

  const entities = db.prepare(`
    SELECT
      e.id, e.name, e.type, e.canonical_name,
      COUNT(DISTINCT ae.article_id)                                          AS article_count,
      SUM(CASE WHEN ae.sentiment = 'positive' THEN 1 ELSE 0 END)            AS positive_count,
      SUM(CASE WHEN ae.sentiment = 'negative' THEN 1 ELSE 0 END)            AS negative_count,
      SUM(CASE WHEN ae.sentiment = 'neutral'  THEN 1 ELSE 0 END)            AS neutral_count
    FROM entities e
    JOIN article_entities ae ON ae.entity_id = e.id
    JOIN articles a ON a.id = ae.article_id
    WHERE a.published_at >= datetime('now', '-' || ? || ' hours')
    ${typeFilter}
    GROUP BY e.id
    ORDER BY article_count DESC
    LIMIT ?
  `).all(...params, limit);

  res.json({ entities });
});

// ─── Articles for an entity ────────────────────────────────────────────────────

app.get('/api/entities/:id/articles', (req, res) => {
  const db = getDb();
  const articles = db.prepare(`
    SELECT a.id, a.source, a.title, a.url, a.published_at, ae.sentiment, ae.role
    FROM article_entities ae
    JOIN articles a ON a.id = ae.article_id
    WHERE ae.entity_id = ?
    ORDER BY a.published_at DESC
    LIMIT 50
  `).all(req.params.id);

  res.json({ articles });
});

// ─── Connections graph ────────────────────────────────────────────────────────

app.get('/api/graph', (req, res) => {
  const db = getDb();
  const hours = Number(req.query.hours ?? 48);
  const type = req.query.type as string | undefined;
  const minStrength = Number(req.query.min_strength ?? 0.1);

  const params: (string | number)[] = [hours, minStrength];
  let typeFilter = '';
  if (type) { typeFilter = 'AND c.connection_type = ?'; params.push(type); }

  const connections = db.prepare(`
    SELECT
      c.id, c.connection_type, c.strength,
      e.id AS entity_id, e.name AS entity_name, e.type AS entity_type,
      aa.id AS article_a_id, aa.title AS article_a_title, aa.source AS article_a_source, aa.url AS article_a_url,
      ab.id AS article_b_id, ab.title AS article_b_title, ab.source AS article_b_source, ab.url AS article_b_url
    FROM connections c
    JOIN entities e  ON e.id  = c.entity_id
    JOIN articles aa ON aa.id = c.article_id_a
    JOIN articles ab ON ab.id = c.article_id_b
    WHERE c.discovered_at >= datetime('now', '-' || ? || ' hours')
      AND c.strength >= ?
      ${typeFilter}
      AND aa.id != ab.id
    ORDER BY c.strength DESC
    LIMIT 500
  `).all(...params) as any[];

  // Shape for graph rendering: nodes + edges
  const entityNodes = new Map<string, object>();
  const articleNodes = new Map<string, object>();
  const edges: object[] = [];

  for (const c of connections) {
    if (!entityNodes.has(c.entity_id)) {
      entityNodes.set(c.entity_id, {
        id: c.entity_id, label: c.entity_name, type: c.entity_type, nodeType: 'entity',
      });
    }
    if (!articleNodes.has(c.article_a_id)) {
      articleNodes.set(c.article_a_id, {
        id: c.article_a_id, label: c.article_a_title, source: c.article_a_source,
        url: c.article_a_url, nodeType: 'article',
      });
    }
    if (!articleNodes.has(c.article_b_id)) {
      articleNodes.set(c.article_b_id, {
        id: c.article_b_id, label: c.article_b_title, source: c.article_b_source,
        url: c.article_b_url, nodeType: 'article',
      });
    }
    edges.push({
      id: c.id,
      source: c.article_a_id,
      target: c.article_b_id,
      entityId: c.entity_id,
      connectionType: c.connection_type,
      strength: c.strength,
    });
  }

  res.json({
    nodes: [...entityNodes.values(), ...articleNodes.values()],
    edges,
  });
});

// ─── Divergence digest ────────────────────────────────────────────────────────

app.get('/api/divergence', (req, res) => {
  const db = getDb();
  const hours = Number(req.query.hours ?? 48);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const rows = db.prepare(`
    SELECT
      e.id, e.name, e.type, e.canonical_name,
      COUNT(DISTINCT c.id) AS divergence_count
    FROM connections c
    JOIN entities e ON e.id = c.entity_id
    WHERE c.connection_type = 'sentiment_divergence'
      AND c.strength = 1.0
      AND c.discovered_at >= datetime('now', '-' || ? || ' hours')
    GROUP BY e.id
    ORDER BY divergence_count DESC
    LIMIT ?
  `).all(hours, limit);

  res.json({ divergences: rows });
});

// ─── Temporal spikes ──────────────────────────────────────────────────────────

app.get('/api/spikes', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const rows = db.prepare(`
    SELECT
      e.id, e.name, e.type, e.canonical_name,
      MAX(c.strength) AS spike_strength,
      COUNT(DISTINCT ae.article_id) AS today_mentions
    FROM connections c
    JOIN entities e ON e.id = c.entity_id
    JOIN article_entities ae ON ae.entity_id = e.id
    JOIN articles a ON a.id = ae.article_id
    WHERE c.connection_type = 'temporal_spike'
      AND a.published_at >= DATE('now')
    GROUP BY e.id
    ORDER BY spike_strength DESC
    LIMIT ?
  `).all(limit);

  res.json({ spikes: rows });
});

// ─── Admin ────────────────────────────────────────────────────────────────────

app.post('/api/admin/ingest', async (_req, res) => {
  try { res.json(await runIngestion()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.post('/api/admin/enrich', async (req, res) => {
  try {
    const batchSize = Number(req.body?.batch_size ?? 50);
    res.json(await enrichPendingArticles(batchSize));
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.post('/api/admin/graph', (_req, res) => {
  try { res.json(computeConnections()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/admin/status', (_req, res) => {
  const db = getDb();
  res.json({
    articles:             (db.prepare('SELECT COUNT(*) as n FROM articles').get() as any).n,
    entities:             (db.prepare('SELECT COUNT(*) as n FROM entities').get() as any).n,
    article_entity_links: (db.prepare('SELECT COUNT(*) as n FROM article_entities').get() as any).n,
    connections:          (db.prepare('SELECT COUNT(*) as n FROM connections').get() as any).n,
    pending_extraction:   (db.prepare('SELECT COUNT(*) as n FROM articles WHERE extracted = 0').get() as any).n,
  });
});

// ─── Static (production) ──────────────────────────────────────────────────────
// In dev, Vite runs separately on :5173 and proxies /api/* to this server.
// In production, this server also serves the built frontend.

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NewspaperEngine API running on http://localhost:${PORT}`);
  console.log(`  Dev UI: run "npm run dev:ui" for the frontend on :5173`);
});

startScheduler();
