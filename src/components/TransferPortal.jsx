// TransferPortal — active transfer controller and real-time statistic reporter (POLISH-01).
// Integrates live stats and standard action buttons for starting, pausing, and resuming.
import { useMemo } from "react";
import { Pause, Play, RefreshCw, Loader2 } from "lucide-react";

function formatBytes(bytes) {
  // WR-07: guard against NaN / non-finite / negative inputs. parseFloat(NaN.toFixed(1))
  // returns NaN, which would render as the string "NaN B" in the UI. Drive API
  // `size` is a string and a malformed payload can poison the aggregate sums.
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
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
  skippedCount = 0,
  unknownCount = 0,
  inFlightCount = 0,
  copiedSize = 0,
  totalSize = 0,
  onStart = () => {},
  onPause = () => {},
  onResume = () => {},
  onReset = () => {},
  onRetryFailed = () => {},
  onCancelMirror = () => {},
}) {
  // WR-05: derived gate for the Pause button. During the brief window between
  // "last task finished" and "queueState transitions to done", inFlightCount === 0
  // even though state is still "copying". Showing Pause then lets the user no-op
  // into paused-with-empty-queue. Hide Pause once there's nothing left to pause.
  const pauseEligibleTotal = selectedCount - skippedCount;
  const hasUnfinishedWork = inFlightCount > 0 || completedCount < pauseEligibleTotal;
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
      case "stopped-quota":
        return "Quota reached";
      case "done":
        return "Migration complete!";
      case "failed-with-retries":
        return "Some files failed";   // D-UI: dropped warning emoji per UI-SPEC; destructive color carries the signal
      default:
        return "Ready to migrate";
    }
  }, [state]);

  const detail = useMemo(() => {
    const totalForCounter = selectedCount - skippedCount;
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
        // D-15: dropped concurrency prefix — concurrency is implementation detail.
        // UI-SPEC §Aggregate Counter: `{completed} of {total} files · {bytesDone} of {bytesTotal}`
        return `${completedCount} of ${totalForCounter} files · ${formatBytes(copiedSize)} of ${formatBytes(totalSize)}`;
      case "paused":
        if (inFlightCount > 0) {
          return `Finishing ${inFlightCount} in-flight file${inFlightCount === 1 ? "" : "s"} before pause completes…`;
        }
        return `Paused at ${completedCount} of ${totalForCounter} files (${formatBytes(copiedSize)})`;
      case "stopped-quota":
        return `Daily copy limit hit. Saved ${completedCount} of ${totalForCounter} files. Try again tomorrow.`;
      case "done": {
        const parts = [`${completedCount} migrated`];
        if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
        if (failedCount > 0) parts.push(`${failedCount} failed`);
        if (unknownCount > 0) parts.push(`${unknownCount} unknown`);
        return parts.join(" · ");
      }
      case "failed-with-retries":
        return `${failedCount} file${failedCount === 1 ? "" : "s"} failed after exponential backoff retries.`;
      default:
        return "";
    }
  }, [state, hasBothTokens, selectedCount, completedCount, failedCount, skippedCount, unknownCount, inFlightCount, copiedSize, totalSize]);

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
        role="status"
        aria-live="polite"
        aria-atomic="true"
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
      <div style={{ marginTop: "20px", display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
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

        {/* WR-05: Cancel mirror — the mirror phase previously rendered no
            buttons at all, leaving sign-out as the only way to abort a
            runaway folder create stream. The mirror useEffect cleanup
            handles the abort when queueState transitions away from
            "mirroring". */}
        {state === "mirroring" && (
          <button
            onClick={onCancelMirror}
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
            title="Cancel folder mirror. In-flight folder create requests still complete (drain-don't-abort)."
          >
            Cancel mirror
          </button>
        )}

        {/* WR-05: gate Pause by hasUnfinishedWork so the brief copying→done
            transition window can't render Pause for an effectively-empty queue. */}
        {state === "copying" && hasUnfinishedWork && (
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
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Pause size={12} aria-hidden="true" /> Pause
          </button>
        )}

        {/* D-12: Pause drain — disabled "Finishing… (N in flight)" until inFlightCount === 0. */}
        {state === "paused" && inFlightCount > 0 && (
          <button
            disabled
            aria-disabled="true"
            aria-label={`Finishing ${inFlightCount} in-flight file${inFlightCount === 1 ? "" : "s"} before pause completes`}
            style={{
              padding: "8px 20px",
              background: "rgba(255, 255, 255, 0.04)",
              color: "var(--text-secondary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "not-allowed",
              transition: "all 0.2s",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Loader2 size={12} aria-label="Finishing pause" style={{ animation: "spin 1s linear infinite" }} />
            Finishing… ({inFlightCount} in flight)
          </button>
        )}

        {state === "paused" && inFlightCount === 0 && (
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
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Play size={12} aria-hidden="true" /> Resume
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
              title="Clears the transfer queue but preserves the destination folder mapping for resume. Sign out to start a fully fresh migration."
            >
              Clear queue
            </button>
          </>
        )}

        {(state === "done" || state === "failed-with-retries") && failedCount > 0 && (
          <button
            onClick={onRetryFailed}
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
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={12} aria-hidden="true" /> Retry Failed ({failedCount})
          </button>
        )}

        {(state === "done" || state === "failed-with-retries" || state === "stopped-quota") && (
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

