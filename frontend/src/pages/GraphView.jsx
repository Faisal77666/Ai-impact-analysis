import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DependencyFlow from '../components/DependencyFlow';

function GraphView() {
  const location = useLocation();
  const navigate = useNavigate();

  const payload = useMemo(() => location.state?.graphPayload || null, [location.state]);

  return (
    <main className="graph-view-page">
      <header className="graph-view-header">
        <button type="button" className="button-muted" onClick={() => navigate('/', { replace: false })}>
          Back to Dashboard
        </button>
        <div className="graph-view-title-wrap">
          <h2 className="graph-view-title">Full-Screen Lineage Explorer</h2>
          <p className="graph-view-subtitle">Explore impact paths, dependencies, and metadata in a dedicated graph viewer.</p>
        </div>
      </header>

      {!payload?.graph ? (
        <section className="panel graph-view-empty">
          <div className="panel-body">
            <div className="empty-state">
              No graph data is available for this view yet. Run an analysis from Dashboard, then click "View Full Graph".
            </div>
          </div>
        </section>
      ) : (
        <section className="graph-view-canvas">
          <DependencyFlow
            graph={payload.graph}
            affectedAssets={payload.affectedAssets || []}
            dependencyAssets={payload.dependencyAssets || []}
            riskLevel={payload.riskLevel || 'LOW'}
            riskScore={payload.riskScore || 0}
            confidenceScore={payload.confidenceScore || 0}
            explainability={payload.explainability || []}
            dependencyPath={payload.dependencyPath || []}
            loading={false}
            fullscreen
          />
        </section>
      )}
    </main>
  );
}

export default GraphView;
