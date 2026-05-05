import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeTypes,
  useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api, type GraphData } from '../api.ts';

// ─── Custom node renderers ────────────────────────────────────────────────────

function EntityNode({ data }: { data: { label: string; type: string } }) {
  return (
    <div className="react-flow__node-entity">
      <div className="text-[10px] text-indigo-400 mb-0.5">{data.type}</div>
      <div className="font-semibold leading-tight">{data.label}</div>
    </div>
  );
}

function ArticleNode({ data }: { data: { label: string; source: string; url: string } }) {
  return (
    <div className="react-flow__node-article">
      <div className="text-[10px] text-sky-400 mb-0.5">{data.source}</div>
      <div className="leading-tight line-clamp-2">{data.label}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = { entity: EntityNode, article: ArticleNode };

const EDGE_COLORS: Record<string, string> = {
  co_mention: '#64748b',
  sentiment_divergence: '#ef4444',
  temporal_spike: '#f59e0b',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFlow(data: GraphData, focusEntityId?: string): { nodes: Node[]; edges: Edge[] } {
  // Deterministic layout: entities in a circle, articles spread around them
  const entityIds = data.nodes.filter(n => n.nodeType === 'entity').map(n => n.id);
  const articleIds = data.nodes.filter(n => n.nodeType === 'article').map(n => n.id);

  const entityPos = new Map<string, { x: number; y: number }>();
  entityIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / entityIds.length;
    entityPos.set(id, { x: 400 + Math.cos(angle) * 300, y: 300 + Math.sin(angle) * 300 });
  });

  const articlePos = new Map<string, { x: number; y: number }>();
  const connectedEntities = new Map<string, string>(); // articleId → entityId
  data.edges.forEach(e => {
    connectedEntities.set(e.source, e.entityId);
    connectedEntities.set(e.target, e.entityId);
  });

  articleIds.forEach((id, i) => {
    const entityId = connectedEntities.get(id);
    const base = entityId && entityPos.get(entityId) ? entityPos.get(entityId)! : { x: 400, y: 300 };
    const angle = (2 * Math.PI * i) / articleIds.length;
    articlePos.set(id, { x: base.x + Math.cos(angle) * 120, y: base.y + Math.sin(angle) * 120 });
  });

  const nodes: Node[] = data.nodes.map(n => ({
    id: n.id,
    type: n.nodeType,
    position: n.nodeType === 'entity'
      ? (entityPos.get(n.id) ?? { x: 0, y: 0 })
      : (articlePos.get(n.id) ?? { x: 0, y: 0 }),
    data: { label: n.label, type: n.type, source: n.source, url: n.url },
    selected: n.id === focusEntityId,
  }));

  const edges: Edge[] = data.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.connectionType,
    animated: e.connectionType === 'sentiment_divergence',
    style: {
      stroke: EDGE_COLORS[e.connectionType] ?? '#64748b',
      strokeWidth: Math.max(1, e.strength * 3),
      opacity: 0.7,
    },
    data: { connectionType: e.connectionType, strength: e.strength },
  }));

  return { nodes, edges };
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  hours: number;
  connectionType?: string;
  focusEntityId?: string;
  onNodeClick?: (node: Node) => void;
};

export function GraphView({ hours, connectionType, focusEntityId, onNodeClick }: Props) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.graph(hours, connectionType)
      .then(data => {
        setGraphData(data);
        const { nodes: n, edges: e } = toFlow(data, focusEntityId);
        setNodes(n);
        setEdges(e);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [hours, connectionType, focusEntityId]);

  const handleNodeClick = useCallback((_evt: MouseEvent, node: Node) => {
    onNodeClick?.(node);
    if (node.data?.url) window.open(node.data.url as string, '_blank');
  }, [onNodeClick]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-slate-500">Loading graph…</div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center text-red-400">Error: {error}</div>
  );
  if (!graphData || graphData.nodes.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-8 text-center">
      <span className="text-4xl">🕸️</span>
      <p>No connections found yet.</p>
      <p className="text-sm">Click <strong className="text-white">Enrich</strong> to extract entities from articles, then <strong className="text-white">Compute Graph</strong> to find connections.</p>
    </div>
  );

  return (
    <div className="flex-1 relative">
      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 bg-slate-900/90 border border-slate-700 rounded p-2 text-xs flex flex-col gap-1">
        {[
          { color: '#64748b', label: 'Co-mention' },
          { color: '#ef4444', label: 'Diverging sentiment' },
          { color: '#f59e0b', label: 'Temporal spike' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-4 h-0.5" style={{ background: color }} />
            <span className="text-slate-300">{label}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-slate-700 pt-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-900 border border-indigo-500" />
            <span className="text-slate-300">Entity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-sky-900 border border-sky-500" />
            <span className="text-slate-300">Article</span>
          </div>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Background color="#1e293b" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={n => n.type === 'entity' ? '#6366f1' : '#0ea5e9'}
          maskColor="rgba(15,23,42,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
