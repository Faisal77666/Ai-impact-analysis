import { useMemo, useState } from 'react';

const normalizeLevel = (value = '') => {
  const upper = String(value).toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper)) return upper;
  return 'LOW';
};

function RiskCard({ riskLevel = 'LOW', riskScore = 0, confidenceScore = 0, reasons = [] }) {
  const [expanded, setExpanded] = useState(false);
  const level = normalizeLevel(riskLevel);

  const cssLevel = useMemo(() => {
    if (level === 'CRITICAL') return 'critical';
    if (level === 'HIGH') return 'high';
    if (level === 'MEDIUM') return 'medium';
    return 'low';
  }, [level]);

  return (
    <section className={`risk-card ${cssLevel}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="kpi-label">Risk Level</div>
          <div className="kpi-value">{level}</div>
        </div>
        <div>
          <div className="kpi-label">Risk Score</div>
          <div className="kpi-value">{riskScore}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="kpi-label">Risk Meter (0-100)</div>
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, riskScore))}%` }} />
        </div>
        <div style={{ marginTop: 6, fontSize: '0.84rem', color: '#475569' }}>{Math.max(0, Math.min(100, riskScore))}/100</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="kpi-label">Confidence Score</div>
        <div className="progress-bar" style={{ marginTop: 6 }}>
          <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, confidenceScore))}%` }} />
        </div>
        <div style={{ marginTop: 6, fontSize: '0.84rem', color: '#475569' }}>{confidenceScore}%</div>
      </div>

      <button type="button" className="details-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide reason breakdown' : 'Show reason breakdown'}
      </button>

      {expanded ? (
        <div style={{ marginTop: 8 }}>
          {!reasons.length ? (
            <div className="empty-state">No reason breakdown available.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {reasons.map((item, index) => (
                <li key={`${index}-${item.reason || item.asset || 'reason'}`}>
                  <strong>{item.scoreContribution ?? item.impactPoints ?? item.points ?? 0}</strong> {item.reason}
                  {item.entity ? ` (${item.entity})` : item.asset ? ` (${item.asset})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default RiskCard;
