// DisclosureModal — second-gate disclosure checklist (PRE-03).
// Hard gate: Proceed button is disabled until all 5 items are checked.
import { useState, useEffect } from "react";

export default function DisclosureModal({
  isOpen = false,
  onClose = () => {},
  onAcknowledge = () => {},
}) {
  const [checkedItems, setCheckedItems] = useState({
    comments: false,
    revisions: false,
    permissions: false,
    metadata: false,
    docLinks: false,
  });

  // Reset checkboxes when modal opens
  useEffect(() => {
    if (isOpen) {
      setCheckedItems({
        comments: false,
        revisions: false,
        permissions: false,
        metadata: false,
        docLinks: false,
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (key) => {
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const allChecked = Object.values(checkedItems).every(Boolean);

  const checkboxRowStyle = {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    userSelect: "none",
    transition: "background 0.2s, border-color 0.2s",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(16px)",
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
          width: "min(600px, 92vw)",
          boxShadow: "0 25px 50px rgba(0, 0, 0, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
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
          API Limitations & Data Loss Acknowledgment
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          Google Drive's native <code>files.copy</code> API enforces hard limits
          on metadata copy. To prevent unexpected data loss, you must verify and
          acknowledge each limitation below before proceeding:
        </p>

        {/* Checkbox Checklist Stack */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            margin: "20px 0",
          }}
        >
          <label
            style={{
              ...checkboxRowStyle,
              borderColor: checkedItems.comments
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(255, 255, 255, 0.05)",
              background: checkedItems.comments
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(255, 255, 255, 0.03)",
            }}
          >
            <input
              type="checkbox"
              checked={checkedItems.comments}
              onChange={() => handleToggle("comments")}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              <b>Comments & Suggestions:</b> Comments, unresolved threads, and document edit suggestions will be permanently stripped.
            </div>
          </label>

          <label
            style={{
              ...checkboxRowStyle,
              borderColor: checkedItems.revisions
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(255, 255, 255, 0.05)",
              background: checkedItems.revisions
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(255, 255, 255, 0.03)",
            }}
          >
            <input
              type="checkbox"
              checked={checkedItems.revisions}
              onChange={() => handleToggle("revisions")}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              <b>Revision History:</b> All prior version timelines, logs, and rollback checkpoints are completely erased.
            </div>
          </label>

          <label
            style={{
              ...checkboxRowStyle,
              borderColor: checkedItems.permissions
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(255, 255, 255, 0.05)",
              background: checkedItems.permissions
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(255, 255, 255, 0.03)",
            }}
          >
            <input
              type="checkbox"
              checked={checkedItems.permissions}
              onChange={() => handleToggle("permissions")}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              <b>Sharing & Permissions:</b> Starred labels, direct sharing grants, domain permissions, and link-sharing keys will reset.
            </div>
          </label>

          <label
            style={{
              ...checkboxRowStyle,
              borderColor: checkedItems.metadata
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(255, 255, 255, 0.05)",
              background: checkedItems.metadata
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(255, 255, 255, 0.03)",
            }}
          >
            <input
              type="checkbox"
              checked={checkedItems.metadata}
              onChange={() => handleToggle("metadata")}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              <b>Metadata Timestamps:</b> Original creation records and author footprints are reset. The destination becomes the new owner.
            </div>
          </label>

          <label
            style={{
              ...checkboxRowStyle,
              borderColor: checkedItems.docLinks
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(255, 255, 255, 0.05)",
              background: checkedItems.docLinks
                ? "rgba(16, 185, 129, 0.05)"
                : "rgba(255, 255, 255, 0.03)",
            }}
          >
            <input
              type="checkbox"
              checked={checkedItems.docLinks}
              onChange={() => handleToggle("docLinks")}
              style={{ marginTop: "3px", cursor: "pointer" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
              <b>Internal Document Links:</b> Hardcoded document IDs will change. Internal hyperlinks (e.g. Doc-to-Sheet) will remain pointed to original school documents.
            </div>
          </label>
        </div>

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
            Go back
          </button>
          <button
            disabled={!allChecked}
            onClick={onAcknowledge}
            style={{
              padding: "10px 18px",
              background: allChecked ? "var(--accent-neon)" : "rgba(255,255,255,0.03)",
              color: allChecked ? "#000" : "var(--text-secondary)",
              border: allChecked ? "none" : "1px solid var(--line-border)",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: allChecked ? "pointer" : "not-allowed",
              boxShadow: allChecked ? "0 0 12px rgba(16, 185, 129, 0.3)" : "none",
              opacity: allChecked ? 1 : 0.4,
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            onMouseEnter={(e) => {
              if (allChecked) {
                e.currentTarget.style.boxShadow =
                  "0 0 18px rgba(16, 185, 129, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (allChecked) {
                e.currentTarget.style.boxShadow =
                  "0 0 12px rgba(16, 185, 129, 0.3)";
              }
            }}
          >
            I understand — proceed
          </button>
        </div>
      </div>
    </div>
  );
}

