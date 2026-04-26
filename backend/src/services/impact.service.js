const {
  getTableByFQN,
  getAllTables,
  getLineage,
  searchCatalog
} = require('./openmetadata.service');
const { extractLineageImpact } = require('./graphTraversal.service');
const { computeRiskScore } = require('./riskScorer.service');
const { generateRemediationFixes } = require('./remediation.service');

const LINEAGE_MAX_HOPS = Number(process.env.LINEAGE_MAX_HOPS || 8);

const resolveRefId = (ref) => {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.id || '';
};

const toEdgeEntityRef = (id, nodeMap) => {
  const node = nodeMap.get(id);
  if (!node) return { id };

  return {
    id: node.id,
    type: node.type || 'table',
    name: node.name || node.displayName || node.id,
    displayName: node.displayName || node.name || node.id,
    fullyQualifiedName: node.fullyQualifiedName || ''
  };
};

const expandLineageGraph = async (rootMetadata, maxHops = LINEAGE_MAX_HOPS) => {
  const rootId = rootMetadata?.id;
  if (!rootId) {
    return { entity: rootMetadata, nodes: [], upstreamEdges: [], downstreamEdges: [] };
  }

  const nodeMap = new Map();
  nodeMap.set(rootId, {
    id: rootMetadata.id,
    type: 'table',
    name: rootMetadata.name,
    displayName: rootMetadata.displayName || rootMetadata.name,
    fullyQualifiedName: rootMetadata.fullyQualifiedName || ''
  });

  const downstreamEdgeMap = new Map();
  const upstreamEdgeMap = new Map();
  const queue = [{ id: rootId, depth: 0 }];
  const bestDepthByNode = new Map([[rootId, 0]]);
  const fetched = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxHops) continue;
    if (fetched.has(current.id)) continue;
    fetched.add(current.id);

    const segment = await getLineage('table', current.id, 1, 1).catch(() => null);
    if (!segment) continue;

    if (segment.entity?.id) {
      nodeMap.set(segment.entity.id, {
        id: segment.entity.id,
        type: segment.entity.type || 'table',
        name: segment.entity.name || segment.entity.displayName || segment.entity.id,
        displayName: segment.entity.displayName || segment.entity.name || segment.entity.id,
        fullyQualifiedName: segment.entity.fullyQualifiedName || ''
      });
    }

    (segment.nodes || []).forEach((node) => {
      if (!node?.id) return;
      nodeMap.set(node.id, {
        id: node.id,
        type: node.type || 'table',
        name: node.name || node.displayName || node.id,
        displayName: node.displayName || node.name || node.id,
        fullyQualifiedName: node.fullyQualifiedName || ''
      });
    });

    (segment.downstreamEdges || []).forEach((edge) => {
      const fromId = resolveRefId(edge?.fromEntity) || current.id;
      const toId = resolveRefId(edge?.toEntity);
      if (!fromId || !toId) return;

      const key = `${fromId}->${toId}`;
      if (!downstreamEdgeMap.has(key)) {
        downstreamEdgeMap.set(key, {
          fromEntity: toEdgeEntityRef(fromId, nodeMap),
          toEntity: toEdgeEntityRef(toId, nodeMap)
        });
      }

      const nextDepth = current.depth + 1;
      const knownDepth = bestDepthByNode.get(toId);
      if (nextDepth <= maxHops && (knownDepth === undefined || nextDepth < knownDepth)) {
        bestDepthByNode.set(toId, nextDepth);
        queue.push({ id: toId, depth: nextDepth });
      }
    });

    (segment.upstreamEdges || []).forEach((edge) => {
      const fromId = resolveRefId(edge?.fromEntity);
      const toId = resolveRefId(edge?.toEntity) || current.id;
      if (!fromId || !toId) return;

      const key = `${fromId}->${toId}`;
      if (!upstreamEdgeMap.has(key)) {
        upstreamEdgeMap.set(key, {
          fromEntity: toEdgeEntityRef(fromId, nodeMap),
          toEntity: toEdgeEntityRef(toId, nodeMap)
        });
      }

      const nextDepth = current.depth + 1;
      const knownDepth = bestDepthByNode.get(fromId);
      if (nextDepth <= maxHops && (knownDepth === undefined || nextDepth < knownDepth)) {
        bestDepthByNode.set(fromId, nextDepth);
        queue.push({ id: fromId, depth: nextDepth });
      }
    });
  }

  return {
    entity: toEdgeEntityRef(rootId, nodeMap),
    nodes: Array.from(nodeMap.values()),
    upstreamEdges: Array.from(upstreamEdgeMap.values()),
    downstreamEdges: Array.from(downstreamEdgeMap.values())
  };
};

const normalizeType = (value) => {
  const type = String(value || '').toLowerCase();
  if (type.includes('dashboard')) return 'dashboard';
  if (type.includes('pipeline') || type.includes('dbt')) return 'pipeline';
  if (type.includes('metric')) return 'metrics';
  return 'table';
};

const isLikelyTableFQN = (value) => {
  const text = String(value || '').trim();
  if (!text || text.includes(' ')) return false;
  return text.split('.').filter(Boolean).length >= 4;
};

const dedupeAssets = (assets = []) => {
  const seen = new Set();
  return assets.filter((asset) => {
    const key = `${asset.id || ''}|${asset.fqn || ''}|${asset.name || ''}|${asset.type || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupePathRows = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    const path = Array.isArray(row.path) ? row.path.join('>') : '';
    const key = `${row.entity || ''}|${path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeReasonRows = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.entity || row.asset || ''}|${row.reason || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const findCandidates = (tables, tableFQN) => {
  const term = String(tableFQN || '').toLowerCase();
  if (!term) return [];

  const exactName = tables.filter((t) => t.name?.toLowerCase() === term);
  if (exactName.length) return exactName;

  const exactFqn = tables.filter((t) => t.fullyQualifiedName?.toLowerCase() === term);
  if (exactFqn.length) return exactFqn;

  return tables.filter((t) =>
    t.name?.toLowerCase().includes(term) ||
    term.includes(t.name?.toLowerCase()) ||
    t.fullyQualifiedName?.toLowerCase().includes(term)
  );
};

const findCandidatesByColumn = (tables = [], column = '') => {
  const target = String(column || '').toLowerCase().trim();
  if (!target) return [];

  return tables.filter((table) =>
    (table.columns || []).some((c) => String(c.name || '').toLowerCase() === target)
  );
};

const pickBestCandidateByLineage = async (candidates = []) => {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const lineage = await getLineage('table', candidate.id, 3, 3);
        const d = lineage?.downstreamEdges?.length || 0;
        const u = lineage?.upstreamEdges?.length || 0;
        return { candidate, score: d * 2 + u };
      } catch (error) {
        return { candidate, score: 0 };
      }
    })
  );

  scored.sort((a, b) => b.score - a.score);
  return scored[0].candidate;
};

const buildAdjacency = (rootId, lineageData, inferredEdges = []) => {
  const adjacency = new Map();
  const addEdge = (from, to) => {
    if (!from || !to) return;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  };

  (lineageData?.downstreamEdges || []).forEach((edge) => {
    addEdge(edge?.fromEntity?.id || rootId, edge?.toEntity?.id);
  });

  (lineageData?.upstreamEdges || []).forEach((edge) => {
    addEdge(edge?.fromEntity?.id, edge?.toEntity?.id || rootId);
  });

  inferredEdges.forEach((edge) => addEdge(edge.from, edge.to));
  return adjacency;
};

const bfsPaths = (rootId, adjacency, maxDepth = 8) => {
  const queue = [{ id: rootId, path: [rootId], depth: 0 }];
  const visited = new Set([rootId]);
  const pathMap = new Map([[rootId, [rootId]]]);
  const steps = [];
  let maxHops = 0;

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;

    const neighbors = adjacency.get(current.id) || [];
    neighbors.forEach((nextId) => {
      if (visited.has(nextId)) return;
      visited.add(nextId);

      const path = [...current.path, nextId];
      pathMap.set(nextId, path);
      steps.push({ from: current.id, to: nextId, depth: current.depth + 1 });
      maxHops = Math.max(maxHops, current.depth + 1);
      queue.push({ id: nextId, path, depth: current.depth + 1 });
    });
  }

  return { pathMap, steps, maxHops };
};

const inferEdgesFromSchemaAndColumns = async (metadata, allTables) => {
  const rootFqn = String(metadata?.fullyQualifiedName || '');
  const rootSchema = rootFqn.split('.').slice(0, -1).join('.');
  const rootColumns = (metadata?.columns || []).map((c) => String(c.name || '').toLowerCase());

  const columnHints = rootColumns.filter((c) => c.endsWith('_id') || c.endsWith('_key'));
  const inferredAssets = [];
  const inferredEdges = [];

  allTables.forEach((table) => {
    if (table.id === metadata.id) return;

    const fqn = String(table.fullyQualifiedName || '');
    const inSameSchema = fqn.startsWith(`${rootSchema}.`);
    const name = String(table.name || '').toLowerCase();
    const patternMatch = name.startsWith('fact_') || name.startsWith('dim_') || name.startsWith('stg_');

    const cols = (table.columns || []).map((c) => String(c.name || '').toLowerCase());
    const fkSimilarity = columnHints.some((hint) => cols.includes(hint));

    if (inSameSchema || patternMatch || fkSimilarity) {
      inferredAssets.push({
        id: table.id,
        name: table.name,
        fqn: table.fullyQualifiedName,
        type: 'table',
        owner: table.owner?.name || 'unknown',
        tags: [],
        usageSummary: '',
        source: 'inferred'
      });
      inferredEdges.push({ from: metadata.id, to: table.id });
    }
  });

  return {
    inferredAssets: dedupeAssets(inferredAssets).slice(0, 30),
    inferredEdges
  };
};

const inferAssetsFromSearch = async (tableFQN) => {
  const results = await searchCatalog(tableFQN);
  return dedupeAssets(
    results.slice(0, 30).map((item) => ({
      id: item.id || item.entityId || '',
      name: item.name || item.displayName || item.fullyQualifiedName || 'unknown',
      fqn: item.fullyQualifiedName || '',
      type: normalizeType(item.entityType || item.type),
      owner: item.owner?.name || item.owner || 'unknown',
      tags: [],
      usageSummary: '',
      source: 'search'
    }))
  );
};

const mapColumnLevelImpact = (column, targetMetadata, candidateAssets) => {
  const col = String(column || '').toLowerCase().trim();
  if (!col) return [];

  const targetColumns = (targetMetadata?.columns || []).map((c) => String(c.name || '').toLowerCase());
  if (!targetColumns.includes(col)) return [];

  return (candidateAssets || []).filter((asset) => {
    const name = String(asset.name || '').toLowerCase();
    const fqn = String(asset.fqn || '').toLowerCase();
    const colStem = col.replace(/_id$|_key$/g, '');
    return name.includes(colStem) || fqn.includes(col);
  });
};

const dynamicRecommendations = ({ action, hasColumn, hasLineage }) => {
  const normalized = String(action || 'update').toLowerCase();

  if (!hasLineage) {
    return [
      'Impact unknown due to missing lineage data in OpenMetadata.',
      'Ingest lineage via dbt/OpenMetadata pipeline before making production changes.',
      'Re-run analysis after lineage ingestion to get reliable impact paths.'
    ];
  }

  if (hasColumn) {
    return [
      'Check column lineage impact before deploying the column change.',
      'Validate downstream transformations and semantic models.',
      'Update affected metrics definitions and dependent BI calculations.'
    ];
  }

  if (normalized === 'drop') {
    return [
      'Backup the table before deletion and define rollback steps.',
      'Validate all downstream dashboards and scheduled pipelines.',
      'Notify BI/analytics stakeholders before deployment.'
    ];
  }

  if (normalized === 'rename') {
    return [
      'Update SQL queries and ETL scripts with the new name.',
      'Update dbt models and source references.',
      'Update dashboards and data documentation.'
    ];
  }

  return [
    'Validate upstream and downstream dependencies in staging.',
    'Review ownership and run data quality checks post-change.',
    'Schedule controlled rollout with monitoring enabled.'
  ];
};

const runImpactAnalysis = async (parsedIntent, options = {}) => {
  const startedAt = Date.now();
  const debug = Boolean(options.debug);

  try {
    const action = String(parsedIntent?.action || 'update').toLowerCase();
    const tableFQN = String(parsedIntent?.tableFQN || '').trim();
    const column = parsedIntent?.column ? String(parsedIntent.column).trim() : '';

    if (!tableFQN) {
      throw new Error('Could not identify target table. Please mention table name or FQN in the query');
    }

    let metadata;
    const all = await getAllTables();

    // Fast path for complete FQN values.
    if (isLikelyTableFQN(tableFQN)) {
      try {
        metadata = await getTableByFQN(tableFQN);
      } catch (error) {
        metadata = null;
      }
    }

    if (!metadata) {
      const candidates = findCandidates(all, tableFQN);
      metadata = await pickBestCandidateByLineage(candidates);
    }

    // Recovery path: if table token was a column, resolve via column match.
    if (!metadata && column) {
      const byColumn = findCandidatesByColumn(all, column);
      metadata = await pickBestCandidateByLineage(byColumn);
    }

    if (!metadata) {
      throw new Error(`No matching table found for: ${tableFQN}. Please provide a valid table name or fully qualified name`);
    }

    const lineageData = await expandLineageGraph(metadata, LINEAGE_MAX_HOPS).catch(() => ({
      entity: metadata,
      nodes: [],
      upstreamEdges: [],
      downstreamEdges: []
    }));

    const direct = extractLineageImpact(lineageData);
    const hasLineage = (direct.downstreamEdgeCount + direct.upstreamEdgeCount) > 0;

    let warning;
    let inferredAssets = [];
    let inferredEdges = [];
    if (!hasLineage) {
      warning = 'No lineage found - results may be incomplete';
      const allTables = await getAllTables();
      const inferred = await inferEdgesFromSchemaAndColumns(metadata, allTables);
      inferredAssets = inferred.inferredAssets;
      inferredEdges = inferred.inferredEdges;

      const searchAssets = await inferAssetsFromSearch(metadata.fullyQualifiedName || metadata.name);
      inferredAssets = dedupeAssets([...inferredAssets, ...searchAssets]);
    }

    const adjacency = buildAdjacency(metadata.id, lineageData, inferredEdges);
    const traversal = bfsPaths(metadata.id, adjacency, LINEAGE_MAX_HOPS);

    let affectedAssets = dedupeAssets([...direct.affectedAssets, ...inferredAssets]);
    let dependencyAssets = dedupeAssets(direct.dependencyAssets);

    const realAffectedAssetIds = new Set((direct.affectedAssets || []).map((a) => a.id));
    const realDependencyAssetIds = new Set((direct.dependencyAssets || []).map((a) => a.id));

    if (column) {
      const columnImpacts = mapColumnLevelImpact(column, metadata, affectedAssets);
      if (columnImpacts.length > 0) {
        affectedAssets = dedupeAssets([...affectedAssets, ...columnImpacts]);
      }
    }

    if (direct.downstreamEdgeCount > 0 && affectedAssets.length === 0) {
      throw new Error('Lineage downstreamEdges are present but impacted assets extraction is empty');
    }

    affectedAssets = affectedAssets.map((asset) => ({
      ...asset,
      impactType: 'HARD_BREAK',
      dependencyPath: traversal.pathMap.get(asset.id) || [],
      lineageType: realAffectedAssetIds.has(asset.id) ? 'REAL' : 'INFERRED'
    }));

    dependencyAssets = dependencyAssets.map((asset) => ({
      ...asset,
      impactType: 'SOFT_IMPACT',
      dependencyPath: traversal.pathMap.get(asset.id) || [],
      lineageType: realDependencyAssetIds.has(asset.id) ? 'REAL' : 'INFERRED'
    }));

    const metadataRichness = Math.min(10, [
      metadata?.description ? 3 : 0,
      (metadata?.columns || []).length > 0 ? 4 : 0,
      metadata?.owner ? 3 : 0
    ].reduce((a, b) => a + b, 0));

    const risk = computeRiskScore({
      affectedAssets,
      dependencyAssets,
      targetEntity: metadata,
      hasLineage,
      hasColumnLineage: Boolean(column && direct.downstreamEdgeCount > 0),
      metadataRichness,
      maxHopsFound: traversal.maxHops,
      realUpstreamEdges: direct.upstreamEdgeCount,
      realDownstreamEdges: direct.downstreamEdgeCount,
      onlyInferredLineage: !hasLineage && inferredEdges.length > 0,
      graphEdgeCount: (lineageData?.upstreamEdges || []).length + (lineageData?.downstreamEdges || []).length + inferredEdges.length
    });

    const graphNodes = dedupeAssets([
      { id: metadata.id, name: metadata.name, type: 'table', fqn: metadata.fullyQualifiedName },
      ...affectedAssets,
      ...dependencyAssets
    ]).map((node) => ({
      id: node.id || node.fqn || node.name,
      label: node.name,
      type: node.type,
      fqn: node.fqn || ''
    }));

    const graphEdges = [];
    (lineageData?.downstreamEdges || []).forEach((edge) => {
      graphEdges.push({
        id: `d-${edge?.fromEntity?.id || metadata.id}-${edge?.toEntity?.id}`,
        source: edge?.fromEntity?.id || metadata.id,
        target: edge?.toEntity?.id,
        direction: 'downstream',
        lineageType: 'REAL'
      });
    });
    (lineageData?.upstreamEdges || []).forEach((edge) => {
      graphEdges.push({
        id: `u-${edge?.fromEntity?.id}-${edge?.toEntity?.id || metadata.id}`,
        source: edge?.fromEntity?.id,
        target: edge?.toEntity?.id || metadata.id,
        direction: 'upstream',
        lineageType: 'REAL'
      });
    });
    inferredEdges.forEach((edge, idx) => {
      graphEdges.push({
        id: `i-${idx}-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        direction: 'inferred',
        lineageType: 'INFERRED'
      });
    });

    const dedupedGraphNodeIds = new Set();
    const finalGraphNodes = graphNodes.filter((node) => {
      const key = String(node.id || '');
      if (!key || dedupedGraphNodeIds.has(key)) return false;
      dedupedGraphNodeIds.add(key);
      return true;
    });

    const dedupedGraphEdgeIds = new Set();
    const finalGraphEdges = graphEdges.filter((edge) => {
      const key = `${edge.source || ''}|${edge.target || ''}|${edge.direction || ''}|${edge.lineageType || ''}`;
      if (dedupedGraphEdgeIds.has(key)) return false;
      dedupedGraphEdgeIds.add(key);
      return true;
    });

    const recommendations = dynamicRecommendations({
      action,
      hasColumn: Boolean(column),
      hasLineage
    });

    const dependencyPathRows = dedupePathRows(affectedAssets.map((asset) => ({
      entity: asset.name,
      path: asset.dependencyPath
    })));

    const remediationPayload = generateRemediationFixes({
      action,
      riskLevel: risk.level,
      targetAsset: {
        name: metadata.name,
        fqn: metadata.fullyQualifiedName
      },
      dependencyPath: dependencyPathRows,
      downstreamAssets: affectedAssets,
      upstreamAssets: dependencyAssets,
      usageStats: {
        maxJoinDependencyPct: 0
      }
    });
    const suggestedFixes = remediationPayload?.fixes || [];

    const explainability = dedupeReasonRows(risk.reasons.map((reason) => ({
      reason: reason.reason,
      scoreContribution: reason.points,
      entity: reason.asset,
      path: affectedAssets.find((asset) => asset.name === reason.asset)?.dependencyPath || []
    })));

    const graphStatus = finalGraphEdges.length > 0 ? 'AVAILABLE' : 'MISSING';

    const output = {
      riskScore: risk.score,
      riskLevel: risk.level,
      confidenceScore: risk.confidenceScore,
      graphStatus,
      impactedAssets: {
        tables: affectedAssets.filter((asset) => asset.type === 'table').map((asset) => ({ name: asset.name, fqn: asset.fqn, lineageType: asset.lineageType })),
        pipelines: affectedAssets.filter((asset) => asset.type === 'pipeline').map((asset) => ({ name: asset.name, fqn: asset.fqn, lineageType: asset.lineageType })),
        dashboards: affectedAssets.filter((asset) => asset.type === 'dashboard').map((asset) => ({ name: asset.name, fqn: asset.fqn, lineageType: asset.lineageType }))
      },
      affectedAssets: affectedAssets.map((asset) => ({
        name: asset.name,
        type: asset.type,
        impactType: asset.impactType,
        dependencyPath: asset.dependencyPath,
        lineageType: asset.lineageType
      })),
      dependencyAssets: dependencyAssets.map((asset) => ({
        name: asset.name,
        type: asset.type,
        impactType: asset.impactType,
        dependencyPath: asset.dependencyPath,
        lineageType: asset.lineageType
      })),
      dependencyPath: dependencyPathRows,
      recommendations,
      suggestedFixes,
      explainability,
      reasonBreakdown: explainability.map((item) => ({
        asset: item.entity,
        impactPoints: item.scoreContribution,
        reason: item.reason
      })),
      lineageSummary: {
        realEdges: (lineageData?.upstreamEdges || []).length + (lineageData?.downstreamEdges || []).length,
        inferredEdges: inferredEdges.length
      },
      reason: hasLineage
        ? 'impact derived from lineage traversal'
        : 'Impact unknown due to missing lineage data',
      warning,
      graph: {
        nodes: finalGraphNodes,
        edges: finalGraphEdges
      }
    };

    if (debug) {
      output.debug = {
        rawLineage: lineageData,
        traversalSteps: traversal.steps,
        scoringBreakdown: risk.reasons
      };
    }

    return {
      target: metadata.fullyQualifiedName || metadata.name,
      action,
      riskScore: output.riskScore,
      riskLevel: output.riskLevel,
      confidenceScore: output.confidenceScore,
      output,
      scoreReasons: risk.reasons,
      explainability,
      dependencyAssets,
      recommendations,
      suggestedFixes,
      queryIntent: parsedIntent,
      targetEntity: {
        entityType: 'table',
        name: metadata.name,
        fqn: metadata.fullyQualifiedName,
        id: metadata.id,
        description: metadata.description || '',
        columns: metadata.columns || []
      },
      metadata,
      lineageData,
      affectedAssets,
      warning,
      risk,
      executionTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    throw new Error(`Impact analysis failed: ${error.message}`);
  }
};

module.exports = { runImpactAnalysis };
