// TransferPortal — static shell. Phase 9 (POLISH-01) adds animation + canvas-confetti.
// D-10 states: idle | mirroring | copying | paused | done | failed-with-retries.
const COPY = {
  'idle':                 { headline: 'Ready to migrate',           detail: 'Connect both accounts, select files, click Start.' },
  'mirroring':            { headline: 'Mirroring folders…',          detail: 'Recreating folder structure in destination.' },
  'copying':              { headline: 'Copying files…',              detail: '3 parallel transfers · ~12 of 247 files · 3.4 GB of 28 GB' },
  'paused':               { headline: 'Paused',                      detail: 'Click Resume to continue from the last completed file.' },
  'done':                 { headline: 'Migration complete!',         detail: '247 migrated · 3 skipped · 0 failed' },
  'failed-with-retries':  { headline: '⚠ Some files failed',         detail: '11 files failed after 5 retries — click Retry Failed Only to try again.' },
};

export default function TransferPortal({ state = 'idle' }) {
  const { headline, detail } = COPY[state] || COPY.idle;
  const accent = state === 'done' ? 'var(--accent-neon)'
               : state === 'failed-with-retries' ? 'var(--accent-purple)'
               : 'var(--text-primary)';
  return (
    <div className="glass-card" style={{ padding: '24px', minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
        Transfer Portal
      </div>
      <div style={{ color: accent, fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>{headline}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{detail}</div>
      <div style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '11px', fontStyle: 'italic' }}>
        (Phase 9 adds animation + confetti)
      </div>
    </div>
  );
}
