const normalizeType = (value) => {
  const type = String(value || '').toLowerCase();
  if (type.includes('dashboard')) return 'dashboard';
  if (type.includes('pipeline') || type.includes('dbt')) return 'pipeline';
  if (type.includes('metric')) return 'metrics';
  return 'table';
};

const toAsset = (ref) => {
  const id = ref?.id || ref;
  return {
    id: id || '',
    name: ref?.name || ref?.displayName || id || 'unknown',
    fqn: ref?.fullyQualifiedName || ref?.fqn || '',
    type: normalizeType(ref?.type || ref?.entityType),
    owner: ref?.owner?.name || ref?.owner || 'unknown',
    tags: (ref?.tags || []).map((tag) => tag?.tagFQN || tag?.name || String(tag)).filter(Boolean),
    usageSummary: ref?.usageSummary || ''
  };
};

const dedupeAssets = (assets = []) => {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.id}|${asset.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractLineageAssets = (lineage = {}) => {
  const downstreamEdges = lineage.downstreamEdges || [];
  const upstreamEdges = lineage.upstreamEdges || [];

  const affectedAssets = dedupeAssets(downstreamEdges.map((edge) => toAsset(edge?.toEntity)));
  const dependencyAssets = dedupeAssets(upstreamEdges.map((edge) => toAsset(edge?.fromEntity)));

  return {
    affectedAssets,
    dependencyAssets,
    downstreamEdgeCount: downstreamEdges.length,
    upstreamEdgeCount: upstreamEdges.length
  };
};

const traverseLineage = (lineageData = {}) => {
  const nodes = lineageData?.nodes || [];
  const root = lineageData?.entity || null;

  const nodeMap = new Map();
  nodes.forEach((node) => nodeMap.set(node.id, node));
  if (root?.id && !nodeMap.has(root.id)) nodeMap.set(root.id, root);

  const downstreamAdj = new Map();
  const upstreamAdj = new Map();

  (lineageData?.downstreamEdges || []).forEach((edge) => {
    const fromId = edge?.fromEntity?.id || edge?.fromEntity;
    const toId = edge?.toEntity?.id || edge?.toEntity;
    if (!fromId || !toId) return;

    if (!downstreamAdj.has(fromId)) downstreamAdj.set(fromId, []);
    if (!upstreamAdj.has(toId)) upstreamAdj.set(toId, []);

    downstreamAdj.get(fromId).push(toId);
    upstreamAdj.get(toId).push(fromId);
  });

  const bfsCollect = (startId, adjacency) => {
    if (!startId) return [];

    const visited = new Set([startId]);
    const queue = [startId];
    const result = [];

    while (queue.length) {
      const current = queue.shift();
      const neighbors = adjacency.get(current) || [];

      neighbors.forEach((neighborId) => {
        if (visited.has(neighborId)) return;
        visited.add(neighborId);
        queue.push(neighborId);
        if (nodeMap.has(neighborId)) result.push(nodeMap.get(neighborId));
      });
    }

    return result;
  };

  const upstream = bfsCollect(root?.id, upstreamAdj);
  const downstream = bfsCollect(root?.id, downstreamAdj);

  return {
    upstream,
    downstream,
    totalAffected: upstream.length + downstream.length
  };
};

module.exports = {
  extractLineageAssets,
  traverseLineage
};
const normalizeType = (value) => {
  const type = String(value || '').toLowerCase();
  if (type.includes('dashboard')) return 'dashboard';
  if (type.includes('pipeline') || type.includes('dbt')) return 'pipeline';
  if (type.includes('metric')) return 'metrics';
  return 'table';
};

const toAsset = (ref) => {
  const id = ref?.id || ref;
  return {
    id: id || '',
    name: ref?.name || ref?.displayName || id || 'unknown',
    fqn: ref?.fullyQualifiedName || ref?.fqn || '',
    type: normalizeType(ref?.type || ref?.entityType),
    owner: ref?.owner?.name || ref?.owner || 'unknown',
    tags: (ref?.tags || []).map((tag) => tag?.tagFQN || tag?.name || String(tag)).filter(Boolean),
    usageSummary: ref?.usageSummary || ''
  };
};

const dedupeAssets = (assets = []) => {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.id}|${asset.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractLineageAssets = (lineage = {}) => {
  const downstreamEdges = lineage.downstreamEdges || [];
  const upstreamEdges = lineage.upstreamEdges || [];

  const affectedAssets = dedupeAssets(downstreamEdges.map((edge) => toAsset(edge?.toEntity)));
  const dependencyAssets = dedupeAssets(upstreamEdges.map((edge) => toAsset(edge?.fromEntity)));

  return {
    affectedAssets,
    dependencyAssets,
    downstreamEdgeCount: downstreamEdges.length,
    upstreamEdgeCount: upstreamEdges.length
  };
};

module.exports = {
  extractLineageAssets
};
/**
 * Traverse lineage graph via BFS and collect reachable upstream/downstream nodes.
 * @param {Object} lineageData
 * @returns {{upstream: Object[], downstream: Object[], totalAffected: number}}
 */
const traverseLineage = (lineageData) => {
  const nodes = lineageData?.nodes || [];
  const edges = lineageData?.edges || [];
  const root = lineageData?.entity || null;

  const nodeMap = new Map();
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });
  if (root?.id && !nodeMap.has(root.id)) {
    nodeMap.set(root.id, root);
  }

  const upstreamAdj = new Map();
  const downstreamAdj = new Map();

  edges.forEach((edge) => {
    const fromId = edge.fromEntity?.id || edge.fromEntity;
    const toId = edge.toEntity?.id || edge.toEntity;

    if (!downstreamAdj.has(fromId)) downstreamAdj.set(fromId, []);
    if (!upstreamAdj.has(toId)) upstreamAdj.set(toId, []);

    downstreamAdj.get(fromId).push(toId);
    upstreamAdj.get(toId).push(fromId);
  });

  const bfsCollect = (startId, adjacency) => {
    if (!startId) return [];

    const visited = new Set([startId]);
    const queue = [startId];
    const result = [];

    while (queue.length) {
      const current = queue.shift();
      const neighbors = adjacency.get(current) || [];

      neighbors.forEach((neighborId) => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
          if (nodeMap.has(neighborId)) {
            result.push(nodeMap.get(neighborId));
          }
        }
      });
    }

    return result;
  };

  const upstream = bfsCollect(root?.id, upstreamAdj);
  const downstream = bfsCollect(root?.id, downstreamAdj);

  return {
    upstream,
    downstream,
    totalAffected: upstream.length + downstream.length
  };
};

/**
 * Count impacted nodes by normalized asset type.
 * @param {Object[]} nodes
 * @returns {Object}
 */
const getAffectedAssetTypes = (nodes) => {
  return nodes.reduce((acc, node) => {
    const type = String(node.type || node.entityType || 'unknown').toLowerCase();
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
};

module.exports = {
  traverseLineage,
  getAffectedAssetTypes
};
