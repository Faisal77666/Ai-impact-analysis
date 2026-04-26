import RiskBadge from './RiskBadge';

function HistoryPanel({ history = [], onSelect, selectedId = null }) {
  return (
    <aside className="panel">
      <div className="panel-header">Recent Queries</div>
      <div className="panel-body history-list">
        {!history.length ? <div className="empty-state">No history yet. Run an analysis to get started.</div> : null}
        {history.map((item) => (
          <button
            key={item._id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={`history-item${selectedId === item._id ? ' selected' : ''}`}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>{item.queryText}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <RiskBadge score={item.result?.riskScore} />
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

export default HistoryPanel;
