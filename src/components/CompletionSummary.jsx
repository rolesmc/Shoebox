// univault/src/components/CompletionSummary.jsx
//
// Phase 9 POLISH-03: completion summary card.
//
// Renders "X migrated · Y skipped · Z failed [· W unknown]" with native
// <details> rows for each failure. Collapsed by default; expansion reveals
// the per-task errorMsg.
//
// Pitfall 6: task.errorMsg may include Drive file IDs / names / path
// fragments from the raw API error body. React auto-escapes text content,
// so this is XSS-safe — but we still keep it inside <details> so a user
// must explicitly opt in to seeing (and screenshotting) the detail.
//
// Pitfall 9: visibility includes done | failed-with-retries | stopped-quota
// — but confetti fires only on `done` (see BentoDashboard useEffect).

import { ChevronRight } from "lucide-react";

export default function CompletionSummary({
  visible,
  completedCount = 0,
  skippedCount = 0,
  failedCount = 0,
  unknownCount = 0,
  failures = [],
  filesById,
}) {
  if (!visible) return null;

  const total = completedCount + skippedCount + failedCount + unknownCount;

  return (
    <div
      className="glass-card completion-summary"
      style={{ padding: "20px", marginTop: "12px" }}
      role="region"
      aria-label="Migration completion summary"
    >
      <div
        className="completion-counts"
        style={{
          display: "flex",
          gap: "16px",
          fontSize: "14px",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          flexWrap: "wrap",
          marginBottom: failures.length > 0 ? "16px" : 0,
        }}
      >
        <span style={{ color: "var(--accent-neon)" }}>
          {completedCount} migrated
        </span>
        {skippedCount > 0 && (
          <span style={{ color: "var(--text-secondary)" }}>
            {skippedCount} skipped
          </span>
        )}
        {failedCount > 0 && (
          <span style={{ color: "#f87171" }}>
            {failedCount} failed
          </span>
        )}
        {unknownCount > 0 && (
          <span style={{ color: "var(--text-secondary)" }}>
            {unknownCount} unknown
          </span>
        )}
        <span style={{ color: "var(--text-secondary)", marginLeft: "auto" }}>
          of {total}
        </span>
      </div>

      {failures.length > 0 && (
        <div className="failure-list">
          {failures.map((task) => (
            <details key={task.id} className="failure-row">
              <summary>
                <ChevronRight
                  size={12}
                  className="failure-chevron"
                  aria-hidden="true"
                />
                <span className="failure-name">
                  {filesById?.get?.(task.id)?.name ?? task.id}
                </span>
                <span className="failure-reason-tag">
                  {task.reason ?? "failed"}
                </span>
              </summary>
              <pre className="failure-detail">
                {task.errorMsg ?? "(no detail recorded)"}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
