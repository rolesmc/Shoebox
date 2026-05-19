// FileExplorer — virtualized table backed by react-window (D-09, FILES-01..05).
// Renders per-row statuses (pending | copying | completed | failed | skipped | unknown) synced reactively.
import { FixedSizeList } from "react-window";
import { useMemo, useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, MinusCircle, AlertTriangle } from "lucide-react";

const ROW_HEIGHT = 38; // px — fixed per row
const LIST_HEIGHT = 480; // px — viewport height

// Column widths sum approximately to the available width; grid template applied per row.
const COL_TEMPLATE = "24px minmax(0, 1.2fr) 95px 75px 120px";

function ErrorDropdown({ errorMsg }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        display: "inline-block",
      }}
      onClick={(e) => e.stopPropagation()} // Prevent bubble toggle
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "#f87171",
          background: "rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          padding: "2px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
          e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)";
          e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.25)";
        }}
      >
        <span style={{ fontSize: "10px" }}>⚠</span> Info
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "24px",
            zIndex: 100,
            width: "240px",
            padding: "10px 12px",
            background: "rgba(20, 20, 25, 0.98)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
            color: "#fca5a5",
            fontSize: "11px",
            lineHeight: 1.4,
            textAlign: "left",
          }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}

function Row({ index, style, data }) {
  const { files, selectedIds, onToggle, transferStatuses = {} } = data;
  const f = files[index];
  if (!f) return null;

  const sizeBytes = Number(f.size || 0);
  const sizeLabel =
    sizeBytes === 0
      ? "—"
      : sizeBytes < 1024
        ? `${sizeBytes}B`
        : sizeBytes < 1024 * 1024
          ? `${(sizeBytes / 1024).toFixed(0)}K`
          : sizeBytes < 1024 * 1024 * 1024
            ? `${(sizeBytes / 1024 / 1024).toFixed(1)}M`
            : `${(sizeBytes / 1024 / 1024 / 1024).toFixed(2)}G`;

  const mimeShort = f.mimeType
    .replace("application/vnd.google-apps.", "")
    .replace("application/", "");

  const transfer = transferStatuses[f.id];

  const renderStatus = () => {
    if (!transfer) return null;

    switch (transfer.status) {
      case "pending":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-secondary)",
              fontSize: "12px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.25)",
              }}
            />
            Pending
          </span>
        );
      case "copying":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--accent-purple)",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            <Loader2 size={12} aria-label="Copying" style={{ animation: "spin 1s linear infinite" }} />
            Copying…
          </span>
        );
      case "completed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--accent-neon)",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            <CheckCircle2 size={12} aria-hidden="true" />
            Completed
          </span>
        );
      case "failed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#f87171",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            <XCircle size={12} aria-hidden="true" />
            <ErrorDropdown errorMsg={transfer.errorMsg || "Unknown Google API error."} />
          </span>
        );
      case "skipped":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: 500,
            }}
            title={transfer.reason || "Skipped"}
          >
            <MinusCircle size={12} aria-hidden="true" />
            Skipped
          </span>
        );
      case "unknown":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: 500,
            }}
            title="Network interrupted — status uncertain. Resume to retry after reconnecting."
          >
            <AlertTriangle size={12} aria-hidden="true" />
            Unknown
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        ...style, // CRITICAL: positioning from react-window
        display: "grid",
        gridTemplateColumns: COL_TEMPLATE,
        alignItems: "center",
        gap: "12px",
        padding: "0 12px",
        borderBottom: "1px solid var(--line-border)",
        color: "var(--text-primary)",
        fontSize: "13px",
        boxSizing: "border-box",
      }}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(f.id)}
        onChange={() => onToggle(f.id)}
        style={{ cursor: "pointer" }}
      />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {f.starred ? "★ " : ""}
        {f.name}
      </span>
      <span
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {mimeShort}
      </span>
      <span
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          textAlign: "right",
        }}
      >
        {sizeLabel}
      </span>
      <div style={{ paddingLeft: "8px" }}>{renderStatus()}</div>
    </div>
  );
}

export default function FileExplorer({
  files = [],
  selectedIds = new Set(),
  onToggle = () => {},
  onToggleBulk = () => {},
  scanState = "idle",
  onScan = null,
  hasSourceToken = false,
  transferStatuses = {},
}) {
  // Pass-through identity-stable data object to the FixedSizeList Row renderer.
  const itemData = useMemo(
    () => ({ files, selectedIds, onToggle, transferStatuses }),
    [files, selectedIds, onToggle, transferStatuses],
  );

  // Bulk select-all / clear bar — operates on the currently-displayed slice (D-12: bulk select bar).
  const visibleSelectedCount = useMemo(() => {
    let count = 0;
    files.forEach((f) => {
      if (selectedIds.has(f.id)) count++;
    });
    return count;
  }, [files, selectedIds]);

  const allSelected = files.length > 0 && visibleSelectedCount === files.length;

  const selectAll = () => {
    const idsArray = files.map((f) => f.id);
    onToggleBulk(idsArray, !allSelected);
  };

  // Width: track container width so FixedSizeList sizes correctly.
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="glass-card" style={{ padding: "16px" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary)",
              fontSize: "16px",
            }}
          >
            Files
          </h3>
          {hasSourceToken && onScan && (
            <button
              onClick={() => onScan("scanning")}
              disabled={scanState === "scanning"}
              style={{
                padding: "4px 10px",
                background:
                  scanState === "scanning"
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(139, 92, 246, 0.15)",
                color:
                  scanState === "scanning"
                    ? "var(--text-secondary)"
                    : "var(--accent-purple)",
                border: `1px solid ${scanState === "scanning" ? "rgba(255,255,255,0.1)" : "var(--accent-purple)"}`,
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: scanState === "scanning" ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {scanState === "scanning"
                ? "Scanning..."
                : scanState === "done"
                  ? "Rescan"
                  : "Scan"}
            </button>
          )}
        </div>
        <span
          style={{
            color: "var(--text-secondary)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {files.length.toLocaleString()} rows visible ·{" "}
          {selectedIds.size.toLocaleString()} selected
        </span>
      </div>

      {/* Bulk select bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
          padding: "6px 12px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "8px",
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={selectAll}
          aria-label="Select all rows"
          style={{ cursor: "pointer" }}
        />
        <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
          {allSelected ? "Clear visible" : "Select all visible"}
        </span>
        {selectedIds.size > 0 && (
          <span
            style={{
              marginLeft: "auto",
              color: "var(--accent-neon)",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
            }}
          >
            {selectedIds.size.toLocaleString()} selected total
          </span>
        )}
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COL_TEMPLATE,
          gap: "12px",
          padding: "6px 12px",
          borderBottom: "2px solid var(--line-border)",
          color: "var(--text-secondary)",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span />
        <span>Name</span>
        <span>Type</span>
        <span style={{ textAlign: "right" }}>Size</span>
        <span style={{ paddingLeft: "8px" }}>Status</span>
      </div>

      {/* Virtualized list */}
      <div
        ref={containerRef}
        style={{ marginTop: "4px" }}
        data-testid="file-explorer-list"
      >
        {width > 0 && files.length > 0 ? (
          <FixedSizeList
            height={LIST_HEIGHT}
            itemCount={files.length}
            itemSize={ROW_HEIGHT}
            width={width}
            itemData={itemData}
            overscanCount={6}
          >
            {Row}
          </FixedSizeList>
        ) : (
          <div
            style={{
              padding: "40px 12px",
              color: "var(--text-secondary)",
              fontSize: "13px",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            {files.length === 0 ? "No files visible matching current filters." : "Sizing…"}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "8px",
          color: "var(--text-secondary)",
          fontSize: "10px",
          fontFamily: "var(--font-mono)",
        }}
      >
        Virtualized via react-window (D-09) · Updates stored in IndexedDB (PERS-01).
      </div>
    </div>
  );
}

