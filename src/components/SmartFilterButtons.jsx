// SmartFilterButtons — 3 buttons with live match counts. Filter logic is "real-enough" against mock;
// Phase 5 replaces with IDB cursors. Counts must update reactively when props.files changes.
import { useMemo } from 'react';

function countAcademic(files) {
  // FILT-01: owned Google Docs/Sheets/Slides only.
  return files.filter((f) =>
    f.ownedByMe &&
    ['application/vnd.google-apps.document',
     'application/vnd.google-apps.spreadsheet',
     'application/vnd.google-apps.presentation'].includes(f.mimeType),
  ).length;
}

function countAllStar(files, foldersById) {
  // FILT-02: starred OR parent folder name matches Thesis|Resume|Project|Final (case-insensitive).
  const pat = /thesis|resume|project|final/i;
  return files.filter((f) => {
    if (f.starred) return true;
    const parentId = f.parents?.[0];
    const parent = foldersById.get(parentId);
    return parent && pat.test(parent.name);
  }).length;
}

function countCleanSlate(files) {
  // FILT-03: EXCLUDE Untitled/Draft/Copy of, AND exclude binaries <2KB.
  const pat = /^(Untitled|Draft|Copy of)/i;
  return files.filter((f) => {
    if (pat.test(f.name)) return false;
    const isBinary = !f.mimeType.startsWith('application/vnd.google-apps.');
    if (isBinary && Number(f.size) < 2048) return false;
    return true;
  }).length;
}

export default function SmartFilterButtons({ files = [], folders = [], onApply = () => {} }) {
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const academic   = useMemo(() => countAcademic(files),                  [files]);
  const allStar    = useMemo(() => countAllStar(files, foldersById),      [files, foldersById]);
  const cleanSlate = useMemo(() => countCleanSlate(files),                [files]);

  const Btn = ({ label, count, onClick, accentColor }) => (
    <button
      onClick={onClick}
      className="glass-card"
      style={{
        padding: '14px 18px', textAlign: 'left', cursor: 'pointer',
        background: 'var(--bg-card)', color: 'var(--text-primary)',
        minWidth: '180px',
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: accentColor }}>
        {count.toLocaleString()} match{count === 1 ? '' : 'es'}
      </div>
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      <Btn label="Academic Portfolio" count={academic}   onClick={() => onApply('academic')}   accentColor="var(--accent-neon)" />
      <Btn label="All-Star Core"      count={allStar}    onClick={() => onApply('allStar')}    accentColor="var(--accent-purple)" />
      <Btn label="Clean Slate"        count={cleanSlate} onClick={() => onApply('cleanSlate')} accentColor="var(--text-secondary)" />
    </div>
  );
}
