const colorByScore = {
  LOW: '#16a34a',
  MEDIUM: '#ca8a04',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
  Low: '#16a34a',
  Medium: '#ca8a04',
  High: '#ea580c',
  Critical: '#dc2626'
};

function RiskBadge({ score }) {
  const normalizedScore = score || 'Unknown';
  const color = colorByScore[normalizedScore] || '#475569';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: `${color}1A`,
        color,
        border: `1px solid ${color}55`,
        borderRadius: '999px',
        padding: '4px 10px',
        fontWeight: 700,
        fontSize: '0.85rem'
      }}
    >
      <span aria-hidden="true">[!]</span>
      {normalizedScore}
    </span>
  );
}

export default RiskBadge;
