const normalizeAction = (action = '') => {
  const value = String(action || '').toLowerCase();
  if (value === 'drop' || value === 'delete' || value === 'remove') return 'delete';
  if (value === 'rename') return 'rename';
  return 'update';
};

const uniqueList = (values = []) => [...new Set(values.filter(Boolean))];

const toAssetName = (asset = {}) => {
  return String(asset.name || asset.fqn || asset.id || '').trim();
};

const topAssetNames = (assets = [], limit = 4, typeFilter = null) => {
  const filtered = typeFilter
    ? assets.filter((asset) => String(asset.type || asset.assetType || '').toLowerCase().includes(typeFilter))
    : assets;
  return uniqueList(filtered.map((asset) => toAssetName(asset))).slice(0, limit);
};

const formatAssetInline = (assets = [], fallback = 'downstream assets') => {
  const names = uniqueList(assets).slice(0, 3);
  if (!names.length) return fallback;
  return names.join(', ');
};

const pickPriority = (riskLevel = 'LOW', forceHigh = false) => {
  if (forceHigh) return 'High';
  const level = String(riskLevel || 'LOW').toUpperCase();
  if (level === 'CRITICAL' || level === 'HIGH') return 'High';
  return 'Medium';
};

const extractTopPath = (dependencyPath = []) => {
  if (!Array.isArray(dependencyPath) || dependencyPath.length === 0) return [];
  const withPath = dependencyPath.filter((row) => Array.isArray(row.path) && row.path.length > 1);
  if (!withPath.length) return [];
  withPath.sort((a, b) => (b.path.length || 0) - (a.path.length || 0));
  return withPath[0].path.slice(0, 4);
};

const countByType = (assets = []) => {
  return assets.reduce((acc, asset) => {
    const type = String(asset.type || asset.assetType || '').toLowerCase();
    if (type.includes('dashboard')) acc.dashboard += 1;
    else if (type.includes('pipeline')) acc.pipeline += 1;
    else if (type.includes('ml')) acc.mlmodel += 1;
    else acc.table += 1;
    return acc;
  }, { table: 0, dashboard: 0, pipeline: 0, mlmodel: 0 });
};

const buildCompatibilitySql = ({ action, targetName }) => {
  const safeTarget = String(targetName || 'target_table').replace(/[^a-zA-Z0-9_.]/g, '_');

  if (action === 'rename') {
    return [
      '-- Backward-compatible shim for renamed table',
      `CREATE OR REPLACE VIEW ${safeTarget}_legacy AS`,
      `SELECT * FROM ${safeTarget};`
    ].join('\n');
  }

  if (action === 'delete') {
    return [
      '-- Temporary compatibility view before hard delete',
      `CREATE OR REPLACE VIEW ${safeTarget}_deprecated AS`,
      `SELECT * FROM ${safeTarget}`,
      'WHERE 1 = 0;'
    ].join('\n');
  }

  return [
    '-- Compatibility pattern for column/data-contract updates',
    `CREATE OR REPLACE VIEW ${safeTarget}_compat AS`,
    `SELECT * FROM ${safeTarget};`
  ].join('\n');
};

const buildDbtSql = ({ targetName }) => {
  const safeTarget = String(targetName || 'target_table').replace(/[^a-zA-Z0-9_.]/g, '_');
  return [
    '-- dbt model patch example',
    `WITH source_data AS (SELECT * FROM {{ source('warehouse', '${safeTarget}') }}),`,
    'renamed AS (',
    '  SELECT *',
    '  FROM source_data',
    ')',
    'SELECT * FROM renamed;'
  ].join('\n');
};

const buildQueryPatchSql = ({ targetName, downstreamModel }) => {
  const safeTarget = String(targetName || 'target_table').replace(/[^a-zA-Z0-9_.]/g, '_');
  const safeModel = String(downstreamModel || 'downstream_model').replace(/[^a-zA-Z0-9_.]/g, '_');
  return [
    '-- Query patch for impacted downstream model/report',
    `-- Example target: ${safeModel}`,
    `SELECT *`,
    `FROM ${safeTarget}`,
    '-- Apply renamed/updated column mappings in this query block'
  ].join('\n');
};

const generateRemediationFixes = ({
  action,
  riskLevel,
  targetAsset,
  dependencyPath = [],
  downstreamAssets = [],
  upstreamAssets = [],
  usageStats = {}
}) => {
  const normalizedAction = normalizeAction(action);
  const counts = countByType(downstreamAssets);
  const path = extractTopPath(dependencyPath);
  const hasPipelines = counts.pipeline > 0;
  const hasDashboards = counts.dashboard > 0;
  const targetName = String(targetAsset?.fqn || targetAsset?.name || targetAsset || 'target_asset');
  const targetShortName = String(targetAsset?.name || targetName.split('.').pop() || 'target_asset');

  const dashboardNames = topAssetNames(downstreamAssets, 3, 'dashboard');
  const pipelineNames = topAssetNames(downstreamAssets, 3, 'pipeline');
  const tableNames = topAssetNames(downstreamAssets, 3, 'table');
  const upstreamNames = topAssetNames(upstreamAssets, 3);
  const maxUsagePercent = Number(usageStats?.maxJoinDependencyPct || usageStats?.usagePercent || 0);

  const pipelineFocus = formatAssetInline(pipelineNames, 'impacted pipelines');
  const dashboardFocus = formatAssetInline(dashboardNames, 'reporting dashboards');
  const tableFocus = formatAssetInline(tableNames, 'downstream tables');
  const upstreamFocus = formatAssetInline(upstreamNames, 'upstream contracts');

  const fixes = [
    {
      id: 'compat-layer',
      icon: '🧩',
      priority: pickPriority(riskLevel, normalizedAction === 'delete'),
      title: `Create a compatibility layer for ${targetShortName}`,
      why: `This minimizes disruption for ${pipelineFocus} and ${dashboardFocus}${maxUsagePercent > 0 ? ` where dependency usage peaks at ${maxUsagePercent}%` : ''}.`,
      steps: [
        `Create a compatibility view/alias that preserves the old contract of ${targetName}.`,
        `Redirect ${pipelineFocus} to the compatibility object before applying the breaking change.`,
        `Keep compatibility for one release cycle, then remove after consumers are migrated.`
      ],
      affectedAssets: uniqueList([...pipelineNames, ...dashboardNames, ...tableNames]).slice(0, 5),
      snippet: buildCompatibilitySql({ action: normalizedAction, targetName })
    },
    {
      id: 'pipeline-patch',
      icon: '⚙️',
      priority: pickPriority(riskLevel, hasPipelines),
      title: 'Patch transformation SQL/dbt models for impacted dependencies',
      why: `Pipeline breakage is likely in ${pipelineFocus} because they consume ${targetShortName} directly or via dependent models.`,
      steps: [
        `Update join keys/column references in ${pipelineFocus} and dependent models in ${tableFocus}.`,
        `Run dbt build + tests for impacted graph nodes only (state:modified strategy).`,
        'Validate row counts, null rates, and freshness SLA before production promotion.'
      ],
      affectedAssets: uniqueList([...pipelineNames, ...tableNames]).slice(0, 5),
      snippet: buildDbtSql({ targetName })
    },
    {
      id: 'consumer-validation',
      icon: '📊',
      priority: pickPriority(riskLevel, hasDashboards),
      title: 'Validate analytics/reporting consumers before release',
      why: `Reporting outputs fed by ${dashboardFocus} can break or drift after changes to ${targetShortName}.`,
      steps: [
        `Re-run semantic model and dashboard queries for ${dashboardFocus} in staging.`,
        'Compare KPI parity against previous production snapshot for key business metrics.',
        'Update dashboard field mappings and communicate changed definitions to analysts.'
      ],
      affectedAssets: uniqueList([...dashboardNames, ...tableNames]).slice(0, 5),
      snippet: buildQueryPatchSql({ targetName, downstreamModel: dashboardNames[0] || tableNames[0] })
    },
    {
      id: 'release-guardrails',
      icon: '🚦',
      priority: pickPriority(riskLevel, true),
      title: 'Deploy with production guardrails and rollback',
      why: `Controlled rollout reduces failure blast radius across ${pipelineFocus} and ${dashboardFocus}.`,
      steps: [
        `Notify owners of ${pipelineFocus} and ${dashboardFocus} with expected impact window.`,
        'Deploy during low traffic and monitor failure rate, latency, and freshness alerts.',
        `Pre-stage rollback command to restore ${targetShortName} compatibility object if failures appear.`
      ],
      affectedAssets: uniqueList([...pipelineNames, ...dashboardNames]).slice(0, 5),
      snippet: ''
    }
  ];

  if (path.length > 1) {
    fixes.push({
      id: 'path-targeting',
      icon: '🛣️',
      priority: pickPriority(riskLevel),
      title: 'Prioritize remediation on the critical lineage path',
      why: `This lineage chain has the highest breakage risk and should be remediated first: ${path.join(' -> ')}.`,
      steps: [
        `Start with upstream contract checks on ${upstreamFocus}.`,
        `Patch each hop in sequence: ${path.join(' -> ')}.`,
        'Require owner validation at each hop before continuing downstream.'
      ],
      affectedAssets: uniqueList(path),
      snippet: ''
    });
  }

  return {
    fixes: fixes.slice(0, 5).map((fix) => ({
      title: fix.title,
      priority: ['High', 'Medium', 'Low'].includes(fix.priority) ? fix.priority : 'Medium',
      why: fix.why,
      steps: Array.isArray(fix.steps) ? fix.steps : [],
      affectedAssets: Array.isArray(fix.affectedAssets) ? fix.affectedAssets : [],
      snippet: fix.snippet || ''
    }))
  };
};

module.exports = {
  generateRemediationFixes
};
