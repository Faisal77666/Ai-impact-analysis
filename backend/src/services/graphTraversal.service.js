const normalizeType = (value) => {
  const type = String(value || '').toLowerCase();
  if (type.includes('dashboard')) return 'dashboard';
  if (type.includes('pipeline') || type.includes('dbt')) return 'pipeline';
  if (type.includes('metric')) return 'metrics';
  return 'table';
};

const entityFromEdgeRef = (ref) => {
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

const dedupeByIdType = (assets = []) => {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.id}|${asset.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractLineageImpact = (lineageData) => {
  const downstreamEdges = lineageData?.downstreamEdges || [];
  const upstreamEdges = lineageData?.upstreamEdges || [];

  const affectedAssets = dedupeByIdType(
    downstreamEdges.map((edge) => entityFromEdgeRef(edge?.toEntity))
  );
  const dependencyAssets = dedupeByIdType(
    upstreamEdges.map((edge) => entityFromEdgeRef(edge?.fromEntity))
  );

  return {
    affectedAssets,
    dependencyAssets,
    downstreamEdgeCount: downstreamEdges.length,
    upstreamEdgeCount: upstreamEdges.length
  };
};

module.exports = {
  extractLineageImpact
};
