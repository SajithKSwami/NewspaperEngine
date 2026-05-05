import { getDb, makeId } from '../db/index.ts';
import { fetchAllSources, type RawArticle } from './rss.ts';

type IngestResult = {
  fetched: number;
  inserted: number;
  skipped: number;
};

function insertArticle(article: RawArticle): boolean {
  const db = getDb();
  const id = makeId(article.url);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles
      (id, source, title, url, content, published_at, fetched_at, domain, extracted)
    VALUES
      (@id, @source, @title, @url, @content, @published_at, @fetched_at, @domain, 0)
  `);

  const result = stmt.run({
    id,
    source: article.source,
    title: article.title,
    url: article.url,
    content: article.content,
    published_at: article.published_at,
    fetched_at: new Date().toISOString(),
    domain: article.domain,
  });

  return result.changes > 0;
}

export async function runIngestion(windowHours = 48): Promise<IngestResult> {
  const articles = await fetchAllSources(windowHours);
  let inserted = 0;

  // Batch inserts in a transaction for performance.
  const db = getDb();
  const run = db.transaction((batch: RawArticle[]) => {
    for (const article of batch) {
      if (insertArticle(article)) inserted++;
    }
  });

  run(articles);

  const result: IngestResult = {
    fetched: articles.length,
    inserted,
    skipped: articles.length - inserted,
  };

  console.log(`[Pipeline] Ingested: ${inserted} new, ${result.skipped} already stored`);
  return result;
}
