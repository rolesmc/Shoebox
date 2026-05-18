// FileExplorer — virtualized table backed by react-window (D-09).
// Replaces the Plan 04 stub. Same prop contract: { files, selectedIds, onToggle }.
// Phase 5 may swap react-window for @tanstack/virtual after a spike; the swap is local to this file.
import { FixedSizeList } from 'react-window';
import { useMemo, useState, useEffect, useRef } from 'react';

const ROW_HEIGHT = 36;        // px — fixed per row (FixedSizeList requirement)
const LIST_HEIGHT = 480;      // px — viewport height; pages typically 13 rows visible

// Column widths sum approximately to the available width; grid template applied per row.
const COL_TEMPLATE = '24px minmax(0, 1fr) 140px 80px';

function Row({ index, style, data }) {
  const { files, selectedIds, onToggle } = data;
  const f = files[index];
  if (!f) return null;
  const sizeBytes = Number(f.size || 0);
  const sizeLabel = sizeBytes === 0
    ? '—'
    : sizeBytes < 1024
      ? `${sizeBytes}B`
      : sizeBytes < 1024 * 1024
        ? `${(sizeBytes / 1024).toFixed(0)}K`
        : sizeBytes < 1024 * 1024 * 1024
          ? `${(sizeBytes / 1024 / 1024).toFixed(1)}M`
          : `${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)}G`;
  const mimeShort = f.mimeType.replace('application/vnd.google-apps.', '').replace('application/', '');

  return (
    <label
      style={{
        ...style,                                        // CRITICAL: positioning from react-window
        display: 'grid',
        gridTemplateColumns: COL_TEMPLATE,
        alignItems: 'center',
        gap: '12px',
        padding: '0 12px',
        borderBottom: '1px solid var(--line-border)',
        color: 'var(--text-primary)',
        fontSize: '13px',
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(f.id)}
        onChange={() => onToggle(f.id)}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {f.starred ? '★ ' : ''}{f.name}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {mimeShort}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'right' }}>
        {sizeLabel}
      </span>
    </label>
  );
}

export default function FileExplorer({ files = [], selectedIds = new Set(), onToggle = () => {} }) {
  // Pass-through identity-stable data object to the FixedSizeList Row renderer.
  const itemData = useMemo(() => ({ files, selectedIds, onToggle }), [files, selectedIds, onToggle]);

  // Bulk select-all / clear bar — operates on the currently-displayed slice (D-12: bulk select bar).
  const allSelected = files.length > 0 && selectedIds.size === files.length;
  const selectAll = () => {
    if (allSelected) {
      files.forEach((f) => { if (selectedIds.has(f.id)) onToggle(f.id); });
    } else {
      files.forEach((f) => { if (!selectedIds.has(f.id)) onToggle(f.id); });
    }
  };

  // Width: track container width so FixedSizeList sizes correctly.
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="glass-card" style={{ padding: '16px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px' }}>Files</h3>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          {files.length.toLocaleString()} rows · {selectedIds.size.toLocaleString()} selected
        </span>
      </div>

      {/* Bulk select bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
        <input type="checkbox" checked={allSelected} onChange={selectAll} aria-label="Select all rows" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          {allSelected ? 'Clear all' : 'Select all'}
        </span>
        {selectedIds.size > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--accent-neon)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            {selectedIds.size.toLocaleString()} selected
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: COL_TEMPLATE, gap: '12px',
        padding: '6px 12px', borderBottom: '2px solid var(--line-border)',
        color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        <span />
        <span>Name</span>
        <span>Type</span>
        <span style={{ textAlign: 'right' }}>Size</span>
      </div>

      {/* Virtualized list */}
      <div ref={containerRef} style={{ marginTop: '4px' }} data-testid="file-explorer-list">
        {width > 0 && files.length > 0 ? (
          <FixedSizeList
            height={LIST_HEIGHT}
            itemCount={files.length}
            itemSize={ROW_HEIGHT}
            width={width}
            itemData={itemData}
            overscanCount={6}
          >
            {Row}
          </FixedSizeList>
        ) : (
          <div style={{ padding: '40px 12px', color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
            {files.length === 0 ? 'No files loaded yet.' : 'Sizing…'}
          </div>
        )}
      </div>

      <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
        Virtualized via react-window (D-09). Phase 5 may swap to @tanstack/virtual.
      </div>
    </div>
  );
}
