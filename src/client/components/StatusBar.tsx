import { useEffect, useState } from 'react';
import { api, type Status } from '../api.ts';

export function StatusBar() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = () => api.status().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); const t = setInterval(refresh, 30000); return () => clearInterval(t); }, []);

  async function trigger(action: () => Promise<unknown>, label: string) {
    setLoading(true);
    setMsg(`Running ${label}...`);
    try {
      const r = await action() as Record<string, number>;
      setMsg(`${label} done — ${JSON.stringify(r)}`);
      refresh();
    } catch (e) {
      setMsg(`${label} failed`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700 text-xs text-slate-400 flex-wrap">
      {status && (
        <>
          <span className="text-slate-300 font-semibold">NewspaperEngine</span>
          <span>{status.articles.toLocaleString()} articles</span>
          <span>{status.entities.toLocaleString()} entities</span>
          <span>{status.connections.toLocaleString()} connections</span>
          {status.pending_extraction > 0 && (
            <span className="text-amber-400">{status.pending_extraction} pending extraction</span>
          )}
        </>
      )}
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => trigger(api.ingest, 'Ingest')}
          disabled={loading}
          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
        >
          Ingest
        </button>
        <button
          onClick={() => trigger(() => api.enrich(20), 'Enrich (20)')}
          disabled={loading}
          className="px-2 py-1 rounded bg-indigo-800 hover:bg-indigo-700 disabled:opacity-40"
        >
          Enrich
        </button>
        <button
          onClick={() => trigger(api.computeGraph, 'Graph')}
          disabled={loading}
          className="px-2 py-1 rounded bg-sky-800 hover:bg-sky-700 disabled:opacity-40"
        >
          Compute Graph
        </button>
      </div>
      {msg && <span className="w-full text-slate-400 italic">{msg}</span>}
    </div>
  );
}
