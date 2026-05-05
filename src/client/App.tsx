import { useState } from 'react';
import { StatusBar } from './components/StatusBar.tsx';
import { SidePanel } from './components/SidePanel.tsx';
import { GraphView } from './components/GraphView.tsx';
import type { Node } from '@xyflow/react';

const CONNECTION_TYPES = [
  { value: undefined,                label: 'All connections' },
  { value: 'co_mention',             label: 'Co-mentions' },
  { value: 'sentiment_divergence',   label: 'Diverging sentiment' },
  { value: 'temporal_spike',         label: 'Temporal spikes' },
] as const;

export default function App() {
  const [hours, setHours] = useState(48);
  const [connType, setConnType] = useState<string | undefined>(undefined);
  const [focusEntityId, setFocusEntityId] = useState<string | undefined>();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  function handleEntityClick(id: string) {
    setFocusEntityId(id || undefined);
  }

  function handleNodeClick(node: Node) {
    setSelectedNode(node);
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <StatusBar />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 text-xs text-slate-400 flex-wrap">
        <span>Time window:</span>
        {[24, 48, 168].map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            className={`px-2 py-1 rounded transition-colors ${hours === h ? 'bg-slate-600 text-white' : 'hover:text-slate-200'}`}
          >
            {h === 168 ? '7 days' : `${h}h`}
          </button>
        ))}
        <span className="mx-2 text-slate-600">|</span>
        <span>Filter:</span>
        {CONNECTION_TYPES.map(({ value, label }) => (
          <button
            key={label}
            onClick={() => setConnType(value)}
            className={`px-2 py-1 rounded transition-colors ${connType === value ? 'bg-slate-600 text-white' : 'hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <SidePanel onEntityClick={handleEntityClick} activeEntityId={focusEntityId} />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          <GraphView
            hours={hours}
            connectionType={connType}
            focusEntityId={focusEntityId}
            onNodeClick={handleNodeClick}
          />

          {/* Node detail popup */}
          {selectedNode && (
            <div className="absolute bottom-4 left-4 right-4 max-w-lg bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                    {selectedNode.type} — {(selectedNode.data as any)?.type || (selectedNode.data as any)?.source}
                  </div>
                  <div className="font-semibold text-white text-sm leading-snug">
                    {(selectedNode.data as any)?.label}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="shrink-0 text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </div>
              {(selectedNode.data as any)?.url && (
                <a
                  href={(selectedNode.data as any).url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sky-400 hover:underline"
                >
                  Open article →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
