// univault/src/services/copyQueue.js
// Copy-queue orchestrator — composes PromisePool + fetchWithBackoff + classifyDriveError
// with copyFile + QueueStore + FolderMapStore. Returns a {pause, resume, stop, done}
// controller. D-02: mirrors folderMirror.js functional-orchestrator pattern.
//
// Drain-don't-abort policy (D-04, D-12): pause()/stop() act between tasks; in-flight
// copyFile POSTs always complete to avoid orphan-duplicate creation (Drive does not
// document an idempotency token for files.copy — 07-RESEARCH.md Assumption A6).

import { copyFile as realCopyFile } from "./googleApi.js";
import { QueueStore, FolderMapStore } from "./db.js";
import { PromisePool } from "../utils/promisePool.js";
import { fetchWithBackoff } from "../utils/fetchWithBackoff.js";
import { classifyDriveError } from "../utils/classifyDriveError.js";
import { ROOT_SENTINEL } from "../utils/folderMirror.js";

// ---------------------------------------------------------------------------
// Constants (exported so Plan 04 tests can assert on them)
// ---------------------------------------------------------------------------

export const CONCURRENCY = 3;

// D-06: unsupported-MIME skip list — Forms, Sites, Jamboard, shortcuts, Fusiontables.
// drive-sdk MIMEs are matched by prefix below (third-party SDK file pattern).
export const UNSUPPORTED_MIMES = new Set([
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.jam",
  "application/vnd.google-apps.shortcut",
  "application/vnd.google-apps.fusiontable",
]);

export const DRIVE_SDK_PREFIX = "application/vnd.google-apps.drive-sdk";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const GAPP_PREFIX = "application/vnd.google-apps.";

function isUnsupportedMime(mimeType) {
  if (!mimeType) return false;
  if (UNSUPPORTED_MIMES.has(mimeType)) return true;
  if (mimeType.startsWith(DRIVE_SDK_PREFIX)) return true;
  return false;
}

function isFolder(mimeType) {
  return mimeType === FOLDER_MIME;
}

// D-17: Google-native files (size === 0 AND mime starts with application/vnd.google-apps.)
// count as 0 bytes. Non-native uses file.size verbatim.
// WR-07: coerce defensively. Drive API documents `size` as a string for files
// with content and omits it otherwise; a malformed payload (or test fixture)
// could supply "not-a-number", which would propagate as NaN through the
// aggregate sums and surface as "NaN B" in TransferPortal.
function bytesForFile(file) {
  if (!file?.mimeType) {
    const n = Number(file?.size);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (file.mimeType.startsWith(GAPP_PREFIX) && (!file.size || Number(file.size) === 0)) {
    return 0;
  }
  const n = Number(file.size);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Entry point: runCopyQueue
// ---------------------------------------------------------------------------

/**
 * runCopyQueue({ selectedIds, files, destToken, rootDestId, onAuthError, ...injectableDeps })
 *
 * Functional orchestrator. Mirrors mirrorFolders() from folderMirror.js:184-196 (D-02).
 * Every side-effecting dep is injectable so Plan 04's test runner can isolate behavior
 * without a real IDB, Drive API, or timer.
 *
 * Returns a { pause, resume, stop, done } controller.
 *   pause()  — blocks pool workers between tasks (drain-don't-abort, D-04)
 *   resume() — unblocks paused workers
 *   stop()   — sets stopFlag; workers exit cleanly between tasks; no abort (T-07-13 drain-don't-abort)
 *   done     — Promise that resolves after all submitted tasks have terminated + pool.drain()
 */
export function runCopyQueue({
  selectedIds,            // Iterable<string> (Set or array)
  files,                  // Array<File> — needs id, name, mimeType, size, parents, modifiedTime, starred
  destToken,
  rootDestId,             // resolved by caller via FolderMapStore.getFolderMapping(ROOT_SENTINEL)
  onAuthError,            // (err) => Promise<void>; called ONCE at orchestrator boundary (WR-01)
  copyFile = realCopyFile,              // injectable for tests
  queueStore = QueueStore,              // injectable
  folderMapStore = FolderMapStore,      // injectable
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  pool = new PromisePool(CONCURRENCY),
  enableFailureInjection = import.meta.env.DEV, // gated DEV-only by default; tests pass false
} = {}) {
  if (!files) throw new Error("[CopyQueue] files is required");
  if (!rootDestId) {
    throw new Error(
      "[CopyQueue] rootDestId is required (resolve via FolderMapStore.getFolderMapping(" +
        JSON.stringify(ROOT_SENTINEL) +
        "))",
    );
  }

  const filesById = new Map(files.map((f) => [f.id, f]));
  const selectedArr = Array.from(selectedIds || []);

  // Shared mutable context — workers read destToken + stopFlag from here.
  // T-07-11: destToken is only ever forwarded to copyFile; never logged.
  // BL-02: pool threaded into ctx so handleCopyError can pause sibling workers
  // synchronously on the first reauth — without it, every queued worker burns
  // its retry budget against an already-invalidated token and re-fires onAuthError.
  const ctx = {
    filesById,
    destToken,
    rootDestId,
    copyFile,
    queueStore,
    folderMapStore,
    onAuthError,
    sleep,
    stopFlag: false,
    enableFailureInjection,
    pool,
  };

  // donePromise is the async body of the orchestrator. Exposed via .done so callers
  // can await completion without blocking the controller return.
  const donePromise = (async () => {
    // -------------------------------------------------------------------------
    // Phase 1: INIT — classify every selected id, write starting status to QueueStore
    // -------------------------------------------------------------------------
    const existingTasks = await queueStore.getTasks();
    const taskById = new Map(existingTasks.map((t) => [t.id, t]));

    const pendingTaskIds = [];

    for (const id of selectedArr) {
      const file = filesById.get(id);
      const existing = taskById.get(id);

      // D-07: already completed → leave untouched (no-op; no API call, no overwrite).
      if (existing?.status === "completed") continue;

      // D-08: already unknown → leave untouched (Retry-Failed-Only excludes unknown).
      if (existing?.status === "unknown") continue;

      // D-05: folders — Phase 6 mirror creates them separately.
      if (file && isFolder(file.mimeType)) {
        await queueStore.updateTask(id, {
          status: "skipped",
          reason: "folder — mirrored separately",
          bytesTotal: 0,
          errorMsg: null,
        });
        continue;
      }

      // D-06: unsupported MIME (Forms, Sites, Jamboard, shortcuts, drive-sdk).
      if (file && isUnsupportedMime(file.mimeType)) {
        await queueStore.updateTask(id, {
          status: "skipped",
          reason: `unsupported mime: ${file.mimeType}`,
          bytesTotal: 0,
          errorMsg: null,
        });
        continue;
      }

      // If no existing task, write a fresh pending row with bytesTotal derived per D-17.
      if (!existing) {
        await queueStore.updateTask(id, {
          status: "pending",
          bytesCopied: 0,
          bytesTotal: file ? bytesForFile(file) : 0,
          errorMsg: null,
          reason: null,
        });
      } else if (existing.status === "pending" || existing.status === "failed") {
        // D-13: failed rows come in pre-reset to 'pending' by BentoDashboard (Plan 03).
        // Backfill bytesTotal in case prior init didn't set it.
        if (existing.bytesTotal === undefined || existing.bytesTotal === null) {
          await queueStore.updateTask(id, {
            bytesTotal: file ? bytesForFile(file) : 0,
          });
        }
      }

      // Only enqueue if the file is copyable (not a folder, not unsupported MIME).
      if (file && !isFolder(file.mimeType) && !isUnsupportedMime(file.mimeType)) {
        pendingTaskIds.push(id);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: RUN — submit copyOne for each pending task into the pool
    // -------------------------------------------------------------------------
    const submissions = pendingTaskIds.map((id) =>
      pool.submit(() => copyOne(id, ctx)).catch((err) => {
        // copyOne handles its own errors and persists status. Submit-level escapes
        // are unexpected; log them without breaking the overall run.
        console.error("[CopyQueue] copyOne submit-level error:", err);
      }),
    );

    await Promise.all(submissions);
    await pool.drain();
    // BL-01: release worker fibers + their 50ms polling timers. Without this,
    // each runCopyQueue invocation leaks 3 zombie workers for the tab's lifetime
    // (retries multiply: 3 attempts × 3 workers = 12 zombies after a few runs).
    pool.close();
  })();

  // Controller shape per D-02 (mirrors mirrorFolders return shape).
  return {
    pause: () => pool.pause(),
    resume: () => pool.resume(),
    stop: () => {
      ctx.stopFlag = true;
      // BL-01: also close the pool so its workers exit. Tasks already mid-fetch
      // still complete (drain-don't-abort, T-07-13) because close() does not
      // interrupt in-flight taskFn invocations — it only stops workers from
      // shifting NEW items off the queue.
      pool.close();
    },
    done: donePromise,
  };
}

// ---------------------------------------------------------------------------
// copyOne — per-task worker (called inside pool.submit)
// ---------------------------------------------------------------------------

/**
 * copyOne(taskId, ctx)
 * Executes one file copy: persist-before-mutate → DEV injection → parent resolution
 * → fetchWithBackoff(copyFile) → status update. Error routing via handleCopyError.
 *
 * D-04 / drain-don't-abort: stopFlag is checked BEFORE starting work, not mid-fetch.
 * In-flight copyFile POSTs always complete (drain-don't-abort — T-07-13).
 */
async function copyOne(taskId, ctx) {
  // D-04: exit early between tasks if stop was called.
  // WR-02: when stopFlag is set by a sibling worker (e.g. dailyLimitExceeded),
  // explicitly normalize this row back to 'pending' with cleared error fields
  // so the user sees the gap (M - completed - skipped - failed) and a future
  // re-run picks it up without inheriting stale errorMsg/reason. Persist defensively
  // — the row may not exist yet (init phase did the first write) but updateTask
  // upserts. Wrapped in try/catch so a store error never blocks the worker exit.
  if (ctx.stopFlag) {
    try {
      const existing = await ctx.queueStore.getTask?.(taskId);
      // Only touch rows that are still pending/copying — don't clobber completed/skipped/failed.
      if (!existing || existing.status === "pending" || existing.status === "copying") {
        await ctx.queueStore.updateTask(taskId, {
          status: "pending",
          errorMsg: null,
          reason: null,
        });
      }
    } catch (storeErr) {
      console.error("[CopyQueue] stopFlag pending-normalize failed:", storeErr);
    }
    return;
  }

  const file = ctx.filesById.get(taskId);
  if (!file) {
    await ctx.queueStore.updateTask(taskId, {
      status: "failed",
      errorMsg: "File not found in snapshot",
      reason: "missing",
    });
    return;
  }

  // PERS-03 persist-before-mutate: write 'copying' BEFORE the fetch fires.
  await ctx.queueStore.updateTask(taskId, { status: "copying", errorMsg: null, reason: null });

  // DEV-only failure injection — mirrors BentoDashboard.jsx:418-426 pattern.
  // Gated by enableFailureInjection (defaults to import.meta.env.DEV).
  // Vite dead-code-eliminates the dynamic import in production because the gate is false.
  if (ctx.enableFailureInjection) {
    try {
      const mod = await import("../mocks/failureInjection.js");
      mod.throwIfArmed(); // no-op if mode === 'none'; throws Drive-shaped error otherwise
    } catch (injectedErr) {
      // Normalize err.errors[0].reason → err.reason so classifyDriveError reads it.
      if (!injectedErr.reason && injectedErr.errors?.[0]?.reason) {
        injectedErr.reason = injectedErr.errors[0].reason;
      }
      return await handleCopyError(taskId, injectedErr, ctx);
    }
  }

  // Resolve destination parent folder.
  // Per 07-RESEARCH.md + folderMirror.js:154-156:
  //   srcParent missing OR === 'root' OR not in filesById → use rootDestId (top-level).
  //   Otherwise: FolderMapStore lookup with rootDestId fallback (mapping may not exist
  //   if Phase 6 mirror didn't create that folder branch yet).
  const srcParentId = file.parents?.[0];
  let destParentId;
  if (!srcParentId || srcParentId === "root" || !ctx.filesById.has(srcParentId)) {
    destParentId = ctx.rootDestId;
  } else {
    const mapping = await ctx.folderMapStore.getFolderMapping(srcParentId);
    destParentId = mapping?.destFolderId ?? ctx.rootDestId;
  }

  try {
    const res = await fetchWithBackoff(
      () =>
        ctx.copyFile({
          fileId: file.id,
          parents: [destParentId],
          name: file.name,             // D-10: verbatim, no sanitization, no suffix
          modifiedTime: file.modifiedTime, // COPY-04
          starred: file.starred ?? false,  // COPY-04
          token: ctx.destToken,
        }),
      { sleep: ctx.sleep },
    );

    // Success — bytesCopied = bytesTotal (atomic; D-15: no fake progress mid-copy).
    const bytesTotal = bytesForFile(file);
    await ctx.queueStore.updateTask(taskId, {
      status: "completed",
      bytesCopied: bytesTotal,
      bytesTotal,
      destFileId: res?.id ?? null,
      errorMsg: null,
      reason: null,
    });
  } catch (err) {
    // Normalize err.errors[0].reason → err.reason (defensive; googleApi.js already does this
    // for real Drive responses, but failureInjection and test fakes may not).
    if (!err.reason && err.errors?.[0]?.reason) {
      err.reason = err.errors[0].reason;
    }
    await handleCopyError(taskId, err, ctx);
  }
}

// ---------------------------------------------------------------------------
// handleCopyError — error classification + status routing
// ---------------------------------------------------------------------------

/**
 * handleCopyError(taskId, err, ctx)
 * Routes the error through classifyDriveError to one of five buckets:
 *   reauth  → revert to 'pending' (D-14) then invoke onAuthError once (WR-01)
 *   stop    → set stopFlag + status:'failed' (D-04 drain-don't-abort)
 *   skip    → status:'skipped'
 *   unknown → status:'unknown' (D-08: Retry-Failed-Only excludes this bucket)
 *   (else)  → status:'failed' (retry exhausted via fetchWithBackoff)
 */
async function handleCopyError(taskId, err, ctx) {
  const cls = classifyDriveError(err);

  if (cls === "reauth") {
    // D-14: revert to 'pending' BEFORE invoking onAuthError.
    // If left as 'copying', a resume attempt would skip it (thinking it's in-flight).
    await ctx.queueStore.updateTask(taskId, {
      status: "pending",
      errorMsg: null,
      reason: null,
    });
    // BL-02: pause sibling workers BEFORE invoking the funnel. Without this, every
    // other queued task POSTs with the same now-invalidated destToken, each one
    // fires onAuthError again, and the funnel runs N times instead of once. The
    // pause is policy that belongs in the orchestrator — relying on the UI layer
    // to remember to call controllerRef.current.pause() is a footgun.
    // Drain-don't-abort still holds: pause() blocks workers between tasks; any
    // copy already mid-fetch completes normally (T-07-13).
    ctx.pool?.pause();
    // WR-01: single funnel — invoked at orchestrator boundary only (not inside fetchWithBackoff).
    // T-07-12: wrapped in try/catch so a throwing funnel doesn't crash the worker.
    // T-07-16: worker returns after this — does NOT re-submit the same task immediately.
    try {
      await ctx.onAuthError?.(err);
    } catch (funnelErr) {
      console.error("[CopyQueue] onAuthError funnel threw:", funnelErr);
    }
    return;
  }

  if (cls === "stop") {
    // D-04: set stopFlag so other workers check it between tasks and exit cleanly.
    // T-07-13: NO abort signals, NO pool.terminate(), NO mid-fetch interruption.
    ctx.stopFlag = true;
    await ctx.queueStore.updateTask(taskId, {
      status: "failed",
      errorMsg: err.message || String(err),
      reason: err.reason || "stop",
    });
    return;
  }

  // skip → 'skipped' | unknown → 'unknown' (D-08) | all other → 'failed' (retry exhausted)
  if (cls === "skip") {
    await ctx.queueStore.updateTask(taskId, {
      status: "skipped",
      errorMsg: err.message || String(err),
      reason: err.reason || cls,
    });
  } else if (cls === "unknown") {
    // D-08: network error where Drive may or may not have processed the copy.
    // Retry-Failed-Only excludes this bucket; Phase 8 resume handles it manually.
    await ctx.queueStore.updateTask(taskId, {
      status: "unknown",
      errorMsg: err.message || String(err),
      reason: err.reason || cls,
    });
  } else {
    await ctx.queueStore.updateTask(taskId, {
      status: "failed",
      errorMsg: err.message || String(err),
      reason: err.reason || cls,
    });
  }
}
