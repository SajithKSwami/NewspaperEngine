import { useEffect, useState } from 'react';
import { api, type Divergence, type Entity, type Spike } from '../api.ts';

type Tab = 'entities' | 'divergence' | 'spikes';

export function SidePanel({ onEntityClick }: { onEntityClick: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>('entities');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [divergences, setDivergences] = useState<Divergence[]>([]);
  const [spikes, setSpikes] = useState<Spike[]>([]);
  const [hours, setHours] = useState(48);

  useEffect(() => {
    api.entities(hours).then(setEntities).catch(() => {});
    api.divergence(hours).then(setDivergences).catch(() => {});
    api.spikes().then(setSpikes).catch(() => {});
  }, [hours]);

  const sentimentBar = (e: Entity) => {
    const total = e.article_count || 1;
    const pos = (e.positive_count / total) * 100;
    const neg = (e.negative_count / total) * 100;
    return (
      <div className="flex h-1 w-full rounded overflow-hidden mt-1">
        <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
        <div className="bg-slate-600" style={{ width: `${100 - pos - neg}%` }} />
        <div className="bg-red-500" style={{ width: `${neg}%` }} />
      </div>
    );
  };

  const typeColor: Record<string, string> = {
    person: 'text-violet-300', org: 'text-sky-300', place: 'text-emerald-300',
    event: 'text-amber-300', topic: 'text-slate-300',
  };

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-slate-700 bg-slate-900 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700 text-xs">
        {(['entities', 'divergence', 'spikes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 capitalize transition-colors ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Hours filter */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 text-xs text-slate-400">
        <span>Window:</span>
        {[24, 48, 168].map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            className={`px-2 py-0.5 rounded ${hours === h ? 'bg-slate-600 text-white' : 'hover:text-slate-200'}`}
          >
            {h === 168 ? '7d' : `${h}h`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1 text-xs">
        {tab === 'entities' && entities.map(e => (
          <button
            key={e.id}
            onClick={() => onEntityClick(e.id)}
            className="w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-start justify-between gap-1">
              <span className="font-medium text-slate-200 leading-tight">{e.canonical_name}</span>
              <span className={`shrink-0 ${typeColor[e.type] ?? 'text-slate-400'}`}>{e.type}</span>
            </div>
            <div className="text-slate-500 mt-0.5">{e.article_count} articles</div>
            {sentimentBar(e)}
          </button>
        ))}

        {tab === 'divergence' && (divergences.length === 0
          ? <p className="p-4 text-slate-500">No divergences found. Run enrichment + graph computation first.</p>
          : divergences.map(d => (
            <button
              key={d.id}
              onClick={() => onEntityClick(d.id)}
              className="w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-slate-200">{d.canonical_name}</span>
                <span className="text-red-400 shrink-0">{d.divergence_count}✕</span>
              </div>
              <div className="text-slate-500 mt-0.5">{d.type} — opposing coverage</div>
            </button>
          ))
        )}

        {tab === 'spikes' && (spikes.length === 0
          ? <p className="p-4 text-slate-500">No spikes found. Need 3+ days of historical data.</p>
          : spikes.map(s => (
            <button
              key={s.id}
              onClick={() => onEntityClick(s.id)}
              className="w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-amber-300">{s.canonical_name}</span>
                <span className="text-amber-500 shrink-0">↑{(s.spike_strength * 100).toFixed(0)}%</span>
              </div>
              <div className="text-slate-500 mt-0.5">{s.today_mentions} mentions today</div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
