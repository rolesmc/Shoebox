// PreflightModal — pre-flight gate validation (PRE-01, PRE-02).
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
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="glass-card"
        style={{
          padding: "28px",
          width: "min(520px, 90vw)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            color: "var(--text-primary)",
            fontSize: "20px",
            fontWeight: 600,
          }}
        >
          Pre-flight Checklist
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          Verify your migration footprint prior to establishing the copy pool:
        </p>
        <ul
          style={{
            color: "var(--text-primary)",
            lineHeight: 1.8,
            paddingLeft: "20px",
            fontSize: "14px",
          }}
        >
          <li>
            Selected Items:{" "}
            <b style={{ color: "var(--accent-neon)" }}>
              {fileCount.toLocaleString()}
            </b>{" "}
            files
          </li>
          <li>
            Migration Payload:{" "}
            <b style={{ color: "var(--accent-purple)" }}>
              {sizeGB < 0.1 && sizeGB > 0 ? sizeGB.toFixed(3) : sizeGB.toFixed(1)}{" "}
              GB
            </b>
          </li>
          <li>
            Destination Headroom: <b>{availGB.toFixed(1)} GB</b> available
          </li>
        </ul>

        {over700 && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px",
              borderRadius: "12px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            ⚠ <b>Attention:</b> Your selection exceeds 700 GB. This is very close
            to Google's daily per-account transfer restriction limit (750 GB).
            UniVault will copy up to the daily cap and pause, allowing you to
            resume tomorrow without duplicate effort.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            marginTop: "24px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#fff";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--line-border)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 18px",
              background: "var(--accent-neon)",
              color: "#000",
              border: "none",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 0 12px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 18px rgba(16, 185, 129, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 12px rgba(16, 185, 129, 0.3)";
            }}
          >
            Start migration
          </button>
        </div>
      </div>
    </div>
  );
}

