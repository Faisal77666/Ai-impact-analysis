import { useMemo, useState } from 'react';
import dagre from 'dagre';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

const NODE_WIDTH = 248;
const NODE_HEIGHT = 92;

const severityColor = {
  CRITICAL: '#dc2626',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#16a34a',
  UNKNOWN: '#64748b'
};

const nodeTypeStyle = {
  table: '#3b82f6',
  dashboard: '#8b5cf6',
  pipeline: '#f97316',
  mlmodel: '#10b981',
  topic: '#06b6d4',
  unknown: '#64748b'
};

const normalizeRef = (value = '') => String(value).trim().toLowerCase();

const normalizeType = (value = '') => {
  const key = String(value || '').trim().toLowerCase();
  if (nodeTypeStyle[key]) return key;
  if (key === 'metrics') return 'dashboard';
  return 'unknown';
};

const formatTypeLabel = (value = '') => {
  const key = normalizeType(value);
  if (key === 'mlmodel') return 'ML Model';
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const parseSchema = (fqn = '') => {
  const parts = String(fqn).split('.').filter(Boolean);
  if (parts.length < 2) return fqn || 'unknown';
  return parts.slice(0, -1).join('.');
};

const deriveTableBadge = (name = '') => {
  const n = String(name).toLowerCase();
  if (n.startsWith('fact_') || n.includes('.fact_') || n.includes('fact')) return 'FACT';
  if (n.startsWith('dim_') || n.includes('.dim_') || n.includes('dim')) return 'DIM';
  if (n.startsWith('stg_') || n.includes('.stg_') || n.includes('staging')) return 'STAGING';
  return 'TABLE';
};

const findOwner = (node = {}) => {
  if (typeof node.owner === 'string' && node.owner.trim()) return node.owner.trim();
  if (node.owner?.name) return node.owner.name;
  if (node.owner?.displayName) return node.owner.displayName;
  if (node.owner?.id) return node.owner.id;
  return 'Unknown';
};

const buildNodeRefMap = (graphNodes = []) => {
  const map = new Map();
  graphNodes.forEach((node) => {
    const refs = [node.id, node.name, node.label, node.fqn].filter(Boolean);
    refs.forEach((ref) => map.set(normalizeRef(ref), node.id));
  });
  return map;
};

const buildIdToNameMap = (graphNodes = []) => {
  const map = new Map();
  graphNodes.forEach((node) => {
    map.set(String(node.id), node.label || node.name || node.fqn || String(node.id));
  });
  return map;
};

const computeAutoLayout = (graphNodes = [], graphEdges = []) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 95, nodesep: 58, marginx: 24, marginy: 24 });

  graphNodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  graphEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positions = new Map();
  graphNodes.forEach((node) => {
    const p = g.node(node.id);
    if (!p) {
      positions.set(node.id, { x: 0, y: 0 });
      return;
    }

    positions.set(node.id, {
      x: p.x - NODE_WIDTH / 2,
      y: p.y - NODE_HEIGHT / 2
    });
  });

  return positions;
};

const buildGraphMaps = (graphEdges = []) => {
  const parents = new Map();
  const children = new Map();

  graphEdges.forEach((edge) => {
    if (!parents.has(edge.target)) parents.set(edge.target, []);
    parents.get(edge.target).push(edge.source);

    if (!children.has(edge.source)) children.set(edge.source, []);
    children.get(edge.source).push(edge.target);
  });

  return { parents, children };
};

const computeUpstreamSelection = (selectedId, graphEdges = []) => {
  if (!selectedId) {
    return {
      nodeIds: new Set(),
      edgeIds: new Set(),
      upstreamIds: new Set()
    };
  }

  const { parents } = buildGraphMaps(graphEdges);
  const upstreamIds = new Set();
  const selectedNodeIds = new Set([selectedId]);
  const queue = [selectedId];
  const visited = new Set([selectedId]);

  while (queue.length) {
    const current = queue.shift();
    const directParents = parents.get(current) || [];
    directParents.forEach((p) => {
      if (visited.has(p)) return;
      visited.add(p);
      upstreamIds.add(p);
      selectedNodeIds.add(p);
      queue.push(p);
    });
  }

  const edgeIds = new Set();
  graphEdges.forEach((edge) => {
    if (!selectedNodeIds.has(edge.source) || !selectedNodeIds.has(edge.target)) return;
    edgeIds.add(`${edge.source}->${edge.target}`);
  });

  return {
    nodeIds: selectedNodeIds,
    edgeIds,
    upstreamIds
  };
};

const computeReachCount = (startId, map) => {
  if (!startId) return 0;
  const queue = [startId];
  const visited = new Set([startId]);

  while (queue.length) {
    const current = queue.shift();
    const next = map.get(current) || [];
    next.forEach((id) => {
      if (visited.has(id)) return;
      visited.add(id);
      queue.push(id);
    });
  }

  return Math.max(visited.size - 1, 0);
};

const mapPathWithNames = (path = [], idToName = new Map()) => {
  if (!Array.isArray(path)) return [];
  return path.map((item) => {
    const key = String(item);
    return idToName.get(key) || item;
  });
};

const nodeEmojiByType = {
  table: '📊',
  dashboard: '📈',
  pipeline: '⚙️',
  mlmodel: '🧠',
  topic: '🧩',
  unknown: '🔹'
};

const parseRiskContribution = (selectedNode, explainability = []) => {
  if (!selectedNode || !Array.isArray(explainability)) return 0;

  const matchKeys = [
    selectedNode.fqn,
    selectedNode.name,
    selectedNode.label,
    selectedNode.id
  ].filter(Boolean).map((v) => String(v).toLowerCase());

  return explainability.reduce((acc, item) => {
    const source = String(item.entity || item.asset || '').toLowerCase();
    const matched = matchKeys.some((k) => source.includes(k));
    if (!matched) return acc;
    const score = Number(item.scoreContribution ?? item.points ?? item.impactPoints ?? 0);
    return acc + (Number.isFinite(score) ? score : 0);
  }, 0);
};

const NodeGlyph = ({ type = 'unknown' }) => {
  if (type === 'table') {
    return (
      <svg className="node-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" opacity="0.2" />
        <path d="M4 9h16M4 13h16M9 5v14" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    );
  }

  if (type === 'dashboard') {
    return (
      <svg className="node-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18h14M7 16V10M12 16V7M17 16v-4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    );
  }

  if (type === 'pipeline') {
    return (
      <svg className="node-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="12" r="2" fill="currentColor" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <circle cx="19" cy="12" r="2" fill="currentColor" />
        <path d="M7 12h3m4 0h3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'mlmodel') {
    return (
      <svg className="node-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="8" r="2" fill="currentColor" />
        <circle cx="16" cy="8" r="2" fill="currentColor" />
        <circle cx="12" cy="15" r="2" fill="currentColor" />
        <path d="M10 8h4m-5 1.3 2.2 4m3.6-4-2.2 4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  return (
    <svg className="node-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" opacity="0.25" />
      <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
};

const buildFlowNode = ({ node, position, rootId, selectedId, isDimmed }) => {
  const typeKey = normalizeType(node.type);
  const color = nodeTypeStyle[typeKey] || nodeTypeStyle.unknown;
  const isSelected = selectedId === node.id;
  const isRoot = node.id === rootId;
  const title = node.label || node.name || node.id;
  const icon = nodeEmojiByType[typeKey] || nodeEmojiByType.unknown;

  return {
    id: node.id,
    data: {
      raw: node,
      title,
      typeLabel: formatTypeLabel(typeKey),
      owner: findOwner(node),
      typeKey,
      color,
      label: (
        <div className="lineage-node-card">
          <div className="lineage-node-title">{title}</div>
          <div className="lineage-node-footer">
            <span className="lineage-node-icon" style={{ color, background: `${color}26` }}>
              {icon}
            </span>
            <span className="lineage-node-type">{formatTypeLabel(typeKey)}</span>
          </div>
        </div>
      )
    },
    position,
    sourcePosition: 'right',
    targetPosition: 'left',
    draggable: false,
    selectable: true,
    connectable: false,
    className: 'lineage-node',
    style: {
      width: NODE_WIDTH,
      border: `2px solid ${isRoot ? '#0f172a' : color}`,
      borderRadius: 14,
      background: '#ffffff',
      padding: 0,
      opacity: isDimmed ? 0.2 : 1,
      transform: isSelected ? 'translateY(-2px)' : 'none',
      boxShadow: isSelected
        ? '0 0 0 3px rgba(59,130,246,0.22), 0 16px 32px rgba(15,23,42,0.2)'
        : '0 8px 22px rgba(15,23,42,0.12)',
      transition: 'opacity 180ms ease, box-shadow 180ms ease, transform 180ms ease'
    },
    zIndex: isSelected ? 3 : 1
  };
};

function DependencyFlow({
  graph,
  affectedAssets = [],
  dependencyAssets = [],
  riskLevel = 'LOW',
  riskScore = 0,
  confidenceScore = 0,
  explainability = [],
  dependencyPath = [],
  loading = false,
  fullscreen = false
}) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoverNodeTip, setHoverNodeTip] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null);
  const [flowInstance, setFlowInstance] = useState(null);

  const rootId = useMemo(() => {
    if (graph?.rootId) return graph.rootId;
    const sourceSet = new Set((graph?.edges || []).map((e) => e.source));
    const targetSet = new Set((graph?.edges || []).map((e) => e.target));
    const roots = [...sourceSet].filter((id) => !targetSet.has(id));
    if (roots.length > 0) return roots[0];
    return graph?.nodes?.[0]?.id;
  }, [graph]);

  const {
    nodes,
    edges,
    graphMaps,
    idToName,
    namedPaths,
    selectedScope
  } = useMemo(() => {
    const graphNodes = graph?.nodes || [];
    const graphEdges = graph?.edges || [];
    const selectedId = selectedNode?.id || null;

    const layoutPositions = computeAutoLayout(graphNodes, graphEdges);
    const graphMapsLocal = buildGraphMaps(graphEdges);
    const selectedScopeLocal = computeUpstreamSelection(selectedId, graphEdges);
    const hasSelection = Boolean(selectedId);

    const refMap = buildNodeRefMap(graphNodes);
    const idNameMap = buildIdToNameMap(graphNodes);

    const impactedPathEdges = new Set();
    dependencyPath.forEach((row) => {
      const path = Array.isArray(row.path) ? row.path : [];
      for (let i = 0; i < path.length - 1; i += 1) {
        const srcId = refMap.get(normalizeRef(path[i]));
        const tgtId = refMap.get(normalizeRef(path[i + 1]));
        if (srcId && tgtId) impactedPathEdges.add(`${srcId}->${tgtId}`);
      }
    });

    const flowNodes = graphNodes.map((node) => {
      const isDimmed = hasSelection && !selectedScopeLocal.nodeIds.has(node.id);
      return buildFlowNode({
        node,
        position: layoutPositions.get(node.id) || { x: 0, y: 0 },
        rootId,
        selectedId,
        isDimmed
      });
    });

    const flowEdges = graphEdges.map((edge) => {
      const edgeKey = `${edge.source}->${edge.target}`;
      const inSelectedPath = selectedScopeLocal.edgeIds.has(edgeKey);
      const inImpactedPath = impactedPathEdges.has(edgeKey);
      const hovered = hoverEdge && (hoverEdge.id === edge.id || (hoverEdge.source === edge.source && hoverEdge.target === edge.target));
      const isDimmed = hasSelection && !inSelectedPath;

      let stroke = '#cbd5e1';
      if (inImpactedPath || inSelectedPath) stroke = '#ef4444';
      if (hovered) stroke = '#0f766e';

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: hovered || inSelectedPath,
        className: inSelectedPath ? 'impact-edge' : isDimmed ? 'dim-edge' : '',
        style: {
          stroke,
          strokeWidth: inSelectedPath || inImpactedPath ? 3.1 : 1.8,
          opacity: isDimmed ? 0.2 : 1,
          transition: 'opacity 180ms ease, stroke 180ms ease, stroke-width 180ms ease'
        },
        data: edge,
        label: inSelectedPath ? 'selected-path' : edge.direction || 'depends-on'
      };
    });

    const pathsWithNames = dependencyPath.map((row) => ({
      ...row,
      entityName: idNameMap.get(String(row.entity)) || row.entity,
      path: mapPathWithNames(row.path || [], idNameMap)
    }));

    return {
      nodes: flowNodes,
      edges: flowEdges,
      graphMaps: graphMapsLocal,
      idToName: idNameMap,
      namedPaths: pathsWithNames,
      selectedScope: selectedScopeLocal
    };
  }, [graph, rootId, selectedNode, hoverEdge, dependencyPath]);

  const selectedNodeStats = useMemo(() => {
    if (!selectedNode) {
      return {
        upstreamCount: 0,
        downstreamCount: 0,
        dependencies: 0,
        riskContribution: 0
      };
    }

    const upstreamCount = computeReachCount(selectedNode.id, graphMaps.parents);
    const downstreamCount = computeReachCount(selectedNode.id, graphMaps.children);
    const dependencies = (graphMaps.parents.get(selectedNode.id)?.length || 0) + (graphMaps.children.get(selectedNode.id)?.length || 0);

    return {
      upstreamCount,
      downstreamCount,
      dependencies,
      riskContribution: parseRiskContribution(selectedNode, explainability)
    };
  }, [selectedNode, graphMaps, explainability]);

  const onResetSelection = () => {
    setSelectedNode(null);
    setHoverEdge(null);
    setHoverNodeTip(null);
  };

  if (loading) {
    return (
      <section className={`flow-wrap fade-in ${fullscreen ? 'flow-wrap-fullscreen' : ''}`}>
        <div className="panel">
          <div className="panel-header">Dependency Graph</div>
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ width: '30%' }} />
            <div className="skeleton" style={{ width: '92%', height: 20 }} />
            <div className="skeleton" style={{ width: '88%', height: 20 }} />
            <div className="skeleton" style={{ width: '100%', height: 460 }} />
          </div>
        </div>
        <aside className="panel">
          <div className="panel-header">Node Details</div>
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ width: '70%' }} />
            <div className="skeleton" style={{ width: '100%', height: 140 }} />
            <div className="skeleton" style={{ width: '100%', height: 140 }} />
          </div>
        </aside>
      </section>
    );
  }

  return (
    <section className={`flow-wrap fade-in ${fullscreen ? 'flow-wrap-fullscreen' : ''}`}>
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Dependency Graph</strong>
          <span style={{ color: severityColor[riskLevel] || '#64748b', fontWeight: 700 }}>{riskLevel}</span>
        </div>

        <div className="panel-body" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <div className="chip-group">
            <span className="chip">Selected Path: red</span>
            <span className="chip">Normal: gray</span>
            <button type="button" className="button-muted" onClick={() => flowInstance?.fitView({ padding: 0.18, duration: 450 })}>
              Fit View
            </button>
            <button type="button" className="button-muted" onClick={onResetSelection}>
              Reset Selection
            </button>
          </div>
        </div>

        <div style={{ height: fullscreen ? 'calc(100vh - 180px)' : 620, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            onInit={setFlowInstance}
            onNodeClick={(_, node) => setSelectedNode(node.data?.raw || null)}
            onNodeMouseEnter={(event, node) => {
              const nodeId = node.id;
              const dependencies = (graphMaps.parents.get(nodeId)?.length || 0) + (graphMaps.children.get(nodeId)?.length || 0);
              const upstream = computeReachCount(nodeId, graphMaps.parents);
              const downstream = computeReachCount(nodeId, graphMaps.children);
              setHoverNodeTip({
                x: event.clientX,
                y: event.clientY,
                name: node.data?.title || node.id,
                type: node.data?.typeLabel || 'Unknown',
                owner: node.data?.owner || 'Unknown',
                dependencies,
                upstream,
                downstream
              });
            }}
            onNodeMouseMove={(event) => {
              setHoverNodeTip((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  x: event.clientX,
                  y: event.clientY
                };
              });
            }}
            onNodeMouseLeave={() => {
              setHoverNodeTip(null);
              setHoverEdge(null);
            }}
            onEdgeMouseEnter={(_, edge) => setHoverEdge(edge.data || edge)}
            onEdgeMouseLeave={() => setHoverEdge(null)}
            onPaneClick={() => {}}
            nodesDraggable={false}
            elementsSelectable
            panOnScroll
            panOnDrag
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const t = normalizeType(n?.data?.raw?.type);
                return nodeTypeStyle[t] || nodeTypeStyle.unknown;
              }}
              nodeStrokeColor="#0f172a"
              maskColor="rgba(15,23,42,0.08)"
            />
            <Controls showInteractive={false} />
            <Background gap={16} size={1} color="#e2e8f0" />
          </ReactFlow>

          {hoverNodeTip ? (
            <div className="lineage-tooltip" style={{ left: hoverNodeTip.x + 14, top: hoverNodeTip.y + 14 }}>
              <div><strong>{hoverNodeTip.name}</strong></div>
              <div>Type: {hoverNodeTip.type}</div>
              <div>Owner: {hoverNodeTip.owner}</div>
              <div>Upstream: {hoverNodeTip.upstream}</div>
              <div>Downstream: {hoverNodeTip.downstream}</div>
              <div>Dependencies: {hoverNodeTip.dependencies}</div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="panel" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div className="panel-header">Node Details</div>
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <div><strong>Risk Score:</strong> {riskScore}</div>
            <div><strong>Risk Level:</strong> <span style={{ color: severityColor[riskLevel] || '#64748b' }}>{riskLevel}</span></div>
            <div><strong>Confidence:</strong> {confidenceScore}</div>
            <div><strong>Affected Assets:</strong> {affectedAssets.length}</div>
            <div><strong>Dependency Assets:</strong> {dependencyAssets.length}</div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <strong>Dependency Paths (Named)</strong>
            {!namedPaths.length ? (
              <p style={{ margin: '8px 0 0 0' }}>No path data available.</p>
            ) : (
              <ul style={{ margin: '8px 0 0 18px', padding: 0, display: 'grid', gap: 6 }}>
                {namedPaths.slice(0, 8).map((row, idx) => (
                  <li key={`${idx}-${row.entityName}`}>
                    <strong>{row.entityName}:</strong> {Array.isArray(row.path) ? row.path.join(' -> ') : 'n/a'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <strong>Node Metadata</strong>
            {!selectedNode ? (
              <p style={{ margin: '8px 0 0 0' }}>Click a node to inspect full metadata and highlight its upstream impact path.</p>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div><strong>Full Name:</strong> {selectedNode.fqn || selectedNode.label || selectedNode.name}</div>
                <div><strong>Type:</strong> {formatTypeLabel(selectedNode.type || 'unknown')}</div>
                <div><strong>Owner:</strong> {findOwner(selectedNode)}</div>
                <div><strong>Upstream Count:</strong> {selectedNodeStats.upstreamCount}</div>
                <div><strong>Downstream Count:</strong> {selectedNodeStats.downstreamCount}</div>
                <div><strong>Risk Contribution:</strong> {selectedNodeStats.riskContribution}</div>
                <div><strong>Direct Dependencies:</strong> {selectedNodeStats.dependencies}</div>
                {String(selectedNode.type || '').toLowerCase() === 'table' ? (
                  <>
                    <div><strong>Schema:</strong> {parseSchema(selectedNode.fqn)}</div>
                    <div><strong>Badge:</strong> {deriveTableBadge(selectedNode.label || selectedNode.name)}</div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <strong>Hovered Edge</strong>
            {!hoverEdge ? (
              <p style={{ margin: '8px 0 0 0' }}>Hover an edge to inspect relationship metadata.</p>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div><strong>Source:</strong> {idToName.get(String(hoverEdge.source)) || hoverEdge.source}</div>
                <div><strong>Target:</strong> {idToName.get(String(hoverEdge.target)) || hoverEdge.target}</div>
                <div><strong>Direction:</strong> {hoverEdge.direction || 'depends-on'}</div>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
            <strong>Selected Path Coverage</strong>
            {!selectedNode ? (
              <p style={{ margin: '8px 0 0 0' }}>No node selected.</p>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div><strong>Highlighted Nodes:</strong> {selectedScope.nodeIds.size}</div>
                <div><strong>Highlighted Edges:</strong> {selectedScope.edgeIds.size}</div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}

export default DependencyFlow;
