// src/components/DevPanel.jsx
// DEV-only toggle panel for Phase 0. Design notes:
//   • No module-top throw — that would be a side effect and would block tree-shake.
//   • DEV gate lives INSIDE the component function (early-return null in prod).
//   • STATE_OPTIONS comes from './stateOptions.js' (NOT from BentoDashboard.jsx).
//     This breaks the circular-import risk between composer and dev surface.

import { useState } from 'react';
import { FAILURE_MODES, setFailureMode, getFailureMode } from '../mocks/failureInjection.js';
import { STATE_OPTIONS } from './stateOptions.js';

const ROW = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' };
const LABEL = { color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: '70px' };

function TogglePill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: '11px', fontFamily: 'var(--font-mono)',
        background: active ? 'var(--accent-neon)' : 'transparent',
        color: active ? '#000' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent-neon)' : 'var(--line-border)'}`,
        borderRadius: '999px', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export default function DevPanel({
  authState, onAuth,
  scanState, onScan,
  queueState, onQueue,
  gaugeState, onGauge,
  resumeState, onResume,
  datasetSize, onDatasetSize,
  onOpenPreflight, onOpenDisclosure,
}) {
  // In-function DEV gate — replaces the original Plan 04's module-top throw.
  // Vite substitutes import.meta.env.DEV at build time; in prod this becomes
  // `if (!false) return null;` which is dead-code-eliminated along with the
  // entire component body. Combined with the JSX guard in BentoDashboard and
  // package.json `sideEffects: false`, the whole DevPanel module is dropped.
  if (!import.meta.env.DEV) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [failureMode, setFailureModeLocal] = useState(getFailureMode());

  const applyFailureMode = (mode) => {
    setFailureMode(mode);
    setFailureModeLocal(mode);
  };

  return (
    <div className="glass-card" style={{
      padding: '14px 16px', marginBottom: '16px',
      background: 'rgba(139, 92, 246, 0.08)',
      borderColor: 'rgba(139, 92, 246, 0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ color: 'var(--accent-purple)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          DEV PANEL · mock state toggles · NOT shipped to production
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={ROW}>
          <span style={LABEL}>Auth</span>
          {STATE_OPTIONS.auth.map((s) => (
            <TogglePill key={s} active={authState === s} onClick={() => onAuth(s)}>{s}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Scan</span>
          {STATE_OPTIONS.scan.map((s) => (
            <TogglePill key={s} active={scanState === s} onClick={() => onScan(s)}>{s}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Queue</span>
          {STATE_OPTIONS.queue.map((s) => (
            <TogglePill key={s} active={queueState === s} onClick={() => onQueue(s)}>{s}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Gauge</span>
          {STATE_OPTIONS.gauge.map((s) => (
            <TogglePill key={s} active={gaugeState === s} onClick={() => onGauge(s)}>{s}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Resume</span>
          {STATE_OPTIONS.resume.map((s) => (
            <TogglePill key={s} active={resumeState === s} onClick={() => onResume(s)}>{s}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Failure</span>
          {FAILURE_MODES.map((m) => (
            <TogglePill key={m} active={failureMode === m} onClick={() => applyFailureMode(m)}>{m}</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Dataset</span>
          {[500, 1000, 5000, 10000].map((n) => (
            <TogglePill key={n} active={datasetSize === n} onClick={() => onDatasetSize(n)}>{n.toLocaleString()} rows</TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Modals</span>
          <TogglePill active={false} onClick={onOpenPreflight}>Open PreflightModal</TogglePill>
          <TogglePill active={false} onClick={onOpenDisclosure}>Open DisclosureModal</TogglePill>
        </div>
      </div>
    </div>
  );
}
