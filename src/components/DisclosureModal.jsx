// DisclosureModal — second-gate disclosure (PRE-03). Copy verbatim from PITFALLS.md Pitfall 5.
// Phase 5 makes acknowledgement a hard gate before the queue can start.
export default function DisclosureModal({ isOpen = false, onClose = () => {}, onAcknowledge = () => {} }) {
  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="glass-card" style={{ padding: '28px', width: 'min(560px, 90vw)' }}>
        <h2 style={{ marginTop: 0, color: 'var(--text-primary)' }}>What won't migrate</h2>
        <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>
          Before you migrate, you should know exactly what Google's <code>files.copy</code> API does and does not preserve. This is the API limit, not a UniVault limit.
        </p>
        <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.10)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--accent-neon)' }}>What migrates:</b> File contents, file name, folder placement (mirrored), modified time.
        </div>
        <div style={{ marginTop: '10px', padding: '14px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.12)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--accent-purple)' }}>What does NOT migrate:</b> Comments, suggestions, revision history, sharing permissions, starred state, file IDs (links to old files in other docs will break).
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic', marginTop: '14px' }}>
          For your 5–10 most important files (thesis, recommendation drafts), consider using Drive's "Make a copy" UI manually first — it preserves comments. Then run UniVault for the bulk.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--line-border)', borderRadius: '10px' }}>Go back</button>
          <button onClick={onAcknowledge} style={{ padding: '10px 16px', background: 'var(--accent-neon)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: 600 }}>I understand — proceed</button>
        </div>
      </div>
    </div>
  );
}
