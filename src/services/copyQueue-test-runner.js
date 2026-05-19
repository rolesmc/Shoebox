// univault/src/services/copyQueue-test-runner.js
// Browser-loaded test runner for Phase 7 copy queue (COPY-01..07 + D-04/D-07/D-08/D-14).
// Mirrors univault/src/services/folderMirror-test-runner.js shape (Phase 6 D17 pattern).
// Uses in-memory fakes for copyFile + queueStore + folderMapStore + injected sleep.
// No real Drive calls; no token needed.

import { runCopyQueue } from "/src/services/copyQueue.js";
import { PromisePool } from "/src/utils/promisePool.js";
import { fetchWithBackoff } from "/src/utils/fetchWithBackoff.js";
import { classifyDriveError } from "/src/utils/classifyDriveError.js";

const resultsNode = document.getElementById("test-results");
const logs = [];

function log(msg) {
  logs.push(msg);
  if (resultsNode) resultsNode.textContent = logs.join("\n");
  console.log(msg);
}

async function notifyServer(passed) {
  // WR-08: surface notify failures visibly in the results pane. The headless
  // smoke runner depends on this POST to fail/pass the build; if CSP changes,
  // the endpoint moves, or the request 4xxs, swallowing the failure produces
  // a "ALL TESTS PASSED: YES" log that never reaches the harness — a silent-
  // success regression.
  try {
    const res = await fetch("/api/test-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passed, results: logs.join("\n") }),
    });
    if (!res.ok) throw new Error(`smoke-server returned ${res.status}`);
  } catch (err) {
    console.error("Failed to notify smoke test server:", err);
    if (resultsNode) {
      resultsNode.textContent += `\n\nWARNING: smoke-server notify failed: ${err.message}`;
    }
  }
}

let failures = 0;
function assert(cond, label) {
  if (cond) {
    log("PASS: " + label);
  } else {
    log("FAIL: " + label);
    failures += 1;
  }
}

// ---- In-memory fakes (mirror folderMirror-test-runner.js makeFakeStore pattern) ----

function makeFakeQueueStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  const writeOrder = []; // [{id, status, ts}] — tracks write sequence for ordering assertions (D-14)
  return {
    _data: data,
    _writeOrder: writeOrder,
    async updateTask(id, updates) {
      const existing = data.get(id) || {
        id,
        status: "pending",
        bytesCopied: 0,
        bytesTotal: 0,
        errorMsg: null,
        reason: null,
        destFileId: null,
      };
      const next = { ...existing, ...updates };
      data.set(id, next);
      writeOrder.push({ id, status: next.status, ts: writeOrder.length });
    },
    async getTasks() {
      return Array.from(data.values());
    },
    async getTask(id) {
      return data.get(id);
    },
    subscribe() {
      return () => {};
    },
    async clear() {
      data.clear();
      writeOrder.length = 0;
    },
  };
}

function makeFakeFolderMapStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    async getFolderMapping(id) {
      return data.get(id);
    },
    async putFolderMapping(id, destFolderId, name) {
      data.set(id, { id, destFolderId, name });
    },
  };
}

// behaviors: an array of behavior tokens or functions consumed in order per call.
// Tokens: 'ok' | '401' | '404' | 'rate' | 'stop' | 'cannot' | 'unknown' | 'storage' | a function
function makeFakeCopyFile(behaviors = []) {
  const calls = [];
  let i = 0;
  const fn = async (args) => {
    calls.push(args);
    const beh = behaviors[i] ?? "ok";
    i += 1;
    if (beh === "ok") return { id: `dst-${calls.length}`, kind: "drive#file", name: args.name };
    if (typeof beh === "function") {
      const synthesized = beh(calls.length, args);
      if (synthesized === "ok") return { id: `dst-${calls.length}`, kind: "drive#file", name: args.name };
      return throwShaped(synthesized);
    }
    return throwShaped(beh);
  };
  fn.calls = calls;
  fn.behaviors = behaviors;
  return fn;
}

function throwShaped(token) {
  const err = new Error(`mock-failure: ${token}`);
  if (token === "401")     { err.status = 401; err.reason = "authError"; }
  else if (token === "404")     { err.status = 404; err.reason = "notFound"; }
  else if (token === "rate")    { err.status = 429; err.reason = "rateLimitExceeded"; }
  else if (token === "stop")    { err.status = 403; err.reason = "dailyLimitExceeded"; }
  else if (token === "cannot")  { err.status = 403; err.reason = "cannotCopyFile"; }
  else if (token === "storage") { err.status = 403; err.reason = "storageQuotaExceeded"; }
  else if (token === "unknown") { /* no status, no reason — network failure shape per D-08 */ }
  else if (token === "5xx")     { err.status = 503; }
  throw err;
}

// Concurrent-call tracker — counts in-flight invocations to assert peak.
function makeConcurrencyTrackedCopyFile({ holdMs = 20, behaviors = [] } = {}) {
  let active = 0;
  let peak = 0;
  const calls = [];
  let i = 0;
  const fn = async (args) => {
    active++;
    peak = Math.max(peak, active);
    calls.push({ args, snapshotActive: active });
    const beh = behaviors[i] ?? "ok";
    i += 1;
    try {
      await new Promise((r) => setTimeout(r, holdMs));
      if (beh !== "ok") return throwShaped(beh);
      return { id: `dst-${calls.length}`, kind: "drive#file", name: args.name };
    } finally {
      active--;
    }
  };
  fn.calls = calls;
  fn.getPeak = () => peak;
  return fn;
}

// ---- Test suite ----

(async () => {
  try {
    log("--- CopyQueue Test Runner ---");

    // ---- Group 1: PromisePool — COPY-01 concurrency, drain ----
    {
      let active = 0;
      let peak = 0;
      const pool = new PromisePool(3);
      const tasks = Array.from({ length: 10 }, () =>
        pool.submit(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 20));
          active--;
        })
      );
      await Promise.all(tasks);
      assert(peak === 3, `COPY-01: pool peak concurrency = ${peak} (expected 3)`);
      await pool.drain();
      assert(true, "COPY-01: pool.drain() resolved after submissions completed");
    }

    // ---- Group 2: PromisePool pause/resume — drain-don't-abort (D-12) ----
    {
      const pool = new PromisePool(2);
      const order = [];
      const t1 = pool.submit(async () => {
        order.push("t1-start");
        await new Promise((r) => setTimeout(r, 50));
        order.push("t1-end");
      });
      const t2 = pool.submit(async () => {
        order.push("t2-start");
        await new Promise((r) => setTimeout(r, 50));
        order.push("t2-end");
      });
      pool.pause();
      await t1;
      await t2;
      // After pause, queued items don't run until resume. Submit t3 while paused.
      const t3 = pool.submit(async () => {
        order.push("t3-start");
        order.push("t3-end");
      });
      await new Promise((r) => setTimeout(r, 100));
      assert(!order.includes("t3-start"), "D-12: pool.pause() blocks new tasks");
      pool.resume();
      await t3;
      assert(order.includes("t3-end"), "D-12: pool.resume() unblocks queued tasks");
    }

    // ---- Group 3: fetchWithBackoff retry behavior — COPY-02 ----
    {
      let attempts = 0;
      try {
        await fetchWithBackoff(
          async () => {
            attempts++;
            throwShaped("rate");
          },
          { sleep: () => Promise.resolve() }
        );
      } catch (_) {
        /* expected */
      }
      assert(attempts === 5, `COPY-02: 5 attempts on retry-class error (got ${attempts})`);
    }

    // ---- Group 4: fetchWithBackoff propagates non-retry classes immediately — COPY-02 ----
    {
      let attempts = 0;
      try {
        await fetchWithBackoff(
          async () => {
            attempts++;
            throwShaped("404");
          },
          { sleep: () => Promise.resolve() }
        );
      } catch (_) {}
      assert(
        attempts === 1,
        `COPY-02: non-retry class propagates immediately (got ${attempts} attempts, expected 1)`
      );

      let attempts2 = 0;
      try {
        await fetchWithBackoff(
          async () => {
            attempts2++;
            throwShaped("401");
          },
          { sleep: () => Promise.resolve() }
        );
      } catch (_) {}
      assert(
        attempts2 === 1,
        `COPY-02: 401/reauth class propagates immediately (got ${attempts2} attempts, expected 1)`
      );
    }

    // ---- Group 5: classifyDriveError taxonomy — COPY-03 ----
    assert(classifyDriveError({ status: 401 }) === "reauth", "COPY-03: 401 → reauth");
    assert(classifyDriveError({ reason: "authError" }) === "reauth", "COPY-03: authError → reauth");
    assert(
      classifyDriveError({ status: 403, reason: "appNotAuthorizedToFile" }) === "skip",
      "COPY-03 / Q2 RESOLVED: appNotAuthorizedToFile → skip (per-file ACL, re-auth cannot help)"
    );
    assert(
      classifyDriveError({ status: 403, reason: "dailyLimitExceeded" }) === "stop",
      "COPY-03: dailyLimitExceeded → stop"
    );
    assert(
      classifyDriveError({ status: 403, reason: "quotaExceeded" }) === "stop",
      "COPY-03: quotaExceeded → stop"
    );
    assert(
      classifyDriveError({ status: 403, reason: "storageQuotaExceeded" }) === "stop",
      "COPY-03: storageQuotaExceeded → stop"
    );
    assert(
      classifyDriveError({ status: 403, reason: "userRateLimitExceeded" }) === "retry",
      "COPY-03: userRateLimitExceeded → retry"
    );
    assert(
      classifyDriveError({ status: 429, reason: "rateLimitExceeded" }) === "retry",
      "COPY-03: rateLimitExceeded → retry"
    );
    assert(classifyDriveError({ status: 503 }) === "retry", "COPY-03: 5xx → retry");
    assert(
      classifyDriveError({ status: 404, reason: "notFound" }) === "skip",
      "COPY-03: 404 → skip"
    );
    assert(
      classifyDriveError({ status: 403, reason: "cannotCopyFile" }) === "skip",
      "COPY-03: cannotCopyFile → skip"
    );
    assert(classifyDriveError({}) === "unknown", "COPY-03: empty error → unknown (D-08)");
    assert(
      classifyDriveError({ name: "TypeError", message: "Failed to fetch" }) === "unknown",
      "COPY-03: network error → unknown (D-08)"
    );
    // BL-03: { status: 0 } is the canonical fetch/XHR network-failure shape — must
    // route to 'unknown', NOT 'skip', or transient network blips silently drop files.
    assert(
      classifyDriveError({ status: 0 }) === "unknown",
      "COPY-03 / BL-03: status 0 (network-shaped) → unknown, not skip"
    );
    assert(
      classifyDriveError({ status: null }) === "unknown",
      "COPY-03 / BL-03: status null → unknown, not skip"
    );

    // ---- Group 6: runCopyQueue init — folder + MIME skips (D-05, D-06), COPY-05 ----
    {
      const files = [
        {
          id: "f-folder",
          name: "MyFolder",
          mimeType: "application/vnd.google-apps.folder",
          size: 0,
          parents: ["root"],
        },
        {
          id: "f-form",
          name: "Survey",
          mimeType: "application/vnd.google-apps.form",
          size: 0,
          parents: ["root"],
        },
        {
          id: "f-shortcut",
          name: "Link",
          mimeType: "application/vnd.google-apps.shortcut",
          size: 0,
          parents: ["root"],
        },
        {
          id: "f-sdk",
          name: "Lucid",
          mimeType: "application/vnd.google-apps.drive-sdk.abc123",
          size: 0,
          parents: ["root"],
        },
        {
          id: "f-doc",
          name: "Notes",
          mimeType: "application/vnd.google-apps.document",
          size: 0,
          parents: ["root"],
        },
      ];
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile([]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(["f-folder", "f-form", "f-shortcut", "f-sdk", "f-doc"]),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      const tasks = await qStore.getTasks();
      const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
      assert(
        byId["f-folder"]?.status === "skipped" &&
          byId["f-folder"]?.reason === "folder — mirrored separately",
        "D-05: folder marked skipped with correct reason"
      );
      assert(
        byId["f-form"]?.status === "skipped" &&
          /unsupported mime: application\/vnd\.google-apps\.form/.test(
            byId["f-form"]?.reason || ""
          ),
        "D-06: form marked skipped with reason"
      );
      assert(byId["f-shortcut"]?.status === "skipped", "D-06: shortcut marked skipped");
      assert(byId["f-sdk"]?.status === "skipped", "D-06: drive-sdk prefix marked skipped");
      assert(byId["f-doc"]?.status === "completed", "Doc successfully copied past init filter");
      assert(
        copyFn.calls.length === 1 && copyFn.calls[0].fileId === "f-doc",
        "COPY-05: unsupported MIME never reaches copyFile"
      );
    }

    // ---- Group 7: copyFile payload preservation — COPY-04 + D-10 verbatim name ----
    {
      const files = [
        {
          id: "f1",
          name: "Project — Final.docx",
          mimeType: "application/pdf",
          size: 1024,
          parents: ["folder-A"],
          modifiedTime: "2025-01-15T10:00:00.000Z",
          starred: true,
        },
      ];
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
        "folder-A": { id: "folder-A", destFolderId: "DEST_A", name: "A" },
      });
      const copyFn = makeFakeCopyFile(["ok"]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(["f1"]),
        files: [
          ...files,
          {
            id: "folder-A",
            name: "A",
            mimeType: "application/vnd.google-apps.folder",
            size: 0,
            parents: ["root"],
          },
        ],
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      const args = copyFn.calls[0];
      assert(args?.fileId === "f1", "COPY-04: fileId forwarded");
      assert(
        args?.name === "Project — Final.docx",
        "D-10: name passed VERBATIM (em-dash preserved)"
      );
      assert(
        JSON.stringify(args?.parents) === '["DEST_A"]',
        "COPY-04: parent resolved via FolderMapStore"
      );
      assert(
        args?.modifiedTime === "2025-01-15T10:00:00.000Z",
        "COPY-04: modifiedTime forwarded"
      );
      assert(args?.starred === true, "COPY-04: starred forwarded");
      assert(args?.token === "tok", "COPY-04: token forwarded");
    }

    // ---- Group 8: D-07 completed-status dedupe (no re-copy) ----
    {
      const files = [
        { id: "f1", name: "x.pdf", mimeType: "application/pdf", size: 100, parents: ["root"] },
      ];
      const qStore = makeFakeQueueStore({
        f1: {
          id: "f1",
          status: "completed",
          bytesCopied: 100,
          bytesTotal: 100,
          errorMsg: null,
          reason: null,
          destFileId: "old-dst",
        },
      });
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile([]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(["f1"]),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      assert(
        copyFn.calls.length === 0,
        "D-07: completed task is NOT re-copied (no fakeCopyFile call)"
      );
    }

    // ---- Group 9: D-14 401 reverts task to 'pending' BEFORE invoking onAuthError ----
    {
      const files = [
        { id: "f1", name: "x.pdf", mimeType: "application/pdf", size: 100, parents: ["root"] },
      ];
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile(["401"]);
      let authErrorCalledAt = null;
      const ctrl = runCopyQueue({
        selectedIds: new Set(["f1"]),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async (_err) => {
          // Capture the write-order index at which onAuthError fires.
          authErrorCalledAt = qStore._writeOrder.length;
        },
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      const finalTask = await qStore.getTask("f1");
      assert(
        finalTask?.status === "pending",
        `D-14: 401 reverts task to 'pending' (got ${finalTask?.status})`
      );
      // The revert must precede onAuthError invocation.
      const revertIdx = qStore._writeOrder.findIndex(
        (w, i) => i > 0 && w.id === "f1" && w.status === "pending"
      );
      assert(
        revertIdx >= 0 && authErrorCalledAt !== null && revertIdx < authErrorCalledAt,
        `D-14: revert (idx ${revertIdx}) precedes onAuthError (idx ${authErrorCalledAt})`
      );
    }

    // ---- Group 10: D-08 unknown bucket for network/no-status errors ----
    {
      const files = [
        { id: "f1", name: "x.pdf", mimeType: "application/pdf", size: 100, parents: ["root"] },
      ];
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile(["unknown"]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(["f1"]),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      const finalTask = await qStore.getTask("f1");
      assert(
        finalTask?.status === "unknown",
        `D-08: network error → unknown bucket (got ${finalTask?.status})`
      );
    }

    // ---- Group 11: D-04 stop-class drain — in-flight workers complete, no abort ----
    {
      const files = Array.from({ length: 6 }, (_, i) => ({
        id: `f${i}`,
        name: `n${i}.pdf`,
        mimeType: "application/pdf",
        size: 10,
        parents: ["root"],
      }));
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      // Behavior: first 2 succeed, 3rd is stop-class; the rest may or may not be picked up
      // depending on timing, but those that ARE picked up MUST complete (not abort).
      const copyFn = makeConcurrencyTrackedCopyFile({
        holdMs: 30,
        behaviors: ["ok", "ok", "stop", "ok", "ok", "ok"],
      });
      const ctrl = runCopyQueue({
        selectedIds: new Set(files.map((f) => f.id)),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      // The 'stop' worker sets the flag while up to 2 other workers are mid-fetch.
      // They must complete (drain-don't-abort).
      assert(
        copyFn.calls.length >= 3,
        `D-04: at least 3 calls reached copyFile (got ${copyFn.calls.length})`
      );
      const tasks = await qStore.getTasks();
      const inFlightAtEnd = tasks.filter((t) => t.status === "copying").length;
      assert(
        inFlightAtEnd === 0,
        `D-04: no tasks left in 'copying' state after drain (got ${inFlightAtEnd})`
      );
      const stoppedTask = tasks.find((t) => t.reason === "dailyLimitExceeded");
      assert(
        stoppedTask?.status === "failed",
        "D-04: stop-class task is marked 'failed' with the original reason"
      );
    }

    // ---- Group 12: COPY-07 Retry-Failed-Only resets ONLY failed rows (D-13 simulation) ----
    // The orchestrator's retry logic is in BentoDashboard's handleRetryFailed (Plan 03).
    // Here we assert the orchestrator-side invariant: if the caller resets failed→pending
    // and re-runs runCopyQueue, ONLY pending rows are re-attempted.
    {
      const files = [
        { id: "ok", name: "n.pdf", mimeType: "application/pdf", size: 10, parents: ["root"] },
        { id: "f", name: "n.pdf", mimeType: "application/pdf", size: 10, parents: ["root"] },
        { id: "u", name: "n.pdf", mimeType: "application/pdf", size: 10, parents: ["root"] },
        {
          id: "s",
          name: "n.pdf",
          mimeType: "application/vnd.google-apps.form",
          size: 0,
          parents: ["root"],
        },
      ];
      const qStore = makeFakeQueueStore({
        ok: { id: "ok", status: "completed", bytesCopied: 10, bytesTotal: 10 },
        f: { id: "f", status: "pending", bytesCopied: 0, bytesTotal: 10 }, // simulated reset
        u: { id: "u", status: "unknown", bytesCopied: 0, bytesTotal: 10 },
        s: {
          id: "s",
          status: "skipped",
          reason: "unsupported mime: application/vnd.google-apps.form",
        },
      });
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile(["ok"]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(["ok", "f", "u", "s"]),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      assert(
        copyFn.calls.length === 1 && copyFn.calls[0].fileId === "f",
        "COPY-07: ONLY the reset-to-pending row was re-copied; completed/unknown/skipped untouched"
      );
      const final = await qStore.getTask("u");
      assert(
        final?.status === "unknown",
        "COPY-07: 'unknown' status preserved through Retry-Failed-Only pass"
      );
      const finalSkip = await qStore.getTask("s");
      assert(
        finalSkip?.status === "skipped",
        "COPY-07: 'skipped' status preserved through Retry-Failed-Only pass"
      );
      const finalOk = await qStore.getTask("ok");
      assert(
        finalOk?.status === "completed",
        "D-07: completed status preserved through Retry-Failed-Only pass"
      );
    }

    // ---- Group 13: COPY-06 aggregate counter math (denominator excludes skipped) ----
    {
      const files = [
        {
          id: "doc",
          name: "d",
          mimeType: "application/vnd.google-apps.document",
          size: 0,
          parents: ["root"],
        }, // native: 0 bytes
        { id: "pdf1", name: "p1.pdf", mimeType: "application/pdf", size: 1000, parents: ["root"] },
        { id: "pdf2", name: "p2.pdf", mimeType: "application/pdf", size: 2000, parents: ["root"] },
        {
          id: "form",
          name: "f",
          mimeType: "application/vnd.google-apps.form",
          size: 0,
          parents: ["root"],
        }, // skipped
      ];
      const qStore = makeFakeQueueStore();
      const fStore = makeFakeFolderMapStore({
        __ROOT__: { id: "__ROOT__", destFolderId: "ROOT_DEST", name: "UniVault" },
      });
      const copyFn = makeFakeCopyFile(["ok", "ok", "ok"]);
      const ctrl = runCopyQueue({
        selectedIds: new Set(files.map((f) => f.id)),
        files,
        destToken: "tok",
        rootDestId: "ROOT_DEST",
        onAuthError: async () => {},
        copyFile: copyFn,
        queueStore: qStore,
        folderMapStore: fStore,
        sleep: () => Promise.resolve(),
        enableFailureInjection: false,
      });
      await ctrl.done;
      const tasks = await qStore.getTasks();
      const eligible = tasks.filter((t) => t.status !== "skipped");
      const bytesTotal = eligible.reduce((s, t) => s + (Number(t.bytesTotal) || 0), 0);
      const bytesDone = eligible
        .filter((t) => t.status === "completed")
        .reduce((s, t) => s + (Number(t.bytesCopied) || 0), 0);
      assert(
        eligible.length === 3,
        `COPY-06: 3 eligible rows after excluding skipped (got ${eligible.length})`
      );
      assert(
        bytesTotal === 3000,
        `COPY-06: bytesTotal === 3000 (native + skipped contribute 0; got ${bytesTotal})`
      );
      assert(
        bytesDone === 3000,
        `COPY-06: bytesDone === 3000 after all 3 copies complete (got ${bytesDone})`
      );
    }

    // ---- Final results banner (mirror folderMirror-test-runner.js:241-258) ----
    log("\n--- SYSTEM RESULTS ---");
    if (failures === 0) {
      log("ALL TESTS PASSED: YES");
      log("FAILURES: 0");
      await notifyServer(true);
    } else {
      log("ALL TESTS PASSED: NO");
      log("FAILURES: " + failures);
      await notifyServer(false);
    }
  } catch (e) {
    log("ERROR IN RUNNER: " + e.stack);
    log("\n--- SYSTEM RESULTS ---");
    log("ALL TESTS PASSED: NO");
    log("FAILURES: 1");
    await notifyServer(false);
  }
})();
