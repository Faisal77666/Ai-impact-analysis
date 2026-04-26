import { useState } from 'react';

const examples = [
  {
    label: 'Rename column impact',
    value: 'What happens if I rename user_id in orders table?'
  },
  {
    label: 'Dashboard dependency check',
    value: 'Which dashboards use the sales_metrics pipeline?'
  },
  {
    label: 'Delete column risk',
    value: 'What breaks if I delete the revenue column?'
  }
];

function QueryInput({ onSubmit, loading, demoMode = false, onDemoModeChange, lightMode = false, onLightModeChange }) {
  const [queryText, setQueryText] = useState('');
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const trimmed = queryText.trim();
    if (loading) return;
    if (!trimmed) {
      setError('Please enter a query before running analysis.');
      return;
    }
    setError('');
    onSubmit(trimmed, { demoMode, lightMode });
  };

  return (
    <section className="panel">
      <div className="panel-header">Ask an Impact Question</div>
      <div className="panel-body">
      <form onSubmit={submit}>
        <textarea
          rows={5}
          value={queryText}
          onChange={(event) => {
            setQueryText(event.target.value);
            if (error) setError('');
          }}
          placeholder="Describe a proposed schema or pipeline change..."
          className="query-textarea"
        />

        <div className="input-row">
          <select
            className="query-suggestions"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              setQueryText(event.target.value);
              setError('');
            }}
          >
            <option value="">Suggestions...</option>
            {examples.map((example) => (
              <option key={example.value} value={example.value}>{example.label}</option>
            ))}
          </select>

          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? 'Running Analysis...' : 'Run Analysis'}
          </button>
        </div>

        <div className="demo-toggle-row">
          <label className="demo-toggle" htmlFor="demo-mode-toggle">
            <input
              id="demo-mode-toggle"
              type="checkbox"
              checked={Boolean(demoMode)}
              onChange={(event) => onDemoModeChange?.(event.target.checked)}
            />
            <span>Demo Mode</span>
          </label>
          <span className="demo-toggle-hint">
            {demoMode ? 'Using seeded metadata graph for hackathon showcase.' : 'Using real OpenMetadata lineage.'}
          </span>
        </div>

        <div className="demo-toggle-row">
          <label className="demo-toggle" htmlFor="light-mode-toggle">
            <input
              id="light-mode-toggle"
              type="checkbox"
              checked={Boolean(lightMode)}
              onChange={(event) => onLightModeChange?.(event.target.checked)}
            />
            <span>Light Scoring</span>
          </label>
          <span className="demo-toggle-hint">
            {lightMode
              ? 'Uses peak-impact scoring to avoid always hitting 100.'
              : 'Uses full cumulative scoring across all impacted assets.'}
          </span>
        </div>

        {error ? <p style={{ color: '#b91c1c', margin: '10px 0 0 0' }}>{error}</p> : null}

        {loading ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div className="skeleton" style={{ width: '92%' }} />
            <div className="skeleton" style={{ width: '78%' }} />
            <div className="skeleton" style={{ width: '65%' }} />
          </div>
        ) : null}
      </form>
      </div>
    </section>
  );
}

export default QueryInput;
