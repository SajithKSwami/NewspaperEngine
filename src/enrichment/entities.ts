import { GoogleGenAI } from '@google/genai';
import { getDb, makeId } from '../db/index.ts';
import { EXTRACT_STATUS, type EntityType, type Sentiment, type EntityRole } from '../db/schema.ts';

type ExtractedEntity = {
  name: string;
  type: EntityType;
  canonical_name: string;
  sentiment: Sentiment;
  role: EntityRole;
};

type ExtractionResult = {
  entities: ExtractedEntity[];
};

const SYSTEM_PROMPT = `You are an entity extraction engine for a news analysis system.
Given the title and content of a news article, extract all significant named entities.

Return ONLY valid JSON matching this exact shape:
{
  "entities": [
    {
      "name": "string — exact name as it appears in the text",
      "type": "person | org | place | event | topic",
      "canonical_name": "string — normalized form (e.g. 'Donald Trump', 'Federal Reserve', 'Ukraine')",
      "sentiment": "positive | negative | neutral",
      "role": "subject | object | mentioned"
    }
  ]
}

Rules:
- Extract 3–12 entities per article. Prefer quality over quantity.
- canonical_name: lowercase for topics/places, Title Case for people/orgs.
- sentiment: how the article frames this entity (not the entity's general reputation).
- role: subject = main actor, object = acted upon, mentioned = referenced.
- Skip generic terms like "government", "officials", "people".
- No markdown fences, no commentary — pure JSON only.`;

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (_ai) return _ai;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY environment variable is not set');
  _ai = new GoogleGenAI({ apiKey: key });
  return _ai;
}

async function extractEntities(title: string, content: string): Promise<ExtractedEntity[]> {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: `Title: ${title}\n\nContent: ${content.slice(0, 800)}` }] },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  });

  const raw = (response.text ?? '').trim();
  const parsed: ExtractionResult = JSON.parse(raw);
  return parsed.entities ?? [];
}

function upsertEntity(entity: ExtractedEntity): string {
  const db = getDb();
  const id = makeId(entity.canonical_name, entity.type);

  db.prepare(`
    INSERT INTO entities (id, name, type, canonical_name)
    VALUES (@id, @name, @type, @canonical_name)
    ON CONFLICT(canonical_name, type) DO UPDATE SET name = excluded.name
  `).run({ id, name: entity.name, type: entity.type, canonical_name: entity.canonical_name });

  // Return the canonical id (may differ from computed one if row already existed)
  const row = db.prepare('SELECT id FROM entities WHERE canonical_name = ? AND type = ?')
    .get(entity.canonical_name, entity.type) as { id: string };
  return row.id;
}

function linkArticleEntity(articleId: string, entityId: string, entity: ExtractedEntity): void {
  const db = getDb();
  const id = makeId(articleId, entityId);
  db.prepare(`
    INSERT OR IGNORE INTO article_entities (id, article_id, entity_id, sentiment, role)
    VALUES (@id, @article_id, @entity_id, @sentiment, @role)
  `).run({ id, article_id: articleId, entity_id: entityId, sentiment: entity.sentiment, role: entity.role });
}

// Process one article: extract entities, upsert them, link to article.
// Returns number of entities linked.
async function processArticle(articleId: string, title: string, content: string): Promise<number> {
  const entities = await extractEntities(title, content || title);
  const db = getDb();

  db.transaction(() => {
    for (const entity of entities) {
      const entityId = upsertEntity(entity);
      linkArticleEntity(articleId, entityId, entity);
    }
  })();

  db.prepare('UPDATE articles SET extracted = ? WHERE id = ?')
    .run(EXTRACT_STATUS.DONE, articleId);

  return entities.length;
}

type EnrichmentResult = {
  processed: number;
  failed: number;
  totalEntities: number;
};

// Enrich all articles that haven't been extracted yet.
// Processes up to `batchSize` articles per call to keep API costs bounded.
export async function enrichPendingArticles(batchSize = 50): Promise<EnrichmentResult> {
  const db = getDb();
  const pending = db.prepare(`
    SELECT id, title, content FROM articles
    WHERE extracted = ${EXTRACT_STATUS.PENDING}
    ORDER BY published_at DESC
    LIMIT ?
  `).all(batchSize) as { id: string; title: string; content: string }[];

  if (pending.length === 0) {
    console.log('[Enrichment] No pending articles');
    return { processed: 0, failed: 0, totalEntities: 0 };
  }

  console.log(`[Enrichment] Processing ${pending.length} articles...`);

  let processed = 0;
  let failed = 0;
  let totalEntities = 0;

  for (const article of pending) {
    try {
      const count = await processArticle(article.id, article.title, article.content ?? '');
      totalEntities += count;
      processed++;
      if (processed % 10 === 0) {
        console.log(`[Enrichment] ${processed}/${pending.length} done, ${totalEntities} entities so far`);
      }
    } catch (err) {
      console.error(`[Enrichment] Failed article ${article.id}:`, (err as Error).message);
      db.prepare('UPDATE articles SET extracted = ? WHERE id = ?')
        .run(EXTRACT_STATUS.FAILED, article.id);
      failed++;
    }
  }

  console.log(`[Enrichment] Done: ${processed} processed, ${failed} failed, ${totalEntities} entities written`);
  return { processed, failed, totalEntities };
}
