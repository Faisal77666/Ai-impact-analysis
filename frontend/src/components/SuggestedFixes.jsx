const fallbackIconByTitle = (title = '') => {
  const t = String(title || '').toLowerCase();
  if (t.includes('pipeline') || t.includes('dbt')) return '⚙️';
  if (t.includes('dashboard') || t.includes('report')) return '📊';
  if (t.includes('contract') || t.includes('compat')) return '🧩';
  if (t.includes('release') || t.includes('rollout')) return '🚦';
  return '🛠️';
};

function SuggestedFixes({ fixes = [] }) {
  if (!Array.isArray(fixes) || !fixes.length) {
    return (
      <section className="panel">
        <div className="panel-header">Suggested Fixes</div>
        <div className="panel-body">
          <div className="empty-state">No remediation suggestions available for this analysis yet.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">Suggested Fixes</div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        {fixes.map((fix, index) => {
          const priority = String(fix.priority || 'Medium');
          const icon = fix.icon || fallbackIconByTitle(fix.title);
          return (
            <article key={fix.id || `${index}-${fix.title || 'fix'}`} className="fix-item">
              <div className="fix-item-head">
                <span className="fix-icon" aria-hidden="true">{icon}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{fix.title || 'Remediation step'}</div>
                  <span className={`priority-badge ${priority.toLowerCase()}`}>{priority} Priority</span>
                </div>
              </div>

              {fix.why ? <p className="fix-why">{fix.why}</p> : null}

              {Array.isArray(fix.steps) && fix.steps.length ? (
                <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {fix.steps.map((step, stepIndex) => (
                    <li key={`${stepIndex}-${step}`}>{step}</li>
                  ))}
                </ol>
              ) : null}

              {Array.isArray(fix.affectedAssets) && fix.affectedAssets.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="kpi-label">Affected Assets</div>
                  <div className="chip-group">
                    {fix.affectedAssets.slice(0, 6).map((asset) => (
                      <span key={`${fix.id || fix.title}-${asset}`} className="chip">{asset}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {fix.snippet ? (
                <pre className="fix-code-block"><code>{fix.snippet}</code></pre>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default SuggestedFixes;
