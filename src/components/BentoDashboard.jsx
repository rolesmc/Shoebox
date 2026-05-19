// src/components/BentoDashboard.jsx
// Top-level Bento composer. Owns all UI state per D-11 (no Zustand).
// DevPanel mounts only when import.meta.env.DEV; Vite tree-shakes the import in prod.

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "./Bento.css";

// Sibling components
import AuthCard from "./AuthCard.jsx";
import FileExplorer from "./FileExplorer.jsx";
import StorageGauge from "./StorageGauge.jsx";
import TransferPortal from "./TransferPortal.jsx";
import CompletionSummary from "./CompletionSummary.jsx";
import ResumeBanner from "./ResumeBanner.jsx";
import SmartFilterButtons from "./SmartFilterButtons.jsx";
import PreflightModal from "./PreflightModal.jsx";
import DisclosureModal from "./DisclosureModal.jsx";
import DevPanel from "./DevPanel.jsx";

// Phase 8: Resume + Wake Lock
import { useWakeLock } from "../hooks/useWakeLock.js";
import { rehydrateQueueFromCursor } from "../services/queueRehydration.js";

// Phase 9: Polish
import { useConfetti } from "../hooks/useConfetti.js";

// Auth and Persistence services
import { GoogleAuth } from "../services/googleAuth.js";
import { TokenStorage } from "../services/storage.js";
import MockLoginModal from "./MockLoginModal.jsx";
import { clearAllData, FileStore, SelectionStore, QueueStore, FolderMapStore } from "../services/db.js";
import { applyFilters } from "../services/filters.js";
import { ROOT_SENTINEL } from "../utils/folderMirror.js";

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
  // Phase 6 mirror state (MIRROR-01..04)
  const [mirrorProgress, setMirrorProgress] = useState({ created: 0, total: 0, name: "" });
  // WR-03: rootDestId removed from component state. Phase 7's copy queue should
  // read the destination root from IndexedDB via
  // FolderMapStore.getFolderMapping(ROOT_SENTINEL).destFolderId — it survives
  // reloads/resume and is the authoritative source of truth.
  const [mirrorError, setMirrorError] = useState(null);
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

  // Phase 7: copy-queue controller lives in a ref so re-renders don't recreate workers
  // (07-RESEARCH.md Pitfall 1: useState would spawn a new pool every render).
  const controllerRef = useRef(null);

  // Phase 9 POLISH-02: single-fire confetti on queueState transition to "done".
  // Uses useRef(false) (NOT useState) so flipping the gate does not trigger a
  // re-render and is Strict-Mode safe (Pitfall 2). Re-armed below when a new
  // run starts so the second migration also celebrates.
  const fireConfetti = useConfetti();
  const confettiFiredRef = useRef(false);

  // Phase 7 D-16: aggregate counter derived from QueueStore.subscribe.
  // Denominator excludes 'skipped' rows (D-05 folders + D-06 MIMEs); native files
  // contribute 0 bytes (D-17). This replaces the existing per-component derivation.
  const [copyAggregate, setCopyAggregate] = useState({
    completedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    unknownCount: 0,
    inFlightCount: 0,
    bytesDone: 0,
    bytesTotal: 0,
    totalEligible: 0,
  });

  // Phase 8 RESUME-01: reactive remaining count from QueueStore.subscribe. Single
  // source of truth per D-01 (count is computed from IDB, never stored in localStorage).
  const [remainingCount, setRemainingCount] = useState(0);

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
          // WR-04: gate email logs behind DEV. Production console output is
          // hooverable by any browser extension; the email is OAuth identity PII.
          if (import.meta.env.DEV) {
            console.log(`[GoogleAuth] Connected Source: ${email}`);
          }
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
          // WR-04: gate email logs behind DEV — same rationale as Source above.
          if (import.meta.env.DEV) {
            console.log(`[GoogleAuth] Connected Destination: ${email}`);
          }
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
  // WR-02: wrapped in useCallback so the closure identity is stable across
  // renders. This lets effects safely include handleApiError in their dep
  // arrays without spuriously re-firing. All setters captured here are
  // useState setters (stable identities), so deps stay empty.
  const handleApiError = useCallback(async (err) => {
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
      // resumeState is now set by the mount rehydration effect (Phase 8 D-02).
      // Redundant setResumeState("cursor-present") removed — single source of truth.
    } else {
      // WR-04: scrub the raw err object. Drive responses can carry file metadata,
      // internal IDs, and path fragments that leak through extension-readable
      // console output. Log only the shape we control.
      console.error(
        "[BentoDashboard] API Call Exception:",
        err?.status ?? "no-status",
        err?.reason ?? err?.message ?? "no-detail",
      );
    }
  }, []);

  // Phase 7 D-13: Retry-Failed-Only — token freshness check, reset failed→pending, flip state.
  const handleRetryFailed = useCallback(async () => {
    // WR-06: refuse to reset rows while a copy run is in progress. Today the
    // Retry button only renders in terminal states (done / failed-with-retries),
    // but that policy is enforced two layers up in TransferPortal — guard here
    // too so a future state addition can't accidentally let retry race a worker
    // mid-failed-write, leaving a row stuck in 'failed' forever.
    if (controllerRef.current) {
      console.warn("[BentoDashboard] retry-failed called while a run is active; ignoring.");
      return;
    }

    // Step 1: check destToken freshness before resetting anything. If missing/expired, prompt
    // reconnect via the existing Phase 3 surface — D-14 reuses the AuthCard "Session expired" banner.
    const creds = TokenStorage.getCredentials();
    const tokenFresh =
      creds.destToken &&
      (!creds.tokenExpiresAt || creds.tokenExpiresAt > Date.now());
    if (!tokenFresh) {
      setIsSessionExpired(true);
      setAuthState("expired");
      return;
    }

    // Step 2: reset all 'failed' rows back to 'pending'. NEVER reset 'unknown' or 'skipped' (D-13).
    const tasks = await QueueStore.getTasks();
    for (const t of tasks) {
      if (t.status === "failed") {
        await QueueStore.updateTask(t.id, {
          status: "pending",
          errorMsg: null,
          reason: null,
        });
      }
    }

    // Step 3: re-fire the copy effect by transitioning queueState.
    setQueueState("copying");
  }, []);

  // ----------------------------------------------------
  // Phase 8 RESUME-02: handleResume — re-promote orphans (idempotent) then flip queueState.
  // ----------------------------------------------------
  // Researcher Open Question #3: token freshness check mirrors handleRetryFailed
  // (line 304-314) — belt-and-suspenders against a brief 'copying' flash that
  // would immediately become 'paused' on first 401.
  const handleResume = useCallback(async () => {
    // Re-run rehydration. First call (mount) already promoted; second call is
    // a no-op per RESEARCH.md "Strict-Mode safety" — zero 'copying' rows now.
    await rehydrateQueueFromCursor();

    const creds = TokenStorage.getCredentials();
    const tokenFresh =
      creds.destToken &&
      (!creds.tokenExpiresAt || creds.tokenExpiresAt > Date.now());
    if (!tokenFresh) {
      setIsSessionExpired(true);
      setAuthState("expired");
      return;
    }

    // Existing copy effect fires on the queueState transition and picks up
    // 'pending' rows. The cursor effect below will refresh the cursor timestamp
    // from this transition. All idempotent.
    setQueueState("copying");
  }, []);

  // ----------------------------------------------------
  // Phase 8 D-11: handleDiscard — clear queue + cursor; PRESERVE FileStore /
  // SelectionStore / FolderMapStore (the user keeps their scan + selection +
  // folder map; CONTEXT.md D-11).
  // ----------------------------------------------------
  const handleDiscard = useCallback(async () => {
    // Researcher Open Question #2: include window.confirm. Discard is
    // destructive and the banner button is small; cost = one line; benefit =
    // prevents accidental data loss in a long-running multi-day workflow.
    if (
      !window.confirm(
        "Discard interrupted transfer? Your selection is preserved.",
      )
    ) {
      return;
    }

    await QueueStore.clear(); // fires notifyQueueChange([]) → subscriber sets remainingCount to 0
    TokenStorage.saveResumeCursor(null);
    setResumeState("no-cursor");
    setQueueState("idle");
    // FileStore, SelectionStore, FolderMapStore deliberately preserved (D-11).
  }, []);

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
  }, [scanState, sourceToken, handleApiError]);

  // ----------------------------------------------------
  // Phase 6: Folder Mirror Orchestration (MIRROR-01..04)
  // ----------------------------------------------------
  // CR-02: depend ONLY on queueState. selectedIds + destToken are snapshotted at
  // start so a mid-mirror checkbox toggle cannot cancel-and-restart the IIFE,
  // which previously raced two create-streams and could double-create folders.
  useEffect(() => {
    if (queueState !== "mirroring") return;

    let active = true;
    // Snapshot inputs at mirror start — subsequent toggles MUST NOT affect this run.
    const snapshotSelectedIds = new Set(selectedIds);
    const snapshotDestToken = destToken;
    (async () => {
      try {
        setMirrorError(null);
        setMirrorProgress({ created: 0, total: 0, name: "" });

        const allFiles = await FileStore.getAllFiles();
        if (!active) return;
        const filesById = new Map(allFiles.map((f) => [f.id, f]));

        const { mirrorFolders } = await import("../utils/folderMirror.js");

        const result = await mirrorFolders({
          selectedIds: snapshotSelectedIds,
          filesById,
          destToken: snapshotDestToken,
          onProgress: ({ created, total, name }) => {
            if (!active) return;
            setMirrorProgress({ created, total, name });
          },
          onAuthError: handleApiError,
        });

        if (!active) return;
        // WR-03: result.rootDestId is now read from FolderMapStore by Phase 7.
        // We deliberately do NOT mirror it into component state — IDB is the
        // source of truth and survives reload.
        void result;
        setQueueState("copying");
      } catch (err) {
        if (!active) return;
        console.error("[BentoDashboard] Mirror failure caught:", err);
        if (err?.status === 401 || err?.errors?.[0]?.reason === "authError") {
          await handleApiError(err);
          // handleApiError already transitions queueState — do not overwrite
        } else {
          setMirrorError(err?.message || String(err));
          setQueueState("mirror-failed");
        }
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueState, handleApiError]); // CR-02: selectedIds + destToken intentionally excluded — snapshotted above

  // ----------------------------------------------------
  // Phase 7: Copy Queue Orchestration (COPY-01..07)
  // ----------------------------------------------------
  // CR-02 pattern (matches mirror effect): depend ONLY on queueState. selectedIds,
  // destToken, files snapshotted at effect-fire so mid-run toggles cannot cancel-
  // restart the pool. Controller held in useRef per Pitfall 1.
  useEffect(() => {
    if (queueState !== "copying") return;

    let active = true;
    const snapshotSelectedIds = new Set(selectedIds);
    const snapshotDestToken = destToken;
    const snapshotFiles = files;

    (async () => {
      try {
        if (snapshotSelectedIds.size === 0) {
          setQueueState("done");
          return;
        }

        // WR-03: rootDestId comes from IDB (FolderMapStore), survives reload.
        const rootMapping = await FolderMapStore.getFolderMapping(ROOT_SENTINEL);
        if (!active) return;
        if (!rootMapping) {
          console.error("[BentoDashboard] No root mapping — folder mirror not complete");
          setQueueState("mirror-failed");
          setMirrorError("Folder mirror state missing. Re-run Mirror first.");
          return;
        }

        const { runCopyQueue } = await import("../services/copyQueue.js");
        if (!active) return;

        const controller = runCopyQueue({
          selectedIds: snapshotSelectedIds,
          files: snapshotFiles,
          destToken: snapshotDestToken,
          rootDestId: rootMapping.destFolderId,
          onAuthError: handleApiError,
        });
        controllerRef.current = controller;

        await controller.done;
        if (!active) return;

        // Terminal state: read fresh task snapshot to choose 'stopped-quota' vs 'done' vs 'failed-with-retries'.
        const finalTasks = await QueueStore.getTasks();
        const hadStop = finalTasks.some((t) => {
          const r = t.reason;
          return r === "dailyLimitExceeded" || r === "quotaExceeded" || r === "storageQuotaExceeded"
            || r === "domainPolicy" || r === "activeItemCreationLimitExceeded"
            || r === "numChildrenInNonRootLimitExceeded" || r === "stop";
        });
        // WR-06: clear the controller ref BEFORE flipping to a terminal state
        // so handleRetryFailed (which the user may click immediately on the
        // next render) sees a clean slate. The effect-cleanup also clears it,
        // but that runs only on the next queueState transition — too late for
        // a click that lands in the same React tick as the terminal transition.
        controllerRef.current = null;
        if (hadStop) {
          setQueueState("stopped-quota");
        } else if (finalTasks.some((t) => t.status === "failed")) {
          setQueueState("failed-with-retries");
        } else {
          setQueueState("done");
        }
      } catch (err) {
        if (!active) return;
        console.error("[BentoDashboard] Copy queue failure caught:", err);
        if (err?.status === 401 || err?.errors?.[0]?.reason === "authError") {
          await handleApiError(err);
        } else {
          setQueueState("failed-with-retries");
        }
      }
    })();

    return () => {
      active = false;
      // D-04 / D-12: stop() sets a flag; workers drain in-flight POSTs, NEVER abort.
      controllerRef.current?.stop?.();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueState, handleApiError]); // CR-02: selectedIds + destToken + files intentionally excluded — snapshotted above

  // ----------------------------------------------------
  // Phase 8: Resume cursor write/clear (D-02)
  // ----------------------------------------------------
  // CR-02: depends ONLY on queueState. Writes on entering 'copying' or 'paused';
  // clears on entering 'done'. Per Pitfall P8-1, 'idle' / 'mirroring' /
  // 'stopped-quota' / 'failed-with-retries' / 'mirror-failed' are deliberate
  // no-ops — those states preserve the daily-quota / authError resume path
  // (CONTEXT.md D-02 + "Specifics" lines 122-123).
  useEffect(() => {
    if (queueState === "copying" || queueState === "paused") {
      TokenStorage.saveResumeCursor(
        JSON.stringify({ state: queueState, savedAt: Date.now() }),
      );
    } else if (queueState === "done") {
      TokenStorage.saveResumeCursor(null);
    }
    // idle / mirroring / stopped-quota / failed-with-retries / mirror-failed: no-op (D-02)
  }, [queueState]);

  // ----------------------------------------------------
  // Phase 8: beforeunload guard (D-10, RESUME-05)
  // ----------------------------------------------------
  // CR-02: queueState only. Listener defined inside effect (Pitfall BU-2 +
  // BU-4) so the cleanup closure captures the exact reference it registered.
  // Modern semantics require BOTH preventDefault() and returnValue = ''
  // (Chrome quirk + legacy compat — RESEARCH.md lines 257-264). Custom
  // strings are universally ignored by 2026 browsers; do NOT set one.
  useEffect(() => {
    if (queueState !== "copying" && queueState !== "mirroring") return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [queueState]);

  // ----------------------------------------------------
  // Phase 8: Wake lock — held while transfer is active (D-07, D-08, RESUME-04)
  // ----------------------------------------------------
  // The hook handles visibilitychange re-acquire and best-effort try/catch
  // (D-09 — failures silently swallowed; iOS Safari has no navigator.wakeLock
  // and the hook short-circuits via optional chaining).
  useWakeLock(queueState === "copying" || queueState === "mirroring");

  // ----------------------------------------------------
  // Phase 8: Mount-time queue rehydration (D-06, RESUME-02, RESUME-03)
  // ----------------------------------------------------
  // Runs ONCE on mount. Promotes orphaned 'copying' rows to 'unknown' (D-04)
  // and sets resumeState based on whether anything is resumable.
  // Idempotent under Strict-Mode double-invoke — see RESEARCH.md lines 456-462.
  // Empty-deps array is intentional (mount-only); the `cancelled` flag covers
  // the async race per Pitfall P8-5.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await rehydrateQueueFromCursor();
      if (cancelled) return;
      setResumeState(result.cursor ? "cursor-present" : "no-cursor");
      if (result.promotedCount > 0) {
        console.log(
          `[BentoDashboard] Phase 8 rehydration promoted ${result.promotedCount} orphaned 'copying' row(s) to 'unknown'.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only; intentional

  // ----------------------------------------------------
  // Phase 8: Reactive remainingCount via QueueStore.subscribe (RESUME-01)
  // ----------------------------------------------------
  // Mount-only. Replaces the line-986 `selectedIds.size - completedCount`
  // heuristic which goes stale on Discard (Pitfall P8-2).
  useEffect(() => {
    const unsub = QueueStore.subscribe((tasks) => {
      setRemainingCount(
        tasks.filter(
          (t) => t.status === "pending" || t.status === "copying",
        ).length,
      );
    });
    // Initial fill — subscribe fires on subsequent changes only; pull current state once.
    (async () => {
      const tasks = await QueueStore.getTasks();
      setRemainingCount(
        tasks.filter(
          (t) => t.status === "pending" || t.status === "copying",
        ).length,
      );
    })();
    return unsub;
  }, []);

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
    setActiveFilters({
      academic: false,
      allStar: false,
      cleanSlate: false,
    });
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
          "[BentoDashboard] Error hydrating database state on mount:",
          err,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [scanState]);

  // Subscribe to SelectionStore active selections to sync IndexedDB selections reactively
  useEffect(() => {
    const unsubscribe = SelectionStore.subscribe((selectionSet) => {
      setSelectedIds(selectionSet);
    });
    return unsubscribe;
  }, []);

  // Subscribe to QueueStore tasks to populate live transfer statuses.
  // WR-03: now carries bytesTotal in addition to bytesCopied so the aggregate
  // counter below can derive synchronously from this single subscription instead
  // of opening a second subscriber that races selectedIds dependency changes.
  const [transferStatuses, setTransferStatuses] = useState({});
  useEffect(() => {
    const unsubscribe = QueueStore.subscribe((tasks) => {
      const statusMap = {};
      tasks.forEach((t) => {
        statusMap[t.id] = {
          status: t.status,
          bytesCopied: t.bytesCopied,
          bytesTotal: t.bytesTotal,
          errorMsg: t.errorMsg,
          reason: t.reason,           // POLISH-03: surface reason for CompletionSummary failure tag
        };
      });
      setTransferStatuses(statusMap);
    });
    return unsubscribe;
  }, []);

  // Phase 7 D-16 + D-17: derive aggregate counter synchronously from
  // transferStatuses + selectedIds via useMemo. WR-03: previously this used
  // a second QueueStore.subscribe whose callback closed over an alias of
  // selectedIds, leaving a one-frame race where a status update fired between
  // toggle and effect-rerun would compute against stale selection. Deriving
  // here lets React handle ordering; the aliased `selectedSet` confusion is
  // also gone.
  useEffect(() => {
    const relevant = Object.entries(transferStatuses)
      .filter(([id]) => selectedIds.has(id))
      .map(([, v]) => v);

    const completedCount = relevant.filter((t) => t.status === "completed").length;
    const failedCount = relevant.filter((t) => t.status === "failed").length;
    const skippedCount = relevant.filter((t) => t.status === "skipped").length;
    const unknownCount = relevant.filter((t) => t.status === "unknown").length;
    const inFlightCount = relevant.filter((t) => t.status === "copying").length;

    // D-05: skipped rows excluded from denominator.
    const eligible = relevant.filter((t) => t.status !== "skipped");
    const totalEligible = eligible.length;

    // D-17: bytesTotal/bytesCopied already 0 for native files (set in copyQueue.js init phase).
    const bytesDone = eligible
      .filter((t) => t.status === "completed")
      .reduce((s, t) => s + (Number(t.bytesCopied) || 0), 0);
    const bytesTotal = eligible.reduce((s, t) => s + (Number(t.bytesTotal) || 0), 0);

    setCopyAggregate({
      completedCount,
      failedCount,
      skippedCount,
      unknownCount,
      inFlightCount,
      bytesDone,
      bytesTotal,
      totalEligible,
    });
  }, [transferStatuses, selectedIds]);

  // Phase 9 POLISH-02: edge-triggered confetti.
  // CR-02 invariant (Phase 8): dependency array is [queueState, fireConfetti] only.
  // fireConfetti is useCallback-memoized inside useConfetti, so it is stable.
  // Fires on the queueState === "done" edge (Pitfall 7: aggregate counts can
  // flip a tick before queueState). Does NOT fire on failed-with-retries or
  // stopped-quota (Pitfall 9).
  useEffect(() => {
    if (queueState === "idle" || queueState === "copying" || queueState === "mirroring") {
      // Re-arm for the next migration.
      confettiFiredRef.current = false;
      return;
    }
    if (queueState === "done" && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      fireConfetti();
    }
  }, [queueState, fireConfetti]);

  // Phase 9 POLISH-03: failure rows for CompletionSummary.
  // Built from transferStatuses (which now carries `reason` per the
  // statusMap extension above) so we do NOT open a second QueueStore
  // subscription — keeps the data path single-sourced.
  const failureTasks = useMemo(() => {
    return Object.entries(transferStatuses)
      .filter(([id, t]) => selectedIds.has(id) && t.status === "failed")
      .map(([id, t]) => ({ id, errorMsg: t.errorMsg, reason: t.reason }));
  }, [transferStatuses, selectedIds]);

  // Map file.id -> file for resolving display names in the failure list.
  // `files` is the existing selected-file array already in scope.
  const filesById = useMemo(() => {
    const m = new Map();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);

  // Active filter state variables
  const [activeFilters, setActiveFilters] = useState({
    academic: false,
    allStar: false,
    cleanSlate: false,
  });

  const toggleFilter = (filterKey) => {
    setActiveFilters((prev) => ({
      ...prev,
      [filterKey]: !prev[filterKey],
    }));
  };

  // Compute live filtered explorer assets
  const visibleFiles = useMemo(() => {
    return applyFilters(files, activeFilters, folders);
  }, [files, activeFilters, folders]);

  // Compute total selected payload bytes. Google-native folders/files count as 0.
  const projectedBytes = useMemo(() => {
    let sum = 0;
    for (const f of files) {
      if (selectedIds.has(f.id)) {
        const isNative = f.mimeType?.startsWith("application/vnd.google-apps.");
        if (!isNative) {
          sum += Number(f.size || 0);
        }
      }
    }
    return sum;
  }, [files, selectedIds]);

  const [destUsedBytes, setDestUsedBytes] = useState(5.2 * 1024 ** 3);
  const [destLimitBytes, setDestLimitBytes] = useState(15 * 1024 ** 3);

  // Synchronize dynamic quota limit presets with gaugeState toggles
  useEffect(() => {
    if (gaugeState === "empty") {
      setDestUsedBytes(0);
      setDestLimitBytes(15 * 1024 ** 3);
    } else if (gaugeState === "partial") {
      setDestUsedBytes(5.2 * 1024 ** 3);
      setDestLimitBytes(15 * 1024 ** 3);
    } else if (gaugeState === "projected") {
      setDestUsedBytes(5.2 * 1024 ** 3);
      setDestLimitBytes(15 * 1024 ** 3);
    } else if (gaugeState === "over-quota") {
      setDestUsedBytes(14.5 * 1024 ** 3);
      setDestLimitBytes(15 * 1024 ** 3);
    }
  }, [gaugeState]);

  // Phase 7: replaces the pre-Phase-7 transferStatuses-based derivations.
  // Counters now flow from copyAggregate, which is populated by the QueueStore.subscribe
  // effect above. Same shape — just sourced from the single subscriber.
  const completedCount = copyAggregate.completedCount;
  const failedCount = copyAggregate.failedCount;
  const copiedSize = copyAggregate.bytesDone;

  const toggleSelected = async (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      await SelectionStore.removeSelection(id);
    } else {
      next.add(id);
      await SelectionStore.addSelection(id);
    }
  };

  const toggleBulkSelect = async (idsArray, select) => {
    const next = new Set(selectedIds);
    if (select) {
      idsArray.forEach((id) => next.add(id));
    } else {
      idsArray.forEach((id) => next.delete(id));
    }
    await SelectionStore.setSelection(next);
  };

  const handleReset = async () => {
    // WR-05: deliberately clears ONLY the per-file queue. FolderMapStore is
    // intentionally preserved so a subsequent mirror reuses the existing
    // timestamped root + folder mappings (resume semantic, RESEARCH §Pitfall 4).
    // A user who wants a fully fresh migration (new root folder) must sign out;
    // clearAllData() in handleSignOut wipes the folderMap. The button is labeled
    // "Clear queue" (not "Reset") in TransferPortal to disambiguate.
    setQueueState("idle");
    await QueueStore.clear();
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
            Phase 5 Core Migration Worker · {files.length.toLocaleString()} files
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
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
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
          onRunMirror={() => setQueueState("mirroring")}
          onRunCopyQueue={() => window.open('/copy-queue-test.html', '_blank', 'noopener,noreferrer')}
        />
      )}

      <ResumeBanner
        cursorPresent={resumeState === "cursor-present"}
        remainingCount={remainingCount}
        onResume={handleResume}
        onDiscard={handleDiscard}
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

      {/* Phase 6: Mirror Progress Indicator (MIRROR-01..04) */}
      {queueState === "mirroring" && mirrorProgress.total > 0 && (
        <div
          className="glass-card"
          style={{ padding: "10px 14px", marginTop: "8px", marginBottom: "16px", fontSize: "13px", color: "var(--text-secondary)" }}
          role="status"
          aria-live="polite"
        >
          Mirroring folder {mirrorProgress.created} of {mirrorProgress.total}
          {mirrorProgress.name ? `: ${mirrorProgress.name}` : ""}
        </div>
      )}

      {/* Phase 6: Mirror Failure UX (with Retry) */}
      {queueState === "mirror-failed" && (
        <div
          className="glass-card"
          style={{
            padding: "10px 14px",
            marginTop: "8px",
            marginBottom: "16px",
            fontSize: "13px",
            color: "#f87171",
            borderColor: "rgba(248, 113, 113, 0.35)",
          }}
          role="alert"
        >
          <div style={{ marginBottom: "6px" }}>
            Folder mirror failed: {mirrorError || "unknown error"}
          </div>
          <button
            type="button"
            onClick={() => {
              setMirrorError(null);
              setQueueState("mirroring");
            }}
            style={{
              background: "rgba(139, 92, 246, 0.18)",
              border: "1px solid rgba(139, 92, 246, 0.45)",
              color: "var(--accent-purple)",
              padding: "4px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Retry mirror
          </button>
        </div>
      )}

      {/* Phase 7: stopped-quota banner (daily Drive copy quota reached — D-04 stop class) */}
      {queueState === "stopped-quota" && (
        <div
          className="glass-card"
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            borderLeft: "4px solid var(--accent-purple)",
            background: "rgba(139, 92, 246, 0.08)",
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            Daily copy quota reached
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Google's Drive copy limit (≈750 GB/day) has been hit. Resume tomorrow — your queue is saved and {Math.max(0, copyAggregate.totalEligible - copyAggregate.completedCount - copyAggregate.skippedCount)} file{(Math.max(0, copyAggregate.totalEligible - copyAggregate.completedCount - copyAggregate.skippedCount)) === 1 ? "" : "s"} will pick up automatically.
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
            activeFilters={activeFilters}
            onToggleFilter={toggleFilter}
          />
        </div>

        <div className="span-8">
          <FileExplorer
            files={visibleFiles}
            selectedIds={selectedIds}
            onToggle={toggleSelected}
            onToggleBulk={toggleBulkSelect}
            scanState={scanState}
            onScan={setScanState}
            hasSourceToken={Boolean(sourceToken)}
            transferStatuses={transferStatuses}
          />
        </div>

        <div
          className="span-4"
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <StorageGauge
            usedBytes={destUsedBytes}
            limitBytes={destLimitBytes}
            projectedBytes={projectedBytes}
          />
          <TransferPortal
            state={queueState}
            hasBothTokens={Boolean(sourceToken && destToken)}
            selectedCount={selectedIds.size}
            completedCount={completedCount}
            failedCount={failedCount}
            skippedCount={copyAggregate.skippedCount}
            unknownCount={copyAggregate.unknownCount}
            inFlightCount={copyAggregate.inFlightCount}
            copiedSize={copiedSize}
            totalSize={copyAggregate.bytesTotal}
            onStart={() => setPreflightOpen(true)}
            onPause={() => {
              controllerRef.current?.pause?.();
              setQueueState("paused");
            }}
            onResume={() => {
              controllerRef.current?.resume?.();
              setQueueState("copying");
            }}
            onReset={handleReset}
            onRetryFailed={handleRetryFailed}
            onCancelMirror={() => {
              // WR-05: transitioning queueState away from "mirroring" fires the
              // mirror useEffect cleanup (sets active = false). In-flight folder
              // create requests still complete; no new ones are issued.
              setQueueState("idle");
            }}
          />
          <CompletionSummary
            visible={
              queueState === "done" ||
              queueState === "failed-with-retries" ||
              queueState === "stopped-quota"
            }
            completedCount={copyAggregate.completedCount}
            skippedCount={copyAggregate.skippedCount}
            failedCount={copyAggregate.failedCount}
            unknownCount={copyAggregate.unknownCount}
            failures={failureTasks}
            filesById={filesById}
          />
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
        totalSize={projectedBytes}
        destAvailable={Math.max(0, destLimitBytes - destUsedBytes)}
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
