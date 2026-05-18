// PreflightModal — gate before migration starts (PRE-01..03). Phase 5 makes it a hard gate.
export default function PreflightModal({
  isOpen = false,
  onClose = () => {},
  onConfirm = () => {},
  fileCount = 0,
  totalSize = 0,
  destAvailable = 0,
}) {
  if (!isOpen) return null;
  const sizeGB = totalSize / 1024 ** 3;
  const availGB = destAvailable / 1024 ** 3;
  const over700 = sizeGB > 700;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="glass-card"
        style={{ padding: "28px", width: "min(520px, 90vw)" }}
      >
        <h2 style={{ marginTop: 0, color: "var(--text-primary)" }}>
          Pre-flight check
        </h2>
        <ul
          style={{
            color: "var(--text-primary)",
            lineHeight: 1.7,
            paddingLeft: "20px",
          }}
        >
          <li>
            <b>{fileCount.toLocaleString()}</b> files selected
          </li>
          <li>
            Total size: <b>{sizeGB.toFixed(1)} GB</b> (Google-native files count
            as 0)
          </li>
          <li>
            Destination headroom: <b>{availGB.toFixed(1)} GB</b>
          </li>
        </ul>
        {over700 && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "12px",
              background: "rgba(139, 92, 246, 0.15)",
              color: "var(--accent-purple)",
              fontSize: "13px",
            }}
          >
            ⚠ Your selection is approaching the 750 GB/day per-account copy cap
            enforced by Google. Migration may need to run across multiple days.
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
            marginTop: "20px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 16px",
              background: "var(--accent-neon)",
              color: "#000",
              border: "none",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            Start migration
          </button>
        </div>
      </div>
    </div>
  );
}
