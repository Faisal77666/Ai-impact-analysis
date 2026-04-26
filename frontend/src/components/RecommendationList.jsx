const inferPriority = (recommendation = '') => {
  const text = String(recommendation).toLowerCase();
  if (text.includes('drop') || text.includes('delete') || text.includes('breaking') || text.includes('rollback')) {
    return 'High';
  }
  if (text.includes('rename') || text.includes('migrate') || text.includes('change') || text.includes('backfill')) {
    return 'Medium';
  }
  return 'Medium';
};

const priorityMarker = {
  High: '!!',
  Medium: '!'
};

function RecommendationList({ recommendations = [] }) {
  if (!recommendations.length) {
    return (
      <section className="panel">
        <div className="panel-body">
          <div className="empty-state">No recommendations available.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">Recommendations</div>
      <div className="panel-body">
      <ol style={{ margin: 0, paddingLeft: 0, display: 'grid', gap: 10, listStyle: 'none' }}>
        {recommendations.map((rec, index) => (
          <li key={`${index}-${rec}`} className="recommendation-item" style={{ lineHeight: 1.5 }}>
            <span className="recommendation-icon" aria-hidden="true">{priorityMarker[inferPriority(rec)] || '!'}</span>
            <div style={{ display: 'grid', gap: 4 }}>
              <div>{rec}</div>
              <span className={`priority-badge ${inferPriority(rec).toLowerCase()}`}>{inferPriority(rec)} Priority</span>
            </div>
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}

export default RecommendationList;
