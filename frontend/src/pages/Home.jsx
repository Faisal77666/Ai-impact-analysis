import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QueryInput from '../components/QueryInput';
import DependencyFlow from '../components/DependencyFlow';
import RecommendationList from '../components/RecommendationList';
import SuggestedFixes from '../components/SuggestedFixes';
import HistoryPanel from '../components/HistoryPanel';
import RiskCard from '../components/RiskCard';
import { getHistory } from '../services/api';
import { useAnalysis } from '../hooks/useAnalysis';

const normalizeAssetType = (value = '') => {
  const key = String(value || '').toLowerCase();
  if (key.includes('dashboard')) return 'dashboard';
  if (key.includes('pipeline')) return 'pipeline';
  if (key.includes('ml')) return 'mlmodel';
  if (key.includes('table')) return 'table';
  return 'other';
};

const inferActionType = (queryText = '') => {
  const q = String(queryText || '').toLowerCase();
  if (q.includes('delete') || q.includes('drop') || q.includes('remove')) return 'delete';
  if (q.includes('rename')) return 'rename';
  if (q.includes('column')) return 'column-change';
  if (q.includes('update') || q.includes('modify') || q.includes('change')) return 'update';
  return 'update';
};

const buildBusinessSummary = ({ riskLevel, total, dashboardCount, pipelineCount, tableCount, mlCount, sampleAssets = [], actionType = 'update' }) => {
  const level = String(riskLevel || 'LOW').toUpperCase();

  if (total === 0) {
    return 'No immediate downstream breakage is predicted, but this change can still impact analytics and reporting if related production pipelines rely on the same data contract.';
  }

  const systemClauses = [];
  if (pipelineCount > 0) systemClauses.push('production data pipelines');
  if (dashboardCount > 0) systemClauses.push('business dashboards and reporting');
  if (tableCount > 0 || mlCount > 0) systemClauses.push('downstream analytics models');
  if (!systemClauses.length) systemClauses.push('analytics and reporting workflows');

  const systemsText = systemClauses.slice(0, 2).join(' and ');
  const sampleText = sampleAssets.length ? ` Key entities include ${sampleAssets.join(', ')}.` : '';

  const actionSentenceByType = {
    rename: `Renaming this asset may break schema references and disrupt ${systemsText} that depend on stable object names.`,
    delete: `Deleting this asset can break critical dependencies and disrupt ${systemsText} that rely on this data source.`,
    'column-change': `Changing this column may break transformation logic, impact data consistency, and disrupt ${systemsText}.`,
    update: `Updating this data contract may break downstream assumptions and disrupt ${systemsText}.`
  };

  const base = actionSentenceByType[actionType] || actionSentenceByType.update;
  const riskWarning = (level === 'HIGH' || level === 'CRITICAL')
    ? ` This is a ${level.toLowerCase()}-risk change that may cause failures in production pipelines and reporting outputs.`
    : '';

  return `${base}${riskWarning}${sampleText}`;
};

function Home() {
  const navigate = useNavigate();
  const { analyze, result, loading, error } = useAnalysis();
  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const payload = await getHistory(20);
        setHistory(payload.history || []);
      } catch (err) {
        console.error(`Failed to load history: ${err.message}`);
      }
    };

    loadHistory();
  }, []);

  const handleAnalyze = async (query) => {
    const payload = await analyze(query);

    const simulation = payload.simulation || {};
    const localResult = {
      riskScore: simulation.riskLevel,
      riskScoreValue: simulation.riskScore,
      confidenceScore: simulation.confidenceScore || 0,
      graphStatus: simulation.graphStatus || 'MISSING',
      affectedAssets: simulation.affectedAssets || [],
      dependencyAssets: simulation.dependencyAssets || [],
      dependencyPath: simulation.dependencyPath || [],
      graph: simulation.graph || { nodes: [], edges: [] },
      recommendations: simulation.recommendations || [],
      suggestedFixes: simulation.suggestedFixes || [],
      scoreReasons: simulation.explainability || []
    };

    setHistory((prev) => [
      {
        _id: `local-${Date.now()}`,
        queryText: payload.queryText,
        createdAt: new Date().toISOString(),
        result: localResult
      },
      ...prev
    ].slice(0, 20));

    setSelectedHistoryItem(null);
  };

  const activePayload = useMemo(() => {
    if (selectedHistoryItem) {
      return {
        result: selectedHistoryItem.result
      };
    }

    return result;
  }, [result, selectedHistoryItem]);

  const activeResult = activePayload?.simulation
    ? {
        riskScore: activePayload.simulation.riskLevel,
        riskScoreValue: activePayload.simulation.riskScore,
        confidenceScore: activePayload.simulation.confidenceScore || 0,
        graphStatus: activePayload.simulation.graphStatus || 'MISSING',
        affectedAssets: activePayload.simulation.affectedAssets || [],
        dependencyAssets: activePayload.simulation.dependencyAssets || [],
        dependencyPath: activePayload.simulation.dependencyPath || [],
        graph: activePayload.simulation.graph || { nodes: [], edges: [] },
        recommendations: activePayload.simulation.recommendations || [],
        suggestedFixes: activePayload.simulation.suggestedFixes || [],
        scoreReasons: activePayload.simulation.explainability || []
      }
    : activePayload?.result;

  const normalizedRisk = String(activeResult?.riskScore || '').toUpperCase();
  const displayRiskLevel = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalizedRisk)
    ? normalizedRisk
    : ((activeResult?.affectedAssets?.length || 0) > 0 ? 'MEDIUM' : 'LOW');

  const impactAssets = useMemo(() => {
    const source = [
      ...(activeResult?.affectedAssets || []),
      ...(activeResult?.dependencyAssets || [])
    ];

    const unique = new Map();
    source.forEach((asset) => {
      const type = normalizeAssetType(asset.type || asset.assetType || 'other');
      const key = `${type}:${asset.fqn || asset.name || 'unknown'}`;
      if (!unique.has(key)) {
        unique.set(key, { ...asset, _normalizedType: type });
      }
    });

    return [...unique.values()];
  }, [activeResult]);

  const breakdown = useMemo(() => {
    const counters = { table: 0, dashboard: 0, pipeline: 0, mlmodel: 0, other: 0 };
    impactAssets.forEach((asset) => {
      const t = asset._normalizedType || normalizeAssetType(asset.type || asset.assetType);
      counters[t] = (counters[t] || 0) + 1;
    });
    return counters;
  }, [impactAssets]);

  const totalImpacted = impactAssets.length;

  const activeQueryText = selectedHistoryItem?.queryText || activePayload?.queryText || '';
  const actionType = useMemo(() => inferActionType(activeQueryText), [activeQueryText]);

  const businessSummary = useMemo(() => buildBusinessSummary({
    riskLevel: displayRiskLevel,
    total: totalImpacted,
    dashboardCount: breakdown.dashboard,
    pipelineCount: breakdown.pipeline,
    tableCount: breakdown.table,
    mlCount: breakdown.mlmodel,
    sampleAssets: impactAssets.slice(0, 3).map((a) => a.name || a.fqn || 'asset'),
    actionType
  }), [displayRiskLevel, totalImpacted, breakdown, impactAssets, actionType]);

  useEffect(() => {
    if (!activeResult || loading) return;
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeResult, loading]);

  const openFullGraph = () => {
    if (!activeResult?.graph) return;
    navigate('/graph', {
      state: {
        graphPayload: {
          graph: activeResult.graph,
          affectedAssets: activeResult.affectedAssets || [],
          dependencyAssets: activeResult.dependencyAssets || [],
          riskLevel: displayRiskLevel,
          riskScore: activeResult.riskScoreValue || 0,
          confidenceScore: activeResult.confidenceScore || 0,
          explainability: activeResult.scoreReasons || [],
          dependencyPath: activeResult.dependencyPath || []
        }
      }
    });
  };

  return (
    <main className="dashboard-grid">
      <HistoryPanel history={history} onSelect={setSelectedHistoryItem} selectedId={selectedHistoryItem?._id || null} />

      <section style={{ display: 'grid', gap: 16 }}>
        <QueryInput onSubmit={handleAnalyze} loading={loading} />

        {error ? (
          <div className="error-banner">
            {error}
          </div>
        ) : null}

        {activeResult ? (
          <div ref={resultsRef} style={{ display: 'grid', gap: 16 }} className="fade-in">
            <section className="panel story-card">
              <div className="panel-header">Business Impact Summary</div>
              <div className="panel-body">
                <p className="story-text">{businessSummary}</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">Impact Overview</div>
              <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
                <div className="kpi-grid impact-overview-grid">
                  <div className="kpi-card">
                    <div className="kpi-label">Risk Level</div>
                    <div className="kpi-value">{displayRiskLevel}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Total Impacted Assets</div>
                    <div className="kpi-value">{totalImpacted}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Confidence Score</div>
                    <div className="kpi-value">{activeResult.confidenceScore || 0}%</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Graph Status</div>
                    <div className="kpi-value" style={{ fontSize: '1rem' }}>{activeResult.graphStatus || 'MISSING'}</div>
                  </div>
                </div>

                <RiskCard
                  riskLevel={displayRiskLevel}
                  riskScore={activeResult.riskScoreValue || 0}
                  confidenceScore={activeResult.confidenceScore || 0}
                  reasons={activeResult.scoreReasons || []}
                />

                <div className="impact-breakdown">
                  <div className="impact-breakdown-title">Impact Breakdown</div>
                  <div className="impact-breakdown-grid">
                    <div className="impact-breakdown-item"><span>Tables</span><strong>{breakdown.table || 0}</strong></div>
                    <div className="impact-breakdown-item"><span>Dashboards</span><strong>{breakdown.dashboard || 0}</strong></div>
                    <div className="impact-breakdown-item"><span>Pipelines</span><strong>{breakdown.pipeline || 0}</strong></div>
                    <div className="impact-breakdown-item"><span>ML Models</span><strong>{breakdown.mlmodel || 0}</strong></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel graph-launch-panel" onClick={openFullGraph}>
              <div className="panel-header graph-launch-header">
                <span>Impact Graph</span>
                <button
                  type="button"
                  className="button-primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFullGraph();
                  }}
                  disabled={!activeResult?.graph}
                >
                  View Full Graph
                </button>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <DependencyFlow
                  graph={activeResult.graph}
                  affectedAssets={activeResult.affectedAssets || []}
                  dependencyAssets={activeResult.dependencyAssets || []}
                  riskLevel={displayRiskLevel || 'LOW'}
                  riskScore={activeResult.riskScoreValue || 0}
                  confidenceScore={activeResult.confidenceScore || 0}
                  explainability={activeResult.scoreReasons || []}
                  dependencyPath={activeResult.dependencyPath || []}
                  loading={loading}
                />
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">Dependency Assets (Upstream)</div>
              <div className="panel-body">
              {!activeResult.dependencyAssets?.length ? (
                <div className="empty-state">No upstream dependencies found.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                  {activeResult.dependencyAssets.map((asset, index) => (
                    <li key={`${asset.type}-${asset.name}-${index}`}>
                      <strong>{asset.type}</strong> - {asset.name}
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </section>

            <RecommendationList recommendations={activeResult.recommendations || []} />

            <SuggestedFixes fixes={activeResult.suggestedFixes || []} />

            <section className="panel">
              <div className="panel-header">Score Explainability</div>
              <div className="panel-body">
              {!activeResult.scoreReasons?.length ? (
                <div className="empty-state">No explainability reasons available.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '8px' }}>
                  {activeResult.scoreReasons.map((item, index) => (
                    <li key={`${index}-${item.reason}`}>
                      <strong>{item.scoreContribution ?? item.points ?? 0}</strong> - {item.reason}
                      {item.entity ? ` (${item.entity})` : item.asset ? ` (${item.asset})` : ''}
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </section>
          </div>
        ) : (
          <section className="panel">
            <div className="panel-body">
              <div className="empty-state">Run an analysis to see impact details, risks, and recommendations.</div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default Home;
