import React, { useState } from "react";
import { X, Shield, Key } from "lucide-react";

export default function MockLoginModal({ isOpen, accountType, onSelect, onClose }) {
  if (!isOpen) return null;

  const isSource = accountType === "source";
  const accentColor = isSource ? "var(--accent-neon)" : "var(--accent-purple)";
  
  const mockAccounts = isSource
    ? [
        { email: "student@school.edu", name: "Alex Student", desc: "Institutional Source Workspace" },
        { email: "graduating@university.edu", name: "Alex Graduate", desc: "Secondary School Account" }
      ]
    : [
        { email: "alex.me@gmail.com", name: "Alex Chen (Personal)", desc: "Personal Google Account" },
        { email: "backup.alex@gmail.com", name: "Alex Chen (Backup)", desc: "Alternative Destination Account" }
      ];

  const [customEmail, setCustomEmail] = useState("");
  const [error, setError] = useState("");

  const handleSelect = (email) => {
    const fakeToken = `mock_${accountType}_token_${Math.random().toString(36).substring(2, 15)}`;
    onSelect(email, fakeToken);
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customEmail) {
      setError("Please enter an email address");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(customEmail)) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    handleSelect(customEmail);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6, 6, 8, 0.85)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "20px",
      }}
    >
      <div
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "rgba(18, 18, 24, 0.9)",
          border: `1px solid ${accentColor}33`,
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.7), 0 0 20px ${accentColor}11`,
          padding: "32px",
          position: "relative",
          transform: "none", // Prevent glass-card transform override
        }}
      >
        {/* Header */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            padding: "4px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          <X size={20} />
        </button>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: `${accentColor}15`,
              border: `1px solid ${accentColor}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              boxShadow: `0 0 15px ${accentColor}22`,
            }}
          >
            <Shield size={24} color={accentColor} />
          </div>
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: "20px",
              fontWeight: 700,
              margin: "0 0 6px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Google OAuth Consent Simulation
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "13px",
              margin: 0,
              lineHeight: "1.5",
            }}
          >
            Choose a mock identity for your{" "}
            <span style={{ color: accentColor, fontWeight: 600 }}>
              {isSource ? "School (Source)" : "Personal (Destination)"}
            </span>{" "}
            account to simulate Google Identity Services.
          </p>
        </div>

        {/* Options List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
          {mockAccounts.map((acc, index) => (
            <button
              key={index}
              onClick={() => handleSelect(acc.email)}
              style={{
                width: "100%",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "14px",
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                textAlign: "left",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.borderColor = accentColor;
                e.currentTarget.style.boxShadow = `0 0 12px ${accentColor}11`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: `${accentColor}22`,
                  color: accentColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                {acc.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>{acc.name}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "2px" }}>{acc.email}</div>
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "10px", opacity: 0.6 }}>{acc.desc}</div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.06)" }}></div>
          <span style={{ padding: "0 12px", color: "var(--text-secondary)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Or custom email</span>
          <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.06)" }}></div>
        </div>

        {/* Custom Input Form */}
        <form onSubmit={handleCustomSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="e.g. user@domain.com"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              style={{
                flex: 1,
                background: "rgba(0, 0, 0, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
                padding: "10px 14px",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                fontSize: "13px",
                transition: "all 0.2s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)")}
            />
            <button
              type="submit"
              style={{
                background: accentColor,
                color: "#000",
                border: "none",
                borderRadius: "10px",
                padding: "0 18px",
                fontWeight: 600,
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
            >
              <Key size={14} />
              Connect
            </button>
          </div>
          {error && (
            <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "2px" }}>
              {error}
            </div>
          )}
        </form>

        {/* Scope disclaimer */}
        <div
          style={{
            marginTop: "24px",
            background: "rgba(255, 255, 255, 0.01)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            borderRadius: "10px",
            padding: "12px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ color: "var(--text-secondary)", fontSize: "11px", lineHeight: "1.4" }}>
            <strong style={{ color: "var(--text-primary)" }}>Scopes requested:</strong>{" "}
            {isSource ? (
              <span>
                <code>drive.readonly</code>, <code>userinfo.email</code>. Permits browsing files to select what is copied.
              </span>
            ) : (
              <span>
                <code>drive.file</code>, <code>userinfo.email</code>. Permits creating new files in your personal account.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
