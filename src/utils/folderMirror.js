// univault/src/utils/folderMirror.js
// Serial parents-first folder mirror over Drive v3, reuses folderMap for resume idempotency (MIRROR-01..04).
// Algorithm: ancestor-walk → recursive memo-create with __ROOT__ sentinel → per-folder IDB persist before next POST.
// All side-effecting deps (createFolder, folderMapStore, now) are injectable for tests.

import { createFolder as realCreateFolder } from "../services/googleApi.js";
import { FolderMapStore } from "../services/db.js";
import { sanitizeFolderName } from "./sanitizeFolderName.js";

export const ROOT_SENTINEL = "__ROOT__";
const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 1000;
const RETRY_CAP_MS = 32_000;

/**
 * Format a Date as YYYY-MM-DD in LOCAL timezone.
 * Local TZ is correct: users see Drive UI in their browser locale; a migration
 * started 11:55 PM local should not display tomorrow's date because UTC ticked.
 */
function formatLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Walk parents from each selected id, collecting the minimal Set of source folder IDs
 * that must be created in the destination. Stops at the source root (parent === "root"
 * or parent not in filesById). Includes selected folders themselves; excludes selected files.
 * Cycle-safe via visited set (RESEARCH §Pitfall 2).
 */
export function collectAncestorFolderIds(selectedIds, filesById) {
  const ancestors = new Set();
  const visited = new Set();

  function walkUp(id) {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const node = filesById.get(id);
    if (!node) return; // hit the source root (not indexed) or missing entry → stop
    if (node.mimeType === "application/vnd.google-apps.folder") {
      ancestors.add(id);
    }
    const parentId = node.parents?.[0];
    if (parentId && parentId !== "root") walkUp(parentId);
  }

  for (const id of selectedIds) {
    const node = filesById.get(id);
    if (!node) continue;
    if (node.mimeType === "application/vnd.google-apps.folder") {
      walkUp(id); // selected folder + its ancestry
    } else {
      const parentId = node.parents?.[0];
      if (parentId && parentId !== "root") walkUp(parentId);
    }
  }

  return ancestors;
}

/**
 * Phase-local retry wrapper. Phase 7 will own the generic fetchWithBackoff (A1);
 * mirroring this minimal shape avoids cross-phase coupling.
 * - 401 / authError → never retry; call onAuthError; rethrow
 * - 429 / 5xx / rateLimitExceeded → ±50% jittered exponential backoff, cap 32s, 5 attempts
 * - storageQuotaExceeded / 4xx → fatal, rethrow (NO "skip" — would orphan descendants)
 */
async function createFolderWithRetry({
  createFolder,
  name,
  parents,
  token,
  onAuthError,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await createFolder({ name, parents, token });
    } catch (err) {
      if (err?.status === 401 || err?.reason === "authError") {
        await onAuthError?.(err);
        throw err;
      }
      const retryable =
        (typeof err?.status === "number" && err.status >= 500) ||
        err?.reason === "userRateLimitExceeded" ||
        err?.reason === "rateLimitExceeded";
      if (retryable && attempt < RETRY_MAX_ATTEMPTS) {
        const base = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CAP_MS);
        const jitter = base * (0.5 + Math.random()); // ±50%
        console.warn(
          `[FolderMirror] retry attempt ${attempt} after ${Math.round(jitter)}ms`,
          err?.reason || err?.message,
        );
        await sleep(jitter);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Create-or-reuse the timestamped root folder under destination My Drive root.
 * Sentinel key `__ROOT__` in folderMap. Cannot collide with real Drive IDs
 * (Drive file IDs are 28+ char URL-safe base64-ish; "__ROOT__" is 8 chars w/ underscores).
 */
async function ensureRoot({
  destToken,
  createFolder,
  folderMapStore,
  now,
  onAuthError,
}) {
  const existing = await folderMapStore.getFolderMapping(ROOT_SENTINEL);
  if (existing) return existing.destFolderId;

  const name = `UniVault Migration - ${formatLocalISODate(now())}`;
  const res = await createFolderWithRetry({
    createFolder,
    name,
    parents: ["root"],
    token: destToken,
    onAuthError,
  });
  await folderMapStore.putFolderMapping(ROOT_SENTINEL, res.id, name);
  return res.id;
}

/**
 * Ensure the destination folder for srcId exists. Recurses parents-first.
 * Reuses folderMap entries (resume contract — MIRROR-04). Persists before returning (MIRROR-03).
 */
async function ensureDestFolder(srcId, ctx) {
  // 1. Resume / dedupe check (MIRROR-04)
  const existing = await ctx.folderMapStore.getFolderMapping(srcId);
  if (existing) return existing.destFolderId;

  // 2. Resolve parent (use rootDestId for top-level or missing-from-index)
  const srcNode = ctx.filesById.get(srcId);
  if (!srcNode) throw new Error(`[FolderMirror] Missing source folder ${srcId}`);
  const srcParentId = srcNode.parents?.[0];
  const destParentId =
    !srcParentId || srcParentId === "root" || !ctx.filesById.has(srcParentId)
      ? ctx.rootDestId
      : await ensureDestFolder(srcParentId, ctx); // recurse parents-first

  // 3. Create with sanitized name (T-06-01)
  const name = sanitizeFolderName(srcNode.name);
  const res = await createFolderWithRetry({
    createFolder: ctx.createFolder,
    name,
    parents: [destParentId],
    token: ctx.destToken,
    onAuthError: ctx.onAuthError,
  });

  // 4. Persist BEFORE onProgress / return (MIRROR-03 — PERS-03 invariant)
  await ctx.folderMapStore.putFolderMapping(srcId, res.id, name);

  ctx.onProgress?.({
    created: ++ctx.createdCount,
    total: ctx.totalCount,
    name,
  });
  return res.id;
}

/**
 * mirrorFolders({ selectedIds, filesById, destToken, ... })
 * Public entry point. Always creates/reuses the root first, then walks the ancestor
 * set serially (concurrency=1 — MIRROR-04). Returns { rootDestId, mappingCount }.
 */
export async function mirrorFolders({
  selectedIds,
  filesById,
  destToken,
  onProgress,
  onAuthError,
  createFolder = realCreateFolder,
  folderMapStore = FolderMapStore,
  now = () => new Date(),
} = {}) {
  if (!filesById) throw new Error("[FolderMirror] filesById is required");
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);

  const rootDestId = await ensureRoot({
    destToken,
    createFolder,
    folderMapStore,
    now,
    onAuthError,
  });

  const ancestorIds = collectAncestorFolderIds(ids, filesById);

  const ctx = {
    rootDestId,
    filesById,
    destToken,
    createFolder,
    folderMapStore,
    onAuthError,
    onProgress,
    totalCount: ancestorIds.size + 1,
    createdCount: 1, // root counts as already created/reused
  };

  // Emit initial progress for the root (so UI shows "1 of N" immediately)
  onProgress?.({ created: 1, total: ctx.totalCount, name: "(root)" });

  for (const id of ancestorIds) {
    await ensureDestFolder(id, ctx);
  }

  return { rootDestId, mappingCount: ancestorIds.size + 1 };
}
