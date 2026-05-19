// univault/src/services/folderMirror-test-runner.js
// Browser-loaded test runner for Phase 6 folder mirror (MIRROR-01..04 + sanitization).
// Replicates db-test-runner.js shape so the smoke-test server's PASS/FAIL grep + banner format work unchanged.
// Uses in-memory fakes for createFolder + folderMapStore — does NOT touch real IDB.

import {
  mirrorFolders,
  collectAncestorFolderIds,
  ROOT_SENTINEL,
} from "/src/utils/folderMirror.js";
import { sanitizeFolderName } from "/src/utils/sanitizeFolderName.js";

const resultsNode = document.getElementById("test-results");
const logs = [];

function log(msg) {
  logs.push(msg);
  resultsNode.textContent = logs.join("\n");
  console.log(msg);
}

async function notifyServer(passed) {
  try {
    await fetch("/api/test-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passed, results: logs.join("\n") }),
    });
  } catch (err) {
    console.error("Failed to notify smoke test server:", err);
  }
}

// ---------------------- Fakes ----------------------

function makeFakeStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    _data: data,
    async putFolderMapping(id, destFolderId, name) {
      data.set(id, { id, destFolderId, name });
    },
    async getFolderMapping(id) {
      return data.get(id);
    },
    async clear() {
      data.clear();
    },
  };
}

function makeFakeCreateFolder() {
  const calls = [];
  let counter = 0;
  const fn = async ({ name, parents, token }) => {
    counter += 1;
    const id = `fake-${counter}`;
    calls.push({ name, parents, token, id });
    return { kind: "drive#file", id, name, mimeType: "application/vnd.google-apps.folder" };
  };
  fn.calls = calls;
  return fn;
}

// Fixture: file F3 sits 3 folders deep: rootFolderID -> fA -> fB -> fC -> F3
function makeDeepFixture() {
  return new Map([
    ["fA", { id: "fA", name: "FolderA", mimeType: "application/vnd.google-apps.folder", parents: ["root"] }],
    ["fB", { id: "fB", name: "FolderB", mimeType: "application/vnd.google-apps.folder", parents: ["fA"] }],
    ["fC", { id: "fC", name: "FolderC", mimeType: "application/vnd.google-apps.folder", parents: ["fB"] }],
    ["F3", { id: "F3", name: "deepfile.txt", mimeType: "text/plain", parents: ["fC"], size: "100" }],
  ]);
}

let failures = 0;
function assert(cond, label) {
  if (cond) log("PASS: " + label);
  else { log("FAIL: " + label); failures += 1; }
}

// ---------------------- Tests ----------------------

(async () => {
  try {
    log("--- FolderMirror Test Runner ---");

    // ===== MIRROR-01: Ancestor walk =====
    {
      const filesById = makeDeepFixture();
      const out = collectAncestorFolderIds(new Set(["F3"]), filesById);
      assert(out.size === 3 && out.has("fA") && out.has("fB") && out.has("fC"),
        "MIRROR-01: 3-deep leaf file returns exactly its 3 ancestor folder IDs");
    }
    {
      const filesById = makeDeepFixture();
      const out = collectAncestorFolderIds(new Set(["fC"]), filesById);
      assert(out.has("fA") && out.has("fB") && out.has("fC"),
        "MIRROR-01: selected folder includes itself + its ancestors");
    }
    {
      // Cycle: A -> B -> A. visited Set must terminate the walk.
      const filesById = new Map([
        ["A", { id: "A", name: "A", mimeType: "application/vnd.google-apps.folder", parents: ["B"] }],
        ["B", { id: "B", name: "B", mimeType: "application/vnd.google-apps.folder", parents: ["A"] }],
        ["X", { id: "X", name: "x.txt", mimeType: "text/plain", parents: ["A"] }],
      ]);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; }, 1000);
      const out = collectAncestorFolderIds(new Set(["X"]), filesById);
      clearTimeout(timer);
      assert(!timedOut && out.has("A") && out.has("B"),
        "MIRROR-01: cycle A->B->A terminates and still collects both ancestors");
    }
    {
      const filesById = new Map([
        ["rootfile", { id: "rootfile", name: "top.txt", mimeType: "text/plain", parents: ["root"] }],
      ]);
      const out = collectAncestorFolderIds(new Set(["rootfile"]), filesById);
      assert(out.size === 0,
        "MIRROR-01: file whose parent is 'root' contributes zero ancestors");
    }

    // ===== MIRROR-02: Timestamped root format =====
    {
      const fakeCF = makeFakeCreateFolder();
      const fakeStore = makeFakeStore();
      const result = await mirrorFolders({
        selectedIds: new Set(),
        filesById: new Map(),
        destToken: "tok",
        createFolder: fakeCF,
        folderMapStore: fakeStore,
        now: () => new Date("2026-05-18T10:00:00Z"),
      });
      const rootName = fakeCF.calls[0]?.name;
      assert(/^Shoebox Migration - \d{4}-\d{2}-\d{2}$/.test(rootName || ""),
        "MIRROR-02: root name matches 'Shoebox Migration - YYYY-MM-DD' format (got: " + rootName + ")");
      assert(fakeCF.calls[0]?.parents?.[0] === "root",
        "MIRROR-02: root folder is created under destination My Drive root (parents: ['root'])");
      assert(result.mappingCount === 1 && result.rootDestId === fakeCF.calls[0].id,
        "MIRROR-02: empty selection still creates the root (Pitfall 4)");
      assert(fakeStore._data.get(ROOT_SENTINEL)?.destFolderId === fakeCF.calls[0].id,
        "MIRROR-02: root sentinel '__ROOT__' persisted to folderMap");
    }

    // ===== MIRROR-03: Persist BEFORE next create =====
    {
      const fakeStore = makeFakeStore();
      const events = []; // ordered record of "put:<id>" and "create:<name>"
      const wrappedStore = {
        ...fakeStore,
        async putFolderMapping(id, destFolderId, name) {
          events.push(`put:${id}`);
          return fakeStore.putFolderMapping(id, destFolderId, name);
        },
        async getFolderMapping(id) { return fakeStore.getFolderMapping(id); },
      };
      const fakeCF = async ({ name, parents, token }) => {
        events.push(`create:${name}`);
        const id = `fake-${events.filter(e => e.startsWith("create:")).length}`;
        return { id, name, mimeType: "application/vnd.google-apps.folder" };
      };
      await mirrorFolders({
        selectedIds: new Set(["F3"]),
        filesById: makeDeepFixture(),
        destToken: "tok",
        createFolder: fakeCF,
        folderMapStore: wrappedStore,
        now: () => new Date("2026-05-18T10:00:00Z"),
      });
      // Between each create:X and the NEXT create:Y, there must be a put:* event.
      let ordered = true;
      for (let i = 0; i < events.length - 1; i++) {
        if (events[i].startsWith("create:")) {
          // The next event must be a put: for this folder.
          if (!events[i + 1].startsWith("put:")) { ordered = false; break; }
        }
      }
      assert(ordered, "MIRROR-03: every createFolder is followed by putFolderMapping BEFORE the next createFolder fires");
    }

    // ===== MIRROR-04: Resume reuses folderMap =====
    {
      // Pre-seed: __ROOT__ + fA + fB already mapped; only fC is missing.
      const seed = {
        [ROOT_SENTINEL]: { id: ROOT_SENTINEL, destFolderId: "dest-root", name: "Shoebox Migration - 2026-05-17" },
        fA: { id: "fA", destFolderId: "dest-fA", name: "FolderA" },
        fB: { id: "fB", destFolderId: "dest-fB", name: "FolderB" },
      };
      const fakeStore = makeFakeStore(seed);
      const fakeCF = makeFakeCreateFolder();
      await mirrorFolders({
        selectedIds: new Set(["F3"]),
        filesById: makeDeepFixture(),
        destToken: "tok",
        createFolder: fakeCF,
        folderMapStore: fakeStore,
        now: () => new Date("2026-05-18T10:00:00Z"),
      });
      assert(fakeCF.calls.length === 1 && fakeCF.calls[0].name === "FolderC",
        "MIRROR-04: with __ROOT__+fA+fB pre-seeded, only FolderC is created (calls=" + fakeCF.calls.length + ")");
    }
    {
      // Two consecutive runs — second must issue ZERO createFolder calls.
      const fakeStore = makeFakeStore();
      const fakeCF1 = makeFakeCreateFolder();
      await mirrorFolders({
        selectedIds: new Set(["F3"]),
        filesById: makeDeepFixture(),
        destToken: "tok",
        createFolder: fakeCF1,
        folderMapStore: fakeStore,
        now: () => new Date("2026-05-18T10:00:00Z"),
      });
      const firstCount = fakeCF1.calls.length;
      const fakeCF2 = makeFakeCreateFolder();
      await mirrorFolders({
        selectedIds: new Set(["F3"]),
        filesById: makeDeepFixture(),
        destToken: "tok",
        createFolder: fakeCF2,
        folderMapStore: fakeStore,
        now: () => new Date("2026-05-18T10:00:00Z"),
      });
      assert(firstCount === 4 && fakeCF2.calls.length === 0,
        "MIRROR-04: consecutive runs — first=" + firstCount + " creates, second=" + fakeCF2.calls.length + " creates (idempotent)");
    }

    // ===== Sanitizer defense-in-depth =====
    {
      assert(sanitizeFolderName() === "Untitled",
        "Sanitizer: undefined → Untitled");
      assert(sanitizeFolderName("Notes‮sdrawkcaB") === "NotessdrawkcaB",
        "Sanitizer: U+202E (RLO) stripped");
      assert(sanitizeFolderName("a​b") === "ab",
        "Sanitizer: zero-width space stripped");
      assert(sanitizeFolderName("X".repeat(1000)).length === 255,
        "Sanitizer: 255 char cap enforced");
    }

    // ===== Final banner =====
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
