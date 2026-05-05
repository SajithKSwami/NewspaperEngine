const BASE = '/api';

export type Article = {
  id: string;
  source: string;
  title: string;
  url: string;
  published_at: string;
  domain: string;
  entity_count: number;
};

export type Entity = {
  id: string;
  name: string;
  type: string;
  canonical_name: string;
  article_count: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
};

export type GraphNode = {
  id: string;
  label: string;
  nodeType: 'entity' | 'article';
  type?: string;
  source?: string;
  url?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  entityId: string;
  connectionType: 'co_mention' | 'sentiment_divergence' | 'temporal_spike';
  strength: number;
};

export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

export type Divergence = {
  id: string;
  name: string;
  type: string;
  canonical_name: string;
  divergence_count: number;
};

export type Spike = {
  id: string;
  name: string;
  type: string;
  canonical_name: string;
  spike_strength: number;
  today_mentions: number;
};

export type Status = {
  articles: number;
  entities: number;
  article_entity_links: number;
  connections: number;
  pending_extraction: number;
};

async function get<T>(url: string): Promise<T> {
  const r = await fetch(BASE + url);
  if (!r.ok) throw new Error(`API ${url} returned ${r.status}`);
  return r.json();
}

export const api = {
  status: () => get<Status>('/admin/status'),
  articles: (hours = 48, limit = 50) =>
    get<{ articles: Article[] }>(`/articles?hours=${hours}&limit=${limit}`).then(r => r.articles),
  entities: (hours = 48, limit = 50) =>
    get<{ entities: Entity[] }>(`/entities?hours=${hours}&limit=${limit}`).then(r => r.entities),
  graph: (hours = 48, type?: string, minStrength = 0.1) => {
    const q = new URLSearchParams({ hours: String(hours), min_strength: String(minStrength) });
    if (type) q.set('type', type);
    return get<GraphData>(`/graph?${q}`);
  },
  divergence: (hours = 48) =>
    get<{ divergences: Divergence[] }>(`/divergence?hours=${hours}`).then(r => r.divergences),
  spikes: () => get<{ spikes: Spike[] }>('/spikes').then(r => r.spikes),
  ingest: () => fetch(`${BASE}/admin/ingest`, { method: 'POST' }).then(r => r.json()),
  enrich: (batchSize = 20) =>
    fetch(`${BASE}/admin/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_size: batchSize }),
    }).then(r => r.json()),
  computeGraph: () => fetch(`${BASE}/admin/graph`, { method: 'POST' }).then(r => r.json()),
};
