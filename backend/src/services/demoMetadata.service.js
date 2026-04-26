const TABLE = 'table';
const DASHBOARD = 'dashboard';
const PIPELINE = 'pipeline';
const MLMODEL = 'mlmodel';

const DEMO_TABLES = [
  {
    id: 'tbl_raw_orders',
    type: TABLE,
    name: 'raw_orders',
    displayName: 'raw_orders',
    fullyQualifiedName: 'demo.sales.raw_orders',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['business-critical']
  },
  {
    id: 'tbl_user_profiles',
    type: TABLE,
    name: 'user_profiles',
    displayName: 'user_profiles',
    fullyQualifiedName: 'demo.sales.user_profiles',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['pii']
  },
  {
    id: 'tbl_orders_cleaned',
    type: TABLE,
    name: 'orders_cleaned',
    displayName: 'orders_cleaned',
    fullyQualifiedName: 'demo.sales.orders_cleaned',
    usageSummary: 'medium',
    criticality: 'tier2',
    tags: ['trusted']
  },
  {
    id: 'tbl_orders_summary',
    type: TABLE,
    name: 'orders_summary',
    displayName: 'orders_summary',
    fullyQualifiedName: 'demo.analytics.orders_summary',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['core-metric']
  },
  {
    id: 'tbl_sales_metrics',
    type: TABLE,
    name: 'sales_metrics',
    displayName: 'sales_metrics',
    fullyQualifiedName: 'demo.analytics.sales_metrics',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['business-critical']
  },
  {
    id: 'tbl_temp_logs_table',
    type: TABLE,
    name: 'temp_logs_table',
    displayName: 'temp_logs_table',
    fullyQualifiedName: 'demo.ops.temp_logs_table',
    usageSummary: 'low',
    criticality: 'tier3',
    tags: ['ephemeral']
  }
];

const DEMO_DASHBOARDS = [
  {
    id: 'dash_sales_dashboard',
    type: DASHBOARD,
    name: 'sales_dashboard',
    displayName: 'sales_dashboard',
    fullyQualifiedName: 'demo.bi.sales_dashboard',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['executive']
  },
  {
    id: 'dash_revenue_dashboard',
    type: DASHBOARD,
    name: 'revenue_dashboard',
    displayName: 'revenue_dashboard',
    fullyQualifiedName: 'demo.bi.revenue_dashboard',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['finance']
  }
];

const DEMO_PIPELINES = [
  {
    id: 'pipe_orders_etl_pipeline',
    type: PIPELINE,
    name: 'orders_etl_pipeline',
    displayName: 'orders_etl_pipeline',
    fullyQualifiedName: 'demo.pipelines.orders_etl_pipeline',
    usageSummary: 'high',
    criticality: 'tier2',
    tags: ['etl']
  },
  {
    id: 'pipe_daily_metrics_pipeline',
    type: PIPELINE,
    name: 'daily_metrics_pipeline',
    displayName: 'daily_metrics_pipeline',
    fullyQualifiedName: 'demo.pipelines.daily_metrics_pipeline',
    usageSummary: 'medium',
    criticality: 'tier2',
    tags: ['aggregation']
  }
];

const DEMO_MODELS = [
  {
    id: 'ml_churn_prediction_model',
    type: MLMODEL,
    name: 'churn_prediction_model',
    displayName: 'churn_prediction_model',
    fullyQualifiedName: 'demo.ml.churn_prediction_model',
    usageSummary: 'high',
    criticality: 'tier1',
    tags: ['production-ml']
  }
];

const DEMO_EDGES = [
  ['tbl_raw_orders', 'tbl_orders_cleaned'],
  ['tbl_user_profiles', 'tbl_orders_cleaned'],
  ['tbl_orders_cleaned', 'tbl_orders_summary'],
  ['tbl_orders_summary', 'tbl_sales_metrics'],
  ['tbl_orders_summary', 'dash_sales_dashboard'],
  ['tbl_sales_metrics', 'dash_revenue_dashboard'],
  ['tbl_orders_summary', 'ml_churn_prediction_model'],
  ['tbl_orders_cleaned', 'pipe_orders_etl_pipeline'],
  ['tbl_orders_summary', 'pipe_daily_metrics_pipeline']
];

const allEntities = [
  ...DEMO_TABLES,
  ...DEMO_DASHBOARDS,
  ...DEMO_PIPELINES,
  ...DEMO_MODELS
];

const entityById = new Map(allEntities.map((entity) => [entity.id, entity]));
const tableByName = new Map(DEMO_TABLES.map((table) => [table.name.toLowerCase(), table]));

const toRef = (entity) => ({
  id: entity.id,
  type: entity.type,
  name: entity.name,
  displayName: entity.displayName,
  fullyQualifiedName: entity.fullyQualifiedName,
  usageSummary: entity.usageSummary || '',
  criticality: entity.criticality || '',
  tags: Array.isArray(entity.tags) ? [...entity.tags] : []
});

const getDemoTables = () => DEMO_TABLES.map((table) => ({ ...table }));
const getDemoAllAssets = () => allEntities.map((entity) => ({ ...entity }));

const findTableByToken = (token = '') => {
  const normalized = String(token || '').trim().toLowerCase();
  if (!normalized) return null;

  if (tableByName.has(normalized)) return tableByName.get(normalized);

  for (const table of DEMO_TABLES) {
    if (normalized.includes(table.name.toLowerCase())) return table;
    if (normalized === String(table.fullyQualifiedName || '').toLowerCase()) return table;
  }

  return null;
};

const resolveDemoTable = (parsedIntent = {}) => {
  const direct = findTableByToken(parsedIntent.tableFQN);
  if (direct) return direct;
  return findTableByToken(parsedIntent.target || parsedIntent.entity || '');
};

const buildAdjacency = () => {
  const downstream = new Map();
  const upstream = new Map();

  DEMO_EDGES.forEach(([from, to]) => {
    if (!downstream.has(from)) downstream.set(from, []);
    downstream.get(from).push(to);

    if (!upstream.has(to)) upstream.set(to, []);
    upstream.get(to).push(from);
  });

  return { downstream, upstream };
};

const collectEdges = (startId, adjacency, maxHops) => {
  const queue = [{ id: startId, depth: 0 }];
  const seen = new Set([startId]);
  const edgeList = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxHops) continue;

    const nextIds = adjacency.get(current.id) || [];
    nextIds.forEach((nextId) => {
      edgeList.push([current.id, nextId]);
      if (seen.has(nextId)) return;
      seen.add(nextId);
      queue.push({ id: nextId, depth: current.depth + 1 });
    });
  }

  return { edgeList, seen };
};

const getDemoLineageGraph = (tableEntity, maxHops = 8) => {
  const root = tableEntity;
  const { downstream, upstream } = buildAdjacency();

  const downstreamVisit = collectEdges(root.id, downstream, maxHops);
  const upstreamVisit = collectEdges(root.id, upstream, maxHops);

  const nodeIds = new Set([root.id]);
  downstreamVisit.seen.forEach((id) => nodeIds.add(id));
  upstreamVisit.seen.forEach((id) => nodeIds.add(id));

  const nodes = [...nodeIds]
    .map((id) => entityById.get(id))
    .filter(Boolean)
    .map((entity) => toRef(entity));

  const downstreamEdges = downstreamVisit.edgeList
    .map(([from, to]) => ({ fromEntity: toRef(entityById.get(from)), toEntity: toRef(entityById.get(to)) }))
    .filter((edge) => edge.fromEntity?.id && edge.toEntity?.id);

  const contextualUpstream = DEMO_EDGES
    .filter(([from, to]) => nodeIds.has(from) && nodeIds.has(to))
    .map(([from, to]) => [from, to]);

  const upstreamEdges = [...upstreamVisit.edgeList, ...contextualUpstream]
    .map(([from, to]) => ({ fromEntity: toRef(entityById.get(from)), toEntity: toRef(entityById.get(to)) }))
    .filter((edge) => edge.fromEntity?.id && edge.toEntity?.id);

  return {
    entity: toRef(root),
    nodes,
    downstreamEdges,
    upstreamEdges
  };
};

module.exports = {
  getDemoTables,
  getDemoAllAssets,
  getDemoLineageGraph,
  resolveDemoTable
};
