import { useEffect, useMemo, useState } from 'react';
import { api, type Divergence, type Entity, type Spike } from '../api.ts';

type Tab = 'filter' | 'divergence' | 'spikes';

const TYPE_COLORS: Record<string, string> = {
  person: 'text-violet-300',
  org:    'text-sky-300',
  place:  'text-emerald-300',
  event:  'text-amber-300',
  topic:  'text-slate-300',
};

const TYPE_BG: Record<string, string> = {
  person: 'bg-violet-900/60 border-violet-700 text-violet-200',
  org:    'bg-sky-900/60 border-sky-700 text-sky-200',
  place:  'bg-emerald-900/60 border-emerald-700 text-emerald-200',
  event:  'bg-amber-900/60 border-amber-700 text-amber-200',
  topic:  'bg-slate-800 border-slate-600 text-slate-300',
};

type Props = {
  onEntityClick: (id: string) => void;
  activeEntityId?: string;
};

export function SidePanel({ onEntityClick, activeEntityId }: Props) {
  const [tab, setTab]               = useState<Tab>('filter');
  const [entities, setEntities]     = useState<Entity[]>([]);
  const [divergences, setDivergences] = useState<Divergence[]>([]);
  const [spikes, setSpikes]         = useState<Spike[]>([]);
  const [hours, setHours]           = useState(48);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    api.entities(hours, 200).then(setEntities).catch(() => {});
    api.divergence(hours).then(setDivergences).catch(() => {});
    api.spikes().then(setSpikes).catch(() => {});
  }, [hours]);

  // Count per entity type for the filter pills
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [entities]);

  const filtered = useMemo(() => {
    let list = entities;
    if (typeFilter !== 'all') list = list.filter(e => e.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.canonical_name.toLowerCase().includes(q));
    }
    return list;
  }, [entities, typeFilter, search]);

  const sentimentBar = (e: Entity) => {
    const total = e.article_count || 1;
    const pos = (e.positive_count / total) * 100;
    const neg = (e.negative_count / total) * 100;
    return (
      <div className="flex h-1 w-full rounded overflow-hidden mt-1">
        <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
        <div className="bg-slate-700" style={{ width: `${100 - pos - neg}%` }} />
        <div className="bg-red-500"   style={{ width: `${neg}%` }} />
      </div>
    );
  };

  return (
    <aside className="w-72 shrink-0 flex flex-col border-r border-slate-700 bg-slate-900 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700 text-xs">
        {([
          { id: 'filter',    label: 'Entities' },
          { id: 'divergence', label: 'Divergence' },
          { id: 'spikes',    label: 'Spikes' },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 transition-colors ${tab === id ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Time window */}
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

      {/* ── FILTER TAB ─────────────────────────────────────────────────────── */}
      {tab === 'filter' && (
        <>
          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-700">
            <input
              type="text"
              placeholder="Search entities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Type filter pills */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-700">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2 py-0.5 rounded border text-xs transition-colors ${typeFilter === 'all' ? 'bg-slate-600 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              All ({entities.length})
            </button>
            {(['person', 'org', 'place', 'event', 'topic'] as const).map(t => (
              typeCounts[t] ? (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                  className={`px-2 py-0.5 rounded border text-xs transition-colors ${typeFilter === t ? TYPE_BG[t] : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                >
                  {t} ({typeCounts[t]})
                </button>
              ) : null
            ))}
          </div>

          {/* Active filter banner */}
          {activeEntityId && (
            <div className="px-3 py-1.5 bg-indigo-900/40 border-b border-indigo-700 text-xs text-indigo-300 flex items-center justify-between">
              <span>Graph filtered</span>
              <button
                onClick={() => onEntityClick('')}
                className="text-indigo-400 hover:text-white"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {/* Entity list */}
          <div className="overflow-y-auto flex-1 text-xs">
            {filtered.length === 0 && (
              <p className="p-4 text-slate-500">No entities match.</p>
            )}
            {filtered.map(e => {
              const isActive = e.id === activeEntityId;
              return (
                <button
                  key={e.id}
                  onClick={() => onEntityClick(isActive ? '' : e.id)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-800 transition-colors ${isActive ? 'bg-indigo-900/50 border-indigo-800' : 'hover:bg-slate-800'}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`font-medium leading-tight truncate ${isActive ? 'text-indigo-200' : 'text-slate-200'}`}>
                      {e.canonical_name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                        {e.article_count}
                      </span>
                      <span className={TYPE_COLORS[e.type] ?? 'text-slate-400'}>{e.type}</span>
                    </div>
                  </div>
                  {sentimentBar(e)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── DIVERGENCE TAB ─────────────────────────────────────────────────── */}
      {tab === 'divergence' && (
        <div className="overflow-y-auto flex-1 text-xs">
          {divergences.length === 0
            ? <p className="p-4 text-slate-500">No divergences found. Run enrichment + graph computation first.</p>
            : divergences.map(d => (
              <button
                key={d.id}
                onClick={() => onEntityClick(d.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800 ${d.id === activeEntityId ? 'bg-indigo-900/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium text-slate-200 truncate">{d.canonical_name}</span>
                  <span className="text-red-400 shrink-0">{d.divergence_count}✕</span>
                </div>
                <div className="text-slate-500 mt-0.5">{d.type} — opposing coverage</div>
              </button>
            ))
          }
        </div>
      )}

      {/* ── SPIKES TAB ─────────────────────────────────────────────────────── */}
      {tab === 'spikes' && (
        <div className="overflow-y-auto flex-1 text-xs">
          {spikes.length === 0
            ? <p className="p-4 text-slate-500">No spikes found. Need 3+ days of historical data.</p>
            : spikes.map(s => (
              <button
                key={s.id}
                onClick={() => onEntityClick(s.id)}
                className={`w-full text-left px-3 py-2 border-b border-slate-800 hover:bg-slate-800 ${s.id === activeEntityId ? 'bg-indigo-900/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium text-amber-300 truncate">{s.canonical_name}</span>
                  <span className="text-amber-500 shrink-0">↑{(s.spike_strength * 100).toFixed(0)}%</span>
                </div>
                <div className="text-slate-500 mt-0.5">{s.today_mentions} mentions today</div>
              </button>
            ))
          }
        </div>
      )}
    </aside>
  );
}
