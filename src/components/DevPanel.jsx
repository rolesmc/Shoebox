// src/components/DevPanel.jsx
// DEV-only toggle panel for Phase 0. Design notes:
//   • No module-top throw — that would be a side effect and would block tree-shake.
//   • DEV gate lives INSIDE the component function, AFTER all hook calls (rules-of-hooks).
//   • STATE_OPTIONS comes from './stateOptions.js' (NOT from BentoDashboard.jsx).
//     This breaks the circular-import risk between composer and dev surface.
//   • FAILURE_MODES is loaded via dynamic import so the static module graph stays
//     mock-free; the Failure pill row is disabled until the import resolves so
//     the first click cannot land on a no-op stub (W-02 fix).

import { useState, useEffect } from "react";
import { STATE_OPTIONS } from "./stateOptions.js";

const ROW = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};
const LABEL = {
  color: "var(--text-secondary)",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  minWidth: "70px",
};

function TogglePill({
  active,
  onClick,
  children,
  disabled = false,
  className,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        padding: "4px 10px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        background: active ? "var(--accent-neon)" : "transparent",
        color: active ? "#000" : "var(--text-secondary)",
        border: `1px solid ${active ? "var(--accent-neon)" : "var(--line-border)"}`,
        borderRadius: "999px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {children}
    </button>
  );
}

export default function DevPanel({
  authState,
  onAuth,
  scanState,
  onScan,
  queueState,
  onQueue,
  gaugeState,
  onGauge,
  resumeState,
  onResume,
  datasetSize,
  onDatasetSize,
  onOpenPreflight,
  onOpenDisclosure,
}) {
  // Lazy-load failureInjection so the prod static graph never references it.
  // While DevPanel is JSX-gated out of prod by BentoDashboard, this also
  // keeps DevPanel's own module graph mock-free for defense in depth.
  const [failureModes, setFailureModes] = useState([]);
  const [failureMode, setFailureModeLocal] = useState("none");
  const [setFailureModeFn, setSetFailureModeFn] = useState(() => () => {});
  // W-02 fix: gate Failure-row pills until the dynamic import resolves
  // so the first click cannot land on the no-op stub.
  const [failureApiReady, setFailureApiReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    (async () => {
      const mod = await import("../mocks/failureInjection.js");
      if (cancelled) return;
      setFailureModes(mod.FAILURE_MODES);
      setFailureModeLocal(mod.getFailureMode());
      // Wrap in arrow to avoid useState's function-call-on-init footgun.
      setSetFailureModeFn(() => mod.setFailureMode);
      setFailureApiReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // In-function DEV gate — placed AFTER all hook calls so React's rules-of-hooks
  // are satisfied. Vite substitutes import.meta.env.DEV at build time; in prod
  // this becomes `if (!false) return null;` which is dead-code-eliminated along
  // with the entire component body.
  if (!import.meta.env.DEV) return null;

  const applyFailureMode = (mode) => {
    if (!failureApiReady) return;
    setFailureModeFn(mode);
    setFailureModeLocal(mode);
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: "14px 16px",
        marginBottom: "16px",
        background: "rgba(139, 92, 246, 0.08)",
        borderColor: "rgba(139, 92, 246, 0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            color: "var(--accent-purple)",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          DEV PANEL · mock state toggles · NOT shipped to production
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={ROW}>
          <span style={LABEL}>Auth</span>
          {STATE_OPTIONS.auth.map((s) => (
            <TogglePill
              key={s}
              active={authState === s}
              onClick={() => onAuth(s)}
            >
              {s}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Scan</span>
          {STATE_OPTIONS.scan.map((s) => (
            <TogglePill
              key={s}
              active={scanState === s}
              onClick={() => onScan(s)}
            >
              {s}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Queue</span>
          {STATE_OPTIONS.queue.map((s) => (
            <TogglePill
              key={s}
              active={queueState === s}
              onClick={() => onQueue(s)}
            >
              {s}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Gauge</span>
          {STATE_OPTIONS.gauge.map((s) => (
            <TogglePill
              key={s}
              active={gaugeState === s}
              onClick={() => onGauge(s)}
            >
              {s}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Resume</span>
          {STATE_OPTIONS.resume.map((s) => (
            <TogglePill
              key={s}
              active={resumeState === s}
              onClick={() => onResume(s)}
            >
              {s}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Failure</span>
          {failureModes.map((m) => (
            <TogglePill
              key={m}
              active={failureMode === m}
              onClick={() => applyFailureMode(m)}
              disabled={!failureApiReady}
              className={!failureApiReady ? "pill-disabled" : undefined}
            >
              {m}
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Dataset</span>
          {[500, 1000, 5000, 10000].map((n) => (
            <TogglePill
              key={n}
              active={datasetSize === n}
              onClick={() => onDatasetSize(n)}
            >
              {n.toLocaleString()} rows
            </TogglePill>
          ))}
        </div>
        <div style={ROW}>
          <span style={LABEL}>Modals</span>
          <TogglePill active={false} onClick={onOpenPreflight}>
            Open PreflightModal
          </TogglePill>
          <TogglePill active={false} onClick={onOpenDisclosure}>
            Open DisclosureModal
          </TogglePill>
        </div>
      </div>
    </div>
  );
}
