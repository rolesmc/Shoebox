// StorageGauge — quota gauge and post-migration projections (GAUGE-01..03).
// Dynamically accepts usedBytes, limitBytes, and projectedBytes.
export default function StorageGauge({
  usedBytes = 0,
  limitBytes = 15 * 1024 ** 3, // Default to 15 GB Google free tier
  projectedBytes = 0,
}) {
  const usedGB = usedBytes / 1024 ** 3;
  const limitGB = limitBytes / 1024 ** 3;
  const projectedGB = (usedBytes + projectedBytes) / 1024 ** 3;
  const addedGB = projectedBytes / 1024 ** 3;

  const usedPct = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
  const projectedPct =
    limitBytes > 0 ? ((usedBytes + projectedBytes) / limitBytes) * 100 : 0;

  const isOver = projectedPct > 100;

  // Formatting helper
  const formatGB = (gb) => {
    if (gb < 0.1 && gb > 0) return gb.toFixed(3);
    if (gb < 1) return gb.toFixed(2);
    return gb.toFixed(1);
  };

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
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
        Storage Projection
      </div>

      {/* Progress Bar Container */}
      <div
        style={{
          position: "relative",
          height: "16px",
          borderRadius: "8px",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Existing Used Bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(usedPct, 100)}%`,
            background: "var(--accent-neon)",
            boxShadow: "0 0 8px rgba(16, 185, 129, 0.4)",
            transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />

        {/* Projected Size Bar Overlay */}
        {projectedBytes > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(usedPct, 100)}%`,
              top: 0,
              bottom: 0,
              width: `${Math.min(projectedPct - usedPct, 100 - usedPct)}%`,
              background: isOver
                ? "rgba(239, 68, 68, 0.85)"
                : "rgba(139, 92, 246, 0.65)",
              boxShadow: isOver
                ? "0 0 10px rgba(239, 68, 68, 0.6)"
                : "0 0 8px rgba(139, 92, 246, 0.4)",
              transition: "left 300ms, width 300ms",
            }}
          />
        )}
      </div>

      {/* Numerical Stats Labels */}
      <div style={{ marginTop: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "var(--text-primary)",
            fontWeight: 500,
          }}
        >
          <span>Current Destination Used:</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {formatGB(usedGB)} GB / {formatGB(limitGB)} GB ({usedPct.toFixed(1)}
            %)
          </span>
        </div>

        {projectedBytes > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              marginTop: "4px",
              fontWeight: 500,
              color: isOver ? "var(--accent-purple)" : "var(--accent-neon)",
            }}
          >
            <span>Projected Growth:</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              +{formatGB(addedGB)} GB ({projectedPct.toFixed(1)}% total)
            </span>
          </div>
        )}
      </div>

      {/* Over Quota Danger Banner */}
      {isOver && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#f87171",
            fontSize: "12px",
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          ⚠ WARNING: Selected files (+{formatGB(addedGB)} GB) will exceed the
          destination storage capacity by {(projectedGB - limitGB).toFixed(1)}{" "}
          GB.
        </div>
      )}

      {/* Bottom informational disclaimer footnote (GAUGE-03) */}
      <div
        style={{
          marginTop: "14px",
          color: "var(--text-secondary)",
          fontSize: "11px",
          lineHeight: 1.4,
          borderTop: "1px solid var(--line-border)",
          paddingTop: "10px",
        }}
      >
        <span style={{ fontStyle: "italic" }}>Note:</span> Google-native files
        (Docs, Sheets, Slides) count as <b style={{ color: "#fff" }}>0</b> bytes
        against copy quota projections.
      </div>
    </div>
  );
}

