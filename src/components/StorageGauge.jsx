// StorageGauge — D-10 states: empty | partial | projected | over-quota.
// Real quota numbers in Phase 5; here we just visualize the state.
export default function StorageGauge({ state = "empty" }) {
  const PRESETS = {
    empty: { used: 5, projected: 5, label: "5% used (no migration planned)" },
    partial: { used: 42, projected: 42, label: "42 GB / 100 GB used" },
    projected: {
      used: 42,
      projected: 75,
      label: "42 GB used → 75 GB after migration",
    },
    "over-quota": {
      used: 95,
      projected: 120,
      label: "WARNING: 120 GB projected — exceeds 100 GB quota",
    },
  };
  const { used, projected, label } = PRESETS[state] || PRESETS.empty;
  const isOver = projected > 100;

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Storage
      </div>
      <div
        style={{
          position: "relative",
          height: "16px",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(used, 100)}%`,
            background: "var(--accent-neon)",
            transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        {projected > used && (
          <div
            style={{
              position: "absolute",
              left: `${Math.min(used, 100)}%`,
              top: 0,
              bottom: 0,
              width: `${Math.min(projected - used, 100 - used)}%`,
              background: isOver
                ? "var(--accent-purple)"
                : "rgba(139, 92, 246, 0.4)",
            }}
          />
        )}
      </div>
      <div
        style={{
          marginTop: "10px",
          color: isOver ? "var(--accent-purple)" : "var(--text-primary)",
          fontSize: "13px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: "4px",
          color: "var(--text-secondary)",
          fontSize: "11px",
          fontStyle: "italic",
        }}
      >
        Note: Google-native files (Docs/Sheets/Slides) count as 0 against quota.
      </div>
    </div>
  );
}
