// ResumeBanner — mount-time. Real wiring in Phase 8. D-10 states: no-cursor | cursor-present.
export default function ResumeBanner({ cursorPresent = false, remainingCount = 0 }) {
  if (!cursorPresent) return null;
  return (
    <div className="glass-card" style={{
      padding: '14px 20px', marginBottom: '16px',
      borderColor: 'rgba(139, 92, 246, 0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    }}>
      <div>
        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500 }}>
          Resume previous transfer ({remainingCount} remaining)
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
          A migration was interrupted. Pick up where you left off, or discard the queue.
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={{ padding: '8px 14px', background: 'var(--accent-purple)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 500 }}>Resume</button>
        <button style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--line-border)', borderRadius: '10px' }}>Discard</button>
      </div>
    </div>
  );
}
