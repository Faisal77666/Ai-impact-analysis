const DEFAULT_MIN_ENTITIES = Number(process.env.SYNTHETIC_METADATA_MIN_ENTITIES || 100);
const DEFAULT_MAX_ENTITIES = Number(process.env.SYNTHETIC_METADATA_MAX_ENTITIES || 1000);
const DEFAULT_VISIBLE_NODE_CAP = Number(process.env.SYNTHETIC_METADATA_VISIBLE_NODE_CAP || 260);

const ENTITY_TYPES = ['table', 'table', 'table', 'table', 'dashboard', 'pipeline', 'mlmodel'];
const BUSINESS_DOMAINS = ['sales', 'finance', 'marketing', 'risk', 'ops', 'product', 'support'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashString = (input = '') => {
  let hash = 0;
  const text = String(input || 'synthetic-seed');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
};

const createRng = (seedValue) => {
  let seed = seedValue % 2147483647;
  if (seed <= 0) seed += 2147483646;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const pick = (rng, values = []) => {
  if (!values.length) return undefined;
  const idx = Math.floor(rng() * values.length);
  return values[Math.max(0, Math.min(values.length - 1, idx))];
};

const createEntity = (rng, index, forcedType) => {
  const type = forcedType || pick(rng, ENTITY_TYPES) || 'table';
  const domain = pick(rng, BUSINESS_DOMAINS) || 'analytics';
  const usageRoll = rng();
  const criticalRoll = rng();

  const usageSummary = usageRoll > 0.84 ? 'high' : usageRoll > 0.45 ? 'medium' : 'low';
  const isCritical = criticalRoll > 0.88;

  const prefixByType = {
    table: 'tbl',
    dashboard: 'dash',
    pipeline: 'pipe',
    mlmodel: 'ml'
  };

  const slugByType = {
    table: 'fact',
    dashboard: 'kpi',
    pipeline: 'etl',
    mlmodel: 'model'
  };

  const prefix = prefixByType[type] || 'asset';
  const slug = slugByType[type] || 'entity';
  const name = `${prefix}_${domain}_${slug}_${String(index).padStart(4, '0')}`;
  const tags = [];
  if (isCritical) tags.push('business-critical', 'tier1');
  if (usageSummary === 'high') tags.push('high-usage');

  return {
    id: `sim_${name}`,
    type,
    name,
    displayName: name,
    fullyQualifiedName: `synthetic.${domain}.${name}`,
    owner: 'synthetic-owner',
    usageSummary,
    usageScore: Math.round((usageRoll * 1000)) / 10,
    businessCritical: isCritical,
    criticality: isCritical ? 'tier1' : usageSummary === 'high' ? 'tier2' : 'tier3',
    tags
  };
};

const enforceEnterpriseCoverage = (entities = [], rng) => {
  const requiredTypes = ['table', 'dashboard', 'pipeline', 'mlmodel'];
  const covered = new Set(entities.map((entity) => entity.type));

  requiredTypes.forEach((requiredType) => {
    if (covered.has(requiredType)) return;
    const replaceIndex = Math.floor(rng() * entities.length);
    entities[replaceIndex] = {
      ...entities[replaceIndex],
      type: requiredType,
      tags: dedupeTags([...(entities[replaceIndex]?.tags || []), 'synthetic'])
    };
    covered.add(requiredType);
  });

  const criticalCount = entities.filter((entity) => entity.businessCritical).length;
  if (criticalCount === 0 && entities.length > 0) {
    const idx = Math.floor(rng() * entities.length);
    entities[idx] = {
      ...entities[idx],
      businessCritical: true,
      criticality: 'tier1',
      tags: dedupeTags([...(entities[idx]?.tags || []), 'business-critical', 'tier1'])
    };
  }

  const highUsageCount = entities.filter((entity) => entity.usageSummary === 'high').length;
  if (highUsageCount === 0 && entities.length > 0) {
    const idx = Math.floor(rng() * entities.length);
    entities[idx] = {
      ...entities[idx],
      usageSummary: 'high',
      tags: dedupeTags([...(entities[idx]?.tags || []), 'high-usage'])
    };
  }

  return entities;
};

const dedupeTags = (tags = []) => [...new Set(tags.filter(Boolean))];

const normalizeRef = (entity) => ({
  id: entity.id,
  type: entity.type,
  name: entity.name,
  displayName: entity.displayName,
  fullyQualifiedName: entity.fullyQualifiedName,
  owner: entity.owner,
  usageSummary: entity.usageSummary,
  usageScore: entity.usageScore,
  businessCritical: Boolean(entity.businessCritical),
  criticality: entity.criticality,
  tags: Array.isArray(entity.tags) ? [...entity.tags] : []
});

const buildSyntheticEnterpriseExtension = ({
  targetEntity,
  catalogSize = 0,
  realEdgeCount = 0,
  minEntities = DEFAULT_MIN_ENTITIES,
  maxEntities = DEFAULT_MAX_ENTITIES,
  maxVisibleNodes = DEFAULT_VISIBLE_NODE_CAP,
  maxDepth = 8
} = {}) => {
  if (!targetEntity?.id) {
    return {
      applied: false,
      reason: 'missing-target',
      nodes: [],
      downstreamEdges: [],
      upstreamEdges: [],
      simulatedEntityCount: 0,
      simulatedVisibleNodeCount: 0,
      simulatedEdgeCount: 0,
      nodeIds: [],
      edgeKeys: new Set()
    };
  }

  const safeMin = clamp(Number(minEntities) || 100, 100, 1000);
  const safeMax = clamp(Number(maxEntities) || 1000, safeMin, 1000);

  const scarcityFactor = clamp((160 - Number(catalogSize || 0)) / 160, 0, 1);
  const lineageGapFactor = clamp((12 - Number(realEdgeCount || 0)) / 12, 0, 1);
  const blend = clamp((scarcityFactor * 0.65) + (lineageGapFactor * 0.35), 0, 1);

  const targetCount = clamp(
    Math.round(safeMin + ((safeMax - safeMin) * blend)),
    safeMin,
    safeMax
  );

  const seed = hashString(`${targetEntity.id}|${targetEntity.fullyQualifiedName || targetEntity.name}|${catalogSize}|${realEdgeCount}`);
  const rng = createRng(seed);

  const syntheticEntities = [];
  for (let i = 1; i <= targetCount; i += 1) {
    syntheticEntities.push(createEntity(rng, i));
  }
  enforceEnterpriseCoverage(syntheticEntities, rng);

  const ids = syntheticEntities.map((entity) => entity.id);
  const entityMap = new Map(syntheticEntities.map((entity) => [entity.id, entity]));
  const edgePairs = [];

  const pushEdge = (from, to) => {
    if (!from || !to || from === to) return;
    edgePairs.push([from, to]);
  };

  const upstreamCount = clamp(Math.floor(targetCount * 0.03), 3, 14);
  for (let i = 0; i < upstreamCount; i += 1) {
    pushEdge(ids[i], targetEntity.id);
  }

  const bootstrapFanout = clamp(Math.floor(targetCount * 0.05), 8, 36);
  for (let i = upstreamCount; i < Math.min(ids.length, upstreamCount + bootstrapFanout); i += 1) {
    pushEdge(targetEntity.id, ids[i]);
  }

  // Build a pseudo-enterprise DAG with cross-domain relationships.
  for (let i = 0; i < ids.length; i += 1) {
    const fromId = ids[i];
    const edgeBudget = 1 + Math.floor(rng() * 3);
    for (let e = 0; e < edgeBudget; e += 1) {
      const jump = 1 + Math.floor(rng() * 24);
      const toIndex = i + jump;
      if (toIndex >= ids.length) continue;
      pushEdge(fromId, ids[toIndex]);
    }
  }

  // Additional random business links for dashboards/pipelines/models.
  const typedPools = {
    dashboard: syntheticEntities.filter((entity) => entity.type === 'dashboard').map((entity) => entity.id),
    pipeline: syntheticEntities.filter((entity) => entity.type === 'pipeline').map((entity) => entity.id),
    mlmodel: syntheticEntities.filter((entity) => entity.type === 'mlmodel').map((entity) => entity.id),
    table: syntheticEntities.filter((entity) => entity.type === 'table').map((entity) => entity.id)
  };

  const tablePool = typedPools.table;
  const appendTypedEdges = (targetType, count, fromTarget = false) => {
    const pool = typedPools[targetType] || [];
    for (let i = 0; i < count; i += 1) {
      const toId = pick(rng, pool);
      const fromId = fromTarget ? targetEntity.id : pick(rng, tablePool);
      pushEdge(fromId, toId);
    }
  };

  appendTypedEdges('dashboard', clamp(Math.floor(targetCount * 0.04), 5, 25));
  appendTypedEdges('pipeline', clamp(Math.floor(targetCount * 0.04), 5, 25));
  appendTypedEdges('mlmodel', clamp(Math.floor(targetCount * 0.02), 3, 14));
  appendTypedEdges('dashboard', clamp(Math.floor(targetCount * 0.01), 2, 8), true);
  appendTypedEdges('pipeline', clamp(Math.floor(targetCount * 0.01), 2, 8), true);

  const dedupEdgeKey = new Set();
  const uniqueEdges = edgePairs.filter(([from, to]) => {
    const key = `${from}->${to}`;
    if (dedupEdgeKey.has(key)) return false;
    dedupEdgeKey.add(key);
    return true;
  });

  const adjacency = new Map();
  const reverseAdjacency = new Map();
  uniqueEdges.forEach(([from, to]) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);

    if (!reverseAdjacency.has(to)) reverseAdjacency.set(to, []);
    reverseAdjacency.get(to).push(from);
  });

  const reachable = new Set([targetEntity.id]);
  const queue = [{ id: targetEntity.id, depth: 0 }];
  while (queue.length && reachable.size <= maxVisibleNodes) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;

    const nextNodes = adjacency.get(current.id) || [];
    nextNodes.forEach((next) => {
      if (reachable.has(next)) return;
      reachable.add(next);
      if (reachable.size <= maxVisibleNodes) {
        queue.push({ id: next, depth: current.depth + 1 });
      }
    });
  }

  const dependencyReachable = new Set();
  const reverseQueue = [{ id: targetEntity.id, depth: 0 }];
  while (reverseQueue.length && dependencyReachable.size <= Math.floor(maxVisibleNodes * 0.35)) {
    const current = reverseQueue.shift();
    if (!current || current.depth >= Math.min(maxDepth, 4)) continue;

    const prevNodes = reverseAdjacency.get(current.id) || [];
    prevNodes.forEach((prev) => {
      if (dependencyReachable.has(prev)) return;
      dependencyReachable.add(prev);
      reverseQueue.push({ id: prev, depth: current.depth + 1 });
    });
  }

  const visibleNodeIds = new Set([...reachable, ...dependencyReachable]);

  const downstreamEdges = uniqueEdges
    .filter(([from, to]) => reachable.has(from) && reachable.has(to))
    .map(([from, to]) => ({
      fromEntity: normalizeRef(from === targetEntity.id ? targetEntity : entityMap.get(from)),
      toEntity: normalizeRef(to === targetEntity.id ? targetEntity : entityMap.get(to))
    }));

  const upstreamEdges = uniqueEdges
    .filter(([from, to]) => dependencyReachable.has(from) && (to === targetEntity.id || reachable.has(to)))
    .map(([from, to]) => ({
      fromEntity: normalizeRef(from === targetEntity.id ? targetEntity : entityMap.get(from)),
      toEntity: normalizeRef(to === targetEntity.id ? targetEntity : entityMap.get(to))
    }));

  const nodes = [...visibleNodeIds]
    .filter((id) => id !== targetEntity.id)
    .map((id) => entityMap.get(id))
    .filter(Boolean)
    .map((entity) => normalizeRef(entity));

  const edgeKeys = new Set([
    ...downstreamEdges.map((edge) => `${edge.fromEntity?.id || ''}->${edge.toEntity?.id || ''}`),
    ...upstreamEdges.map((edge) => `${edge.fromEntity?.id || ''}->${edge.toEntity?.id || ''}`)
  ]);

  const typeBreakdown = syntheticEntities.reduce((acc, entity) => {
    const type = entity.type || 'table';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const highUsageEntityCount = syntheticEntities.filter((entity) => entity.usageSummary === 'high').length;
  const businessCriticalEntityCount = syntheticEntities.filter((entity) => entity.businessCritical).length;

  return {
    applied: true,
    reason: 'limited-openmetadata',
    nodes,
    downstreamEdges,
    upstreamEdges,
    simulatedEntityCount: syntheticEntities.length,
    simulatedVisibleNodeCount: nodes.length,
    simulatedEdgeCount: edgeKeys.size,
    highUsageEntityCount,
    businessCriticalEntityCount,
    typeBreakdown,
    nodeIds: nodes.map((node) => node.id),
    edgeKeys
  };
};

module.exports = {
  buildSyntheticEnterpriseExtension
};
