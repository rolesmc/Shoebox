// AuthCard — rendered twice (source + dest). Pure presentational; states drive the look.
// States per D-10: disconnected | connected | expired. (DevPanel toggle: disconnected, source-only,
// dest-only, both, expired — composed at the dashboard level into per-card state below.)
import { CloudOff, CheckCircle, AlertTriangle } from 'lucide-react';

const LABEL = { source: 'School Account (Source)', dest: 'Personal Account (Destination)' };

export default function AuthCard({ account, state, email }) {
  const isConnected = state === 'connected';
  const isExpired   = state === 'expired';
  const Icon = isConnected ? CheckCircle : isExpired ? AlertTriangle : CloudOff;
  const accent = isConnected ? 'var(--accent-neon)'
               : isExpired   ? 'var(--accent-purple)'
                             : 'var(--text-secondary)';

  return (
    <div className="glass-card" style={{ padding: '20px', minHeight: '120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Icon size={20} color={accent} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {LABEL[account]}
        </span>
      </div>
      {isConnected ? (
        <>
          <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{email || 'unknown@example.com'}</div>
          <div style={{ color: 'var(--accent-neon)', fontSize: '12px', marginTop: '4px' }}>Connected</div>
        </>
      ) : isExpired ? (
        <>
          <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 500 }}>{email || 'unknown@example.com'}</div>
          <div style={{ color: 'var(--accent-purple)', fontSize: '12px', marginTop: '4px' }}>
            Session expired — reconnect to resume
          </div>
        </>
      ) : (
        <button
          style={{
            marginTop: '8px', padding: '10px 16px',
            background: 'var(--accent-neon)', color: '#000', border: 'none',
            borderRadius: '12px', fontWeight: 600, fontSize: '14px',
          }}
          onClick={() => alert(`Connect ${account} — Phase 3 implements GIS OAuth`)}
        >
          Connect {account === 'source' ? 'School' : 'Personal'} Account
        </button>
      )}
    </div>
  );
}
