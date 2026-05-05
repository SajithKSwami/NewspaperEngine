// All CREATE TABLE and CREATE INDEX statements.
// Run once at startup via db.exec(). Safe to call repeatedly — all use IF NOT EXISTS.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS articles (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL UNIQUE,
    content     TEXT,
    published_at TEXT NOT NULL,
    fetched_at  TEXT NOT NULL,
    domain      TEXT,
    extracted   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS entities (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    UNIQUE(canonical_name, type)
  );

  CREATE TABLE IF NOT EXISTS article_entities (
    id         TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    sentiment  TEXT,
    role       TEXT,
    UNIQUE(article_id, entity_id)
  );

  CREATE TABLE IF NOT EXISTS connections (
    id              TEXT PRIMARY KEY,
    entity_id       TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    article_id_a    TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    article_id_b    TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    connection_type TEXT NOT NULL,
    strength        REAL NOT NULL DEFAULT 0.0,
    discovered_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published  ON articles(published_at);
  CREATE INDEX IF NOT EXISTS idx_articles_extracted  ON articles(extracted);
  CREATE INDEX IF NOT EXISTS idx_ae_article          ON article_entities(article_id);
  CREATE INDEX IF NOT EXISTS idx_ae_entity           ON article_entities(entity_id);
  CREATE INDEX IF NOT EXISTS idx_conn_entity         ON connections(entity_id);
  CREATE INDEX IF NOT EXISTS idx_conn_type           ON connections(connection_type);
`;

// Entity types allowed in the entities table.
export type EntityType = 'person' | 'org' | 'place' | 'event' | 'topic';

// Sentiment values allowed in article_entities.
export type Sentiment = 'positive' | 'negative' | 'neutral';

// Role of an entity in an article.
export type EntityRole = 'subject' | 'object' | 'mentioned';

// Connection types computed by the analysis layer.
export type ConnectionType = 'co_mention' | 'sentiment_divergence' | 'temporal_spike';

// Extracted integer flag values.
export const EXTRACT_STATUS = {
  PENDING: 0,
  DONE: 1,
  FAILED: 2,
} as const;

export type Article = {
  id: string;
  source: string;
  title: string;
  url: string;
  content: string | null;
  published_at: string;
  fetched_at: string;
  domain: string | null;
  extracted: 0 | 1 | 2;
};

export type Entity = {
  id: string;
  name: string;
  type: EntityType;
  canonical_name: string;
};

export type ArticleEntity = {
  id: string;
  article_id: string;
  entity_id: string;
  sentiment: Sentiment | null;
  role: EntityRole | null;
};

export type Connection = {
  id: string;
  entity_id: string;
  article_id_a: string;
  article_id_b: string;
  connection_type: ConnectionType;
  strength: number;
  discovered_at: string;
};
