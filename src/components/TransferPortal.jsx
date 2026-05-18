// TransferPortal — active transfer controller and real-time statistic reporter (POLISH-01).
// Integrates live stats and standard action buttons for starting, pausing, and resuming.
import { useMemo } from "react";

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function TransferPortal({
  state = "idle",
  hasBothTokens = false,
  selectedCount = 0,
  completedCount = 0,
  failedCount = 0,
  copiedSize = 0,
  totalSize = 0,
  onStart = () => {},
  onPause = () => {},
  onResume = () => {},
  onReset = () => {},
}) {
  const headline = useMemo(() => {
    switch (state) {
      case "idle":
        return "Ready to migrate";
      case "mirroring":
        return "Mirroring folders…";
      case "copying":
        return "Copying files…";
      case "paused":
        return "Paused";
      case "done":
        return "Migration complete!";
      case "failed-with-retries":
        return "⚠ Some files failed";
      default:
        return "Ready to migrate";
    }
  }, [state]);

  const detail = useMemo(() => {
    switch (state) {
      case "idle":
        if (!hasBothTokens) {
          return "Connect both accounts to establish transfer channel.";
        }
        if (selectedCount === 0) {
          return "Select files in the browser to start migration.";
        }
        return `Ready to migrate ${selectedCount} file${selectedCount === 1 ? "" : "s"} (${formatBytes(totalSize)})`;
      case "mirroring":
        return "Recreating folder structure in destination.";
      case "copying":
        return `3 parallel transfers · ${completedCount} of ${selectedCount} files · ${formatBytes(copiedSize)} of ${formatBytes(totalSize)}`;
      case "paused":
        return `Paused at ${completedCount} of ${selectedCount} files (${formatBytes(copiedSize)})`;
      case "done":
        return `${completedCount} files migrated successfully · ${failedCount} failed`;
      case "failed-with-retries":
        return `${failedCount} file${failedCount === 1 ? "" : "s"} failed after exponential backoff retries.`;
      default:
        return "";
    }
  }, [state, hasBothTokens, selectedCount, completedCount, failedCount, copiedSize, totalSize]);

  const accent = useMemo(() => {
    if (state === "done") return "var(--accent-neon)";
    if (state === "failed-with-retries" || failedCount > 0) return "#f87171";
    if (state === "copying" || state === "mirroring") return "var(--accent-purple)";
    return "var(--text-primary)";
  }, [state, failedCount]);

  return (
    <div
      className="glass-card"
      style={{
        padding: "24px",
        minHeight: "200px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        transition: "all 0.3s ease-in-out",
      }}
    >
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
          fontWeight: 600,
        }}
      >
        Transfer Portal
      </div>
      <div
        style={{
          color: accent,
          fontSize: "22px",
          fontWeight: 600,
          marginBottom: "8px",
          transition: "color 0.3s",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.4,
          maxWidth: "320px",
          minHeight: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {detail}
      </div>

      {/* Dynamic Action Buttons */}
      <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
        {state === "idle" && (
          <button
            onClick={onStart}
            disabled={!hasBothTokens || selectedCount === 0}
            style={{
              padding: "8px 20px",
              background: (!hasBothTokens || selectedCount === 0) ? "rgba(255,255,255,0.03)" : "var(--accent-neon)",
              color: (!hasBothTokens || selectedCount === 0) ? "rgba(255,255,255,0.15)" : "#000",
              border: "none",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: (!hasBothTokens || selectedCount === 0) ? "not-allowed" : "pointer",
              boxShadow: (!hasBothTokens || selectedCount === 0) ? "none" : "0 0 12px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s",
            }}
          >
            Start Migration
          </button>
        )}

        {state === "copying" && (
          <button
            onClick={onPause}
            style={{
              padding: "8px 20px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--text-primary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Pause
          </button>
        )}

        {state === "paused" && (
          <>
            <button
              onClick={onResume}
              style={{
                padding: "8px 20px",
                background: "var(--accent-purple)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: "0 0 12px rgba(139, 92, 246, 0.3)",
                transition: "all 0.2s",
              }}
            >
              Resume
            </button>
            <button
              onClick={onReset}
              style={{
                padding: "8px 20px",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--line-border)",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Reset
            </button>
          </>
        )}

        {(state === "done" || state === "failed-with-retries") && (
          <button
            onClick={onReset}
            style={{
              padding: "8px 20px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--text-primary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Start New Migration
          </button>
        )}
      </div>
    </div>
  );
}

