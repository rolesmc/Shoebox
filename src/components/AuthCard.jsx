// AuthCard — rendered twice (source + dest). Pure presentational; states drive the look.
// States per D-10: disconnected | connected | expired. (DevPanel toggle: disconnected, source-only,
// dest-only, both, expired — composed at the dashboard level into per-card state below.)
import { CloudOff, CheckCircle, AlertTriangle } from "lucide-react";

const LABEL = {
  source: "School Account (Source)",
  dest: "Personal Account (Destination)",
};

export default function AuthCard({ account, state, email, onConnect }) {
  const isConnected = state === "connected";
  const isExpired = state === "expired";
  const Icon = isConnected ? CheckCircle : isExpired ? AlertTriangle : CloudOff;
  const accent = isConnected
    ? "var(--accent-neon)"
    : isExpired
      ? "var(--accent-purple)"
      : "var(--text-secondary)";

  return (
    <div className="glass-card" style={{ padding: "20px", minHeight: "135px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <Icon size={20} color={accent} />
        <span
          style={{
            color: "var(--text-secondary)",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {LABEL[account]}
        </span>
      </div>
      {isConnected ? (
        <>
          <div
            style={{
              color: "var(--text-primary)",
              fontSize: "15px",
              fontWeight: 500,
            }}
          >
            {email || "unknown@example.com"}
          </div>
          <div
            style={{
              color: "var(--accent-neon)",
              fontSize: "12px",
              marginTop: "4px",
            }}
          >
            Connected
          </div>
        </>
      ) : isExpired ? (
        <>
          <div
            style={{
              color: "var(--text-primary)",
              fontSize: "15px",
              fontWeight: 500,
              opacity: 0.7,
            }}
          >
            {email || "unknown@example.com"}
          </div>
          <div
            style={{
              color: "var(--accent-purple)",
              fontSize: "12px",
              marginTop: "4px",
              marginBottom: "8px",
            }}
          >
            Session expired — reconnect to resume
          </div>
          <button
            style={{
              marginTop: "4px",
              padding: "6px 12px",
              background: "rgba(139, 92, 246, 0.15)",
              color: "var(--accent-purple)",
              border: "1px solid var(--accent-purple)",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "12px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(139, 92, 246, 0.15)";
            }}
            onClick={onConnect}
          >
            Reconnect
          </button>
        </>
      ) : (
        <button
          style={{
            marginTop: "8px",
            padding: "10px 16px",
            background: "var(--accent-neon)",
            color: "#000",
            border: "none",
            borderRadius: "12px",
            fontWeight: 600,
            fontSize: "14px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = "brightness(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "none";
          }}
          onClick={onConnect}
        >
          Connect {account === "source" ? "School" : "Personal"} Account
        </button>
      )}
    </div>
  );
}
