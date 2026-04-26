const TYPE_WEIGHTS = {
  dashboard: 6,
  pipeline: 5,
  table: 3,
  metrics: 4
};

const classifyRiskLevel = (affectedAssets = []) => {
  const count = affectedAssets.length;
  const hasDashboard = affectedAssets.some((asset) => String(asset.type || '').toLowerCase() === 'dashboard');

  if (count > 0) {
    if (count >= 10 || hasDashboard) return 'CRITICAL';
    if (count >= 5) return 'HIGH';
    return 'MEDIUM';
  }

  return 'LOW';
};

const computeConfidenceScore = (input) => {
  let confidence = 0;

  const realUpstreamEdges = Number(input?.realUpstreamEdges || 0);
  const realDownstreamEdges = Number(input?.realDownstreamEdges || 0);
  const hasColumnLineage = Boolean(input?.hasColumnLineage);
  const onlyInferredLineage = Boolean(input?.onlyInferredLineage);
  const graphEdgeCount = Number(input?.graphEdgeCount || 0);

  if (realUpstreamEdges > 0) confidence += 50;
  if (realDownstreamEdges > 0) confidence += 30;
  if (hasColumnLineage) confidence += 10;
  if (onlyInferredLineage) confidence -= 30;
  if (graphEdgeCount === 0) confidence -= 20;

  return Math.max(0, Math.min(100, confidence));
};

const computeRiskScore = (input) => {
  const affectedAssets = input?.affectedAssets || [];
  const dependencyAssets = input?.dependencyAssets || [];
  const target = input?.targetEntity || {};
  const hasLineage = Boolean(input?.hasLineage);

  const reasons = [];
  let score = 0;

  affectedAssets.forEach((asset) => {
    const type = String(asset.type || 'table').toLowerCase();
    const points = TYPE_WEIGHTS[type] || TYPE_WEIGHTS.table;
    score += points;
    reasons.push({
      asset: asset.name || target?.name || 'target',
      reason: `Downstream ${type} impact`,
      points
    });

    const tags = (asset.tags || []).map((tag) => String(tag).toLowerCase());
    if (tags.some((tag) => tag.includes('tier1') || tag.includes('business-critical'))) {
      score += 3;
      reasons.push({
        asset: asset.name || target?.name || 'target',
        reason: 'Business-critical tag modifier',
        points: 3
      });
    }

    const usage = String(asset.usageSummary || '').toLowerCase();
    if (usage.includes('high')) {
      score += 2;
      reasons.push({
        asset: asset.name || target?.name || 'target',
        reason: 'High usage frequency modifier',
        points: 2
      });
    }
  });

  if (dependencyAssets.length > 0) {
    const dependencyPoints = dependencyAssets.length * 2;
    score += dependencyPoints;
    reasons.push({
      asset: target?.name || target?.fullyQualifiedName || 'target',
      reason: `Upstream dependency assets (${dependencyAssets.length})`,
      points: dependencyPoints
    });
  }

  const targetName = String(target?.name || target?.fullyQualifiedName || '').toLowerCase();
  if (targetName.includes('fact_') || targetName.includes('.fact') || targetName.includes('fact')) {
    score += 3;
    reasons.push({
      asset: target?.name || target?.fullyQualifiedName || 'target',
      reason: 'Central fact-table modifier',
      points: 3
    });
  }

  if (!hasLineage) {
    score -= 2;
    reasons.push({
      asset: target?.name || target?.fullyQualifiedName || 'target',
      reason: 'No lineage confidence penalty',
      points: -2
    });
  }

  score = Math.max(0, Math.min(100, score));

  const confidence = computeConfidenceScore(input);

  const impactAssessment = hasLineage
    ? 'KNOWN'
    : 'UNKNOWN_DUE_TO_MISSING_LINEAGE';

  return {
    score,
    level: classifyRiskLevel(affectedAssets),
    confidenceScore: confidence,
    impactAssessment,
    reasons
  };
};

module.exports = { computeRiskScore };
