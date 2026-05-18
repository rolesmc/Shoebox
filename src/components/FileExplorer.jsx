// FileExplorer — STUB version. Plan 05 replaces this entire file with a react-window virtualized
// table that handles 10k+ rows. Same prop contract: { files, selectedIds, onToggle }.
// For Plan 04 we render up to 50 rows so visual integration with BentoDashboard works.

export default function FileExplorer({ files = [], selectedIds = new Set(), onToggle = () => {} }) {
  const visible = files.slice(0, 50);
  return (
    <div className="glass-card" style={{ padding: '16px', minHeight: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Files</h3>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          {files.length.toLocaleString()} total · {selectedIds.size.toLocaleString()} selected · showing first {visible.length}
        </span>
      </div>
      <div style={{ borderTop: '1px solid var(--line-border)' }}>
        {visible.map((f) => (
          <label
            key={f.id}
            style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 120px 80px',
              alignItems: 'center', gap: '12px', padding: '8px 4px',
              borderBottom: '1px solid var(--line-border)', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: '13px',
            }}
          >
            <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => onToggle(f.id)} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.starred ? '★ ' : ''}{f.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              {f.mimeType.replace('application/vnd.google-apps.', '').replace('application/', '')}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'right' }}>
              {f.size === '0' ? '—' : `${(Number(f.size) / 1024).toFixed(0)}K`}
            </span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '11px', fontStyle: 'italic' }}>
        STUB: shows first 50 of {files.length}. Plan 05 replaces this with a react-window virtualized table for 10k+ rows.
      </div>
    </div>
  );
}
