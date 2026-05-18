// SmartFilterButtons — 3 buttons with live match counts and premium active glow states.
// Counts update reactively when props.files changes.
import { useMemo } from "react";
import { isAcademic, isAllStar, isCleanSlate } from "../services/filters.js";

export default function SmartFilterButtons({
  files = [],
  folders = [],
  activeFilters = { academic: false, allStar: false, cleanSlate: false },
  onToggleFilter = () => {},
}) {
  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  );

  const academicCount = useMemo(
    () => files.filter(isAcademic).length,
    [files],
  );

  const allStarCount = useMemo(
    () => files.filter((f) => isAllStar(f, foldersById)).length,
    [files, foldersById],
  );

  const cleanSlateCount = useMemo(
    () => files.filter(isCleanSlate).length,
    [files],
  );

  const Btn = ({ label, count, onClick, accentColor, isActive }) => (
    <button
      onClick={onClick}
      className="glass-card"
      style={{
        padding: "14px 18px",
        textAlign: "left",
        cursor: "pointer",
        background: isActive ? "rgba(255, 255, 255, 0.07)" : "var(--bg-card)",
        borderColor: isActive ? accentColor : "var(--line-border)",
        color: "var(--text-primary)",
        minWidth: "180px",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: isActive ? `0 0 12px ${accentColor}25` : "none",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600 }}>{label}</span>
        {isActive && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: accentColor,
              boxShadow: `0 0 6px ${accentColor}`,
            }}
          />
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          color: isActive ? accentColor : "var(--text-secondary)",
          transition: "color 0.2s",
        }}
      >
        {count.toLocaleString()} match{count === 1 ? "" : "es"}
      </div>
    </button>
  );

  return (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <Btn
        label="Academic Portfolio"
        count={academicCount}
        onClick={() => onToggleFilter("academic")}
        accentColor="var(--accent-neon)"
        isActive={activeFilters.academic}
      />
      <Btn
        label="All-Star Core"
        count={allStarCount}
        onClick={() => onToggleFilter("allStar")}
        accentColor="var(--accent-purple)"
        isActive={activeFilters.allStar}
      />
      <Btn
        label="Clean Slate"
        count={cleanSlateCount}
        onClick={() => onToggleFilter("cleanSlate")}
        accentColor="var(--text-secondary)"
        isActive={activeFilters.cleanSlate}
      />
    </div>
  );
}

