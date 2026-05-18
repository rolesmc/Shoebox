// src/components/BentoDashboard.jsx
// Top-level Bento composer. Owns all UI state per D-11 (no Zustand).
// DevPanel mounts only when import.meta.env.DEV; Vite tree-shakes the import in prod.

import { useEffect, useState, useMemo } from "react";
import "./Bento.css";

// Sibling components
import AuthCard from "./AuthCard.jsx";
import FileExplorer from "./FileExplorer.jsx";
import StorageGauge from "./StorageGauge.jsx";
import TransferPortal from "./TransferPortal.jsx";
import ResumeBanner from "./ResumeBanner.jsx";
import SmartFilterButtons from "./SmartFilterButtons.jsx";
import PreflightModal from "./PreflightModal.jsx";
import DisclosureModal from "./DisclosureModal.jsx";
import DevPanel from "./DevPanel.jsx";

// Auth and Persistence services
import { GoogleAuth } from "../services/googleAuth.js";
import { TokenStorage } from "../services/storage.js";
import MockLoginModal from "./MockLoginModal.jsx";
import { clearAllData, FileStore } from "../services/db.js";

// Neutral STATE_OPTIONS module
import { STATE_OPTIONS } from "./stateOptions.js";

export default function BentoDashboard() {
  // Retrieve persisted tokens synchronously during instantiation (AUTH-04 zero visual flash)
  const [credentials] = useState(() => TokenStorage.getCredentials());

  // Isolated credential and profile states
  const [sourceToken, setSourceToken] = useState(() => credentials.sourceToken);
  const [sourceEmail, setSourceEmail] = useState(() => credentials.sourceEmail);
  const [destToken, setDestToken] = useState(() => credentials.destToken);
  const [destEmail, setDestEmail] = useState(() => credentials.destEmail);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(
    () => credentials.tokenExpiresAt,
  );
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  // Mock consent selector popup controls
  const [mockModalOpen, setMockModalOpen] = useState(false);
  const [mockModalType, setMockModalType] = useState("source");

  // Bento state tokens mapping
  const [authState, setAuthState] = useState(() => {
    const creds = TokenStorage.getCredentials();
    if (creds.sourceToken && creds.destToken) return "both";
    if (creds.sourceToken) return "source-only";
    if (creds.destToken) return "dest-only";
    return "disconnected";
  });

  const [scanState, setScanState] = useState("idle");
  const [queueState, setQueueState] = useState("idle");
  const [gaugeState, setGaugeState] = useState("partial");
  const [resumeState, setResumeState] = useState("no-cursor");

  // Files data states
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [skippedSharedDrivesCount, setSkippedSharedDrivesCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [datasetSize, setDatasetSize] = useState(500);

  // Modals state
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  // ----------------------------------------------------
  // OAuth Clients Initialization
  // ----------------------------------------------------
  useEffect(() => {
    GoogleAuth.initClients({
      onSourceSuccess: async ({ token, expiresAt }) => {
        try {
          const email = await GoogleAuth.fetchEmail(token);
          setSourceToken(token);
          setSourceEmail(email);
          setTokenExpiresAt(expiresAt);
          setIsSessionExpired(false);
          TokenStorage.saveSourceCredentials(token, email, expiresAt);
          setMockModalOpen(false);
          console.log(`[GoogleAuth] Connected Source: ${email}`);
        } catch (err) {
          console.error("Source login failed in email identity fetch:", err);
        }
      },
      onDestSuccess: async ({ token }) => {
        try {
          const email = await GoogleAuth.fetchEmail(token);
          setDestToken(token);
          setDestEmail(email);
          setIsSessionExpired(false);
          TokenStorage.saveDestCredentials(token, email);
          setMockModalOpen(false);
          console.log(`[GoogleAuth] Connected Destination: ${email}`);
        } catch (err) {
          console.error(
            "Destination login failed in email identity fetch:",
            err,
          );
        }
      },
      onError: (err) => {
        console.error("Google Identity Services popup error:", err);
      },
      openMockModal: (type) => {
        setMockModalType(type);
        setMockModalOpen(true);
      },
    });
  }, []);

  // ----------------------------------------------------
  // Expiration Check Loop (Checks every 10 seconds - AUTH-05)
  // ----------------------------------------------------
  useEffect(() => {
    const checkExpiration = () => {
      if (tokenExpiresAt) {
        const msRemaining = tokenExpiresAt - Date.now();
        if (msRemaining <= 0) {
          console.log(
            "[BentoDashboard] Access tokens expired! Invalidating session.",
          );
          setIsSessionExpired(true);
          setShowExpiryWarning(false);
          setAuthState("expired");
          // Clear active credentials
          setSourceToken(null);
          setSourceEmail(null);
          setDestToken(null);
          setDestEmail(null);
          setTokenExpiresAt(null);
          TokenStorage.clearAll();
        } else if (msRemaining <= 10 * 60 * 1000) {
          // Trigger banner at the 50-minute mark (<= 10 mins remaining)
          setShowExpiryWarning(true);
          setIsSessionExpired(false);
        } else {
          setShowExpiryWarning(false);
          setIsSessionExpired(false);
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 10000);
    return () => clearInterval(interval);
  }, [tokenExpiresAt]);

  // ----------------------------------------------------
  // Sync state between real credentials and authState
  // ----------------------------------------------------
  useEffect(() => {
    if (isSessionExpired || authState === "expired") {
      setAuthState("expired");
      return;
    }
    if (sourceToken && destToken) {
      setAuthState("both");
    } else if (sourceToken) {
      setAuthState("source-only");
    } else if (destToken) {
      setAuthState("dest-only");
    } else {
      setAuthState("disconnected");
    }
  }, [sourceToken, destToken, isSessionExpired, authState]);

  // ----------------------------------------------------
  // Automatic scan trigger when source token is loaded (SCAN-01)
  // ----------------------------------------------------
  useEffect(() => {
    if (sourceToken && scanState === "idle" && files.length === 0) {
      console.log(
        "[BentoDashboard] Source token connected and no files in cache. Auto-triggering scan...",
      );
      setScanState("scanning");
    }
  }, [sourceToken, scanState, files.length]);

  // ----------------------------------------------------
  // Dynamic AuthCard props generation
  // ----------------------------------------------------
  const cards = useMemo(() => {
    if (authState === "expired" || isSessionExpired) {
      return {
        source: { state: "expired", email: sourceEmail },
        dest: { state: "expired", email: destEmail },
      };
    }
    return {
      source: {
        state: sourceToken ? "connected" : "disconnected",
        email: sourceEmail,
      },
      dest: {
        state: destToken ? "connected" : "disconnected",
        email: destEmail,
      },
    };
  }, [
    authState,
    isSessionExpired,
    sourceToken,
    sourceEmail,
    destToken,
    destEmail,
  ]);

  // ----------------------------------------------------
  // 401 Interception & Exception Handling (AUTH-06)
  // ----------------------------------------------------
  const handleApiError = async (err) => {
    if (err.status === 401 || err.errors?.[0]?.reason === "authError") {
      console.error(
        "[BentoDashboard] Caught 401 Unauthorized API error! Freezing transfer queue & flushes...",
      );

      // Pause active transfers
      setQueueState("paused");

      // Force expired credentials state
      setIsSessionExpired(true);
      setShowExpiryWarning(false);
      setAuthState("expired");

      // Clear persistent and transient keys
      setSourceToken(null);
      setSourceEmail(null);
      setDestToken(null);
      setDestEmail(null);
      setTokenExpiresAt(null);
      TokenStorage.clearAll();

      // Mark resumption as present
      setResumeState("cursor-present");
    } else {
      console.error("[BentoDashboard] API Call Exception:", err);
    }
  };

  // ----------------------------------------------------
  // Streaming File Listing / Scanning Task progress (SCAN-01 to SCAN-04)
  // ----------------------------------------------------
  useEffect(() => {
    if (scanState !== "scanning") return;

    let active = true;
    (async () => {
      try {
        setScannedCount(0);
        setSkippedSharedDrivesCount(0);

        // Dynamically import to ensure clean modular bundling
        const { scanDrive } = await import("../services/scanner.js");

        await scanDrive({
          token: sourceToken,
          onProgress: (scanned, skipped) => {
            if (!active) return;
            setScannedCount(scanned);
            setSkippedSharedDrivesCount(skipped);
          },
          onPage: async () => {
            if (!active) return;

            // Read streamed files incrementally from IndexedDB
            const loadedFiles = await FileStore.getAllFiles();
            if (!active) return;

            const fileList = loadedFiles.filter(
              (f) => f.mimeType !== "application/vnd.google-apps.folder",
            );
            const folderList = loadedFiles.filter(
              (f) => f.mimeType === "application/vnd.google-apps.folder",
            );

            setFiles(fileList);
            setFolders(folderList);
          },
        });

        if (!active) return;
        setScanState("done");
      } catch (err) {
        if (!active) return;
        console.error("[BentoDashboard] Real-time scan failure caught:", err);
        await handleApiError(err);
        setScanState("idle");
      }
    })();

    return () => {
      active = false;
    };
  }, [scanState, sourceToken]);

  // ----------------------------------------------------
  // Simulated Copy Queue Progression & Interruption (Task 4)
  // ----------------------------------------------------
  useEffect(() => {
    if (queueState !== "mirroring" && queueState !== "copying") return;

    let timerId = setTimeout(async () => {
      try {
        if (import.meta.env.DEV) {
          const { throwIfArmed } = await import("../mocks/failureInjection.js");
          throwIfArmed();
        }

        if (queueState === "mirroring") {
          setQueueState("copying");
        } else if (queueState === "copying") {
          setQueueState("done");
        }
      } catch (err) {
        await handleApiError(err);
      }
    }, 2000);

    return () => clearTimeout(timerId);
  }, [queueState]);

  // ----------------------------------------------------
  // Master Sign-Out Handler (AUTH-07)
  // ----------------------------------------------------
  const handleSignOut = async () => {
    console.log(
      "[BentoDashboard] Executing sign out: flushing credentials and storage...",
    );

    // Clear tokens in storage
    TokenStorage.clearAll();

    // Reset IndexedDB tables
    await clearAllData();

    // Reset authentication hooks
    setSourceToken(null);
    setSourceEmail(null);
    setDestToken(null);
    setDestEmail(null);
    setTokenExpiresAt(null);
    setIsSessionExpired(false);
    setShowExpiryWarning(false);
    setAuthState("disconnected");

    // Reset interface variables
    setScanState("idle");
    setQueueState("idle");
    setGaugeState("partial");
    setResumeState("no-cursor");
    setSelectedIds(new Set());
  };

  // ----------------------------------------------------
  // Persistent Storage Initial & Dynamic Hydration (PERS-01)
  // ----------------------------------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loadedFiles = await FileStore.getAllFiles();
        if (!active) return;

        const fileList = loadedFiles.filter(
          (f) => f.mimeType !== "application/vnd.google-apps.folder",
        );
        const folderList = loadedFiles.filter(
          (f) => f.mimeType === "application/vnd.google-apps.folder",
        );

        setFiles(fileList);
        setFolders(folderList);
      } catch (err) {
        console.warn(
          "[BentoDashboard] Error hydating database state on mount:",
          err,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [scanState]);

  const totalSize = useMemo(
    () => files.reduce((s, f) => s + Number(f.size || 0), 0),
    [files],
  );

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStateChange = (slice, value) => {
    ({
      auth: handleAuthChange,
      scan: setScanState,
      queue: setQueueState,
      gauge: setGaugeState,
      resume: setResumeState,
    })[slice]?.(value);
  };

  const handleAuthChange = (value) => {
    setAuthState(value);
    if (value === "both") {
      setSourceToken("mock_source_token_dev");
      setSourceEmail("student@school.edu");
      setDestToken("mock_dest_token_dev");
      setDestEmail("me@gmail.com");
      setIsSessionExpired(false);
      setShowExpiryWarning(false);
      setTokenExpiresAt(Date.now() + 3600 * 1000);
      TokenStorage.saveSourceCredentials(
        "mock_source_token_dev",
        "student@school.edu",
        Date.now() + 3600 * 1000,
      );
      TokenStorage.saveDestCredentials("mock_dest_token_dev", "me@gmail.com");
    } else if (value === "source-only") {
      setSourceToken("mock_source_token_dev");
      setSourceEmail("student@school.edu");
      setDestToken(null);
      setDestEmail(null);
      setIsSessionExpired(false);
      setShowExpiryWarning(false);
      setTokenExpiresAt(Date.now() + 3600 * 1000);
      TokenStorage.saveSourceCredentials(
        "mock_source_token_dev",
        "student@school.edu",
        Date.now() + 3600 * 1000,
      );
      localStorage.removeItem("univault_dest_token");
      localStorage.removeItem("univault_dest_email");
    } else if (value === "dest-only") {
      setSourceToken(null);
      setSourceEmail(null);
      setDestToken("mock_dest_token_dev");
      setDestEmail("me@gmail.com");
      setIsSessionExpired(false);
      setShowExpiryWarning(false);
      setTokenExpiresAt(null);
      localStorage.removeItem("univault_source_token");
      localStorage.removeItem("univault_source_email");
      TokenStorage.saveDestCredentials("mock_dest_token_dev", "me@gmail.com");
    } else if (value === "expired") {
      setSourceToken("mock_source_token_dev");
      setSourceEmail("student@school.edu");
      setDestToken("mock_dest_token_dev");
      setDestEmail("me@gmail.com");
      setIsSessionExpired(true);
      setShowExpiryWarning(false);
      setTokenExpiresAt(Date.now() - 1000);
      TokenStorage.saveSourceCredentials(
        "mock_source_token_dev",
        "student@school.edu",
        Date.now() - 1000,
      );
      TokenStorage.saveDestCredentials("mock_dest_token_dev", "me@gmail.com");
    } else {
      setSourceToken(null);
      setSourceEmail(null);
      setDestToken(null);
      setDestEmail(null);
      setIsSessionExpired(false);
      setShowExpiryWarning(false);
      setTokenExpiresAt(null);
      TokenStorage.clearAll();
    }
  };

  const handleMockSelect = (email, token) => {
    const expiresAt = Date.now() + 3600 * 1000;
    GoogleAuth.registerMockCredentials(token, email);

    if (mockModalType === "source") {
      setSourceToken(token);
      setSourceEmail(email);
      setTokenExpiresAt(expiresAt);
      setIsSessionExpired(false);
      TokenStorage.saveSourceCredentials(token, email, expiresAt);
    } else {
      setDestToken(token);
      setDestEmail(email);
      setIsSessionExpired(false);
      TokenStorage.saveDestCredentials(token, email);
    }
    setMockModalOpen(false);
  };

  void STATE_OPTIONS;

  return (
    <div className="bento-shell">
      <header
        className="bento-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              color: "var(--text-primary)",
            }}
          >
            UniVault
          </h1>
          <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
            Phase 3 Oauth · {files.length.toLocaleString()} files · mock dataset
          </span>
        </div>
        {(sourceToken || destToken) && (
          <button
            onClick={handleSignOut}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--line-border)",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 500,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent-purple)";
              e.currentTarget.style.borderColor = "var(--accent-purple)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--line-border)";
            }}
          >
            Sign out
          </button>
        )}
      </header>

      {/* Pre-emptive Expiration Warning Banner (AUTH-05) */}
      {showExpiryWarning && (
        <div
          className="glass-card"
          style={{
            padding: "14px 20px",
            marginBottom: "16px",
            background: "rgba(139, 92, 246, 0.15)",
            borderColor: "var(--accent-purple)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            boxShadow: "0 0 15px rgba(139, 92, 246, 0.2)",
          }}
        >
          <div style={{ display: "flex", flexDir: "column", gap: "2px" }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              Session Expiration Warning
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Your transfer credentials will expire in less than 10 minutes.
              Reconnect now to ensure continuous background operations.
            </div>
          </div>
          <button
            style={{
              padding: "8px 14px",
              background: "var(--accent-purple)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "12px",
              cursor: "pointer",
            }}
            onClick={() => GoogleAuth.connectSource()}
          >
            Reconnect
          </button>
        </div>
      )}

      {import.meta.env.DEV && (
        <DevPanel
          authState={authState}
          onAuth={(v) => handleStateChange("auth", v)}
          scanState={scanState}
          onScan={(v) => handleStateChange("scan", v)}
          queueState={queueState}
          onQueue={(v) => handleStateChange("queue", v)}
          gaugeState={gaugeState}
          onGauge={(v) => handleStateChange("gauge", v)}
          resumeState={resumeState}
          onResume={(v) => handleStateChange("resume", v)}
          datasetSize={datasetSize}
          onDatasetSize={setDatasetSize}
          onOpenPreflight={() => setPreflightOpen(true)}
          onOpenDisclosure={() => setDisclosureOpen(true)}
        />
      )}

      <ResumeBanner
        cursorPresent={resumeState === "cursor-present"}
        remainingCount={42}
      />

      {/* Streaming Scan Progress Indicator (SCAN-01) */}
      {scanState === "scanning" && (
        <div
          className="glass-card"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "16px",
            marginBottom: "16px",
            borderLeft: "4px solid var(--accent-purple)",
            background: "rgba(139, 92, 246, 0.1)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Scanning Google Drive (My Drive)...
            </span>
            <span
              style={{
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
              }}
            >
              {scannedCount.toLocaleString()} items discovered
            </span>
          </div>
          <div
            style={{
              height: "4px",
              width: "100%",
              background: "rgba(255,255,255,0.08)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "40%",
                background:
                  "linear-gradient(90deg, var(--accent-purple), var(--accent-neon))",
                borderRadius: "2px",
                animation: "shimmer 1.5s infinite linear",
              }}
            />
          </div>
        </div>
      )}

      {/* Shared Drive Skipped Banner (SCAN-04) */}
      {skippedSharedDrivesCount > 0 && (
        <div
          className="glass-card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            borderLeft: "4px solid var(--accent-purple)",
            background: "rgba(139, 92, 246, 0.08)",
          }}
        >
          <span style={{ fontSize: "16px" }}>ℹ️</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Shared Drive Items Skipped
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {skippedSharedDrivesCount} Shared Drive files were skipped because
              UniVault only supports migrating "My Drive" assets.
            </div>
          </div>
        </div>
      )}

      <div className="bento-grid">
        <div className="span-6">
          <AuthCard
            account="source"
            {...cards.source}
            onConnect={() => GoogleAuth.connectSource()}
          />
        </div>
        <div className="span-6">
          <AuthCard
            account="dest"
            {...cards.dest}
            onConnect={() => GoogleAuth.connectDest()}
          />
        </div>

        <div className="span-12">
          <SmartFilterButtons
            files={files}
            folders={folders}
            onApply={(name) => console.log("apply filter", name)}
          />
        </div>

        <div className="span-8">
          <FileExplorer
            files={files}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            scanState={scanState}
            onScan={setScanState}
            hasSourceToken={Boolean(sourceToken)}
          />
        </div>

        <div
          className="span-4"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <StorageGauge state={gaugeState} />
          <TransferPortal state={queueState} />
        </div>
      </div>

      <PreflightModal
        isOpen={preflightOpen}
        onClose={() => setPreflightOpen(false)}
        onConfirm={() => {
          setPreflightOpen(false);
          setDisclosureOpen(true);
        }}
        fileCount={selectedIds.size}
        totalSize={totalSize}
        destAvailable={58 * 1024 ** 3}
      />

      <DisclosureModal
        isOpen={disclosureOpen}
        onClose={() => setDisclosureOpen(false)}
        onAcknowledge={() => {
          setDisclosureOpen(false);
          setQueueState("mirroring");
        }}
      />

      {/* Mock Consent Picker Overlay dialog */}
      <MockLoginModal
        isOpen={mockModalOpen}
        accountType={mockModalType}
        onSelect={handleMockSelect}
        onClose={() => setMockModalOpen(false)}
      />
    </div>
  );
}
