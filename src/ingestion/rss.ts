import Parser from 'rss-parser';
import { subHours } from 'date-fns';
import { SOURCES, type Source } from './sources.ts';

const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; NewspaperEngine/1.0)',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const parser = new Parser({ headers: RSS_HEADERS, timeout: 15000 });

export type RawArticle = {
  source: string;
  title: string;
  url: string;
  content: string;
  published_at: string;
  domain: string;
  tier: 1 | 2 | 3;
};

async function fetchSource(source: Source, since: Date): Promise<RawArticle[]> {
  const feed = await parser.parseURL(source.url);
  const results: RawArticle[] = [];

  for (const item of feed.items) {
    if (!item.link || !item.title) continue;

    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    if (pubDate < since) continue;

    results.push({
      source: source.name,
      title: item.title.trim(),
      url: item.link.trim(),
      content: (item.contentSnippet || item.content || item.title || '').trim(),
      published_at: pubDate.toISOString(),
      domain: source.domain,
      tier: source.tier,
    });
  }

  return results;
}

// Fetch all sources in parallel. Returns deduplicated articles from the last
// `windowHours` hours. Failed sources are silently skipped (error logged).
export async function fetchAllSources(windowHours = 48): Promise<RawArticle[]> {
  const since = subHours(new Date(), windowHours);

  const results = await Promise.allSettled(
    SOURCES.map(source => fetchSource(source, since))
  );

  const seen = new Set<string>();
  const articles: RawArticle[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.error(`[RSS] Failed to fetch ${SOURCES[i].name}:`, result.reason?.message ?? result.reason);
      continue;
    }
    for (const article of result.value) {
      if (seen.has(article.url)) continue;
      seen.add(article.url);
      articles.push(article);
    }
  }

  console.log(`[RSS] Fetched ${articles.length} unique articles from ${SOURCES.length} sources`);
  return articles;
}
