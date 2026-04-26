const typeColor = {
  table: '#2563eb',
  pipeline: '#db2777',
  dashboard: '#0891b2',
  mlmodel: '#7c3aed',
  topic: '#ea580c',
  unknown: '#64748b'
};

function ImpactGraph({ affectedAssets = [] }) {
  const grouped = affectedAssets.reduce((acc, asset) => {
    const type = asset.assetType || asset.type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(asset);
    return acc;
  }, {});

  const types = Object.keys(grouped);

  if (!types.length) {
    return (
      <section style={{ background: '#ffffff', borderRadius: '12px', padding: '16px' }}>
        No affected assets found.
      </section>
    );
  }

  return (
    <section style={{ background: '#ffffff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px #0f172a14' }}>
      <h3 style={{ marginTop: 0 }}>Affected Assets</h3>
      <div style={{ display: 'grid', gap: '12px' }}>
        {types.map((type) => (
          <div key={type} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <strong style={{ color: typeColor[type] || typeColor.unknown }}>
                [*] {type}
              </strong>
              <span>{grouped[type].length}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '6px' }}>
              {grouped[type].map((asset) => (
                <li key={`${type}-${asset.fqn || asset.name}`}>
                  {asset.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ImpactGraph;
