import { QueueStore } from "./db.js";
import { TokenStorage } from "./storage.js";

/**
 * rehydrateQueueFromCursor — Mount-time queue rehydration helper.
 *
 * Idempotent. Reads the resume cursor from localStorage, validates its
 * shape, promotes any orphaned 'copying' rows to 'unknown' (rows that
 * were in-flight at the time of the last hard refresh), then counts
 * remaining resumable rows.
 *
 * Design decisions:
 *   D-04  Orphaned 'copying' rows promoted to status 'unknown' with a
 *         reason and errorMsg describing the interruption (per CONTEXT.md D-04).
 *   D-06  Single async function; runs once on BentoDashboard mount.
 *         Malformed cursor → log + clear + return null cursor.
 *   PERS-03  QueueStore.updateTask already awaits tx.done (atomic IDB
 *            commit) — each row promotion is individually durable.
 *
 * Strict-Mode safety: React 19 dev mode double-invokes effects. On the
 * second invocation all 'copying' rows have already been promoted to
 * 'unknown', so the inner loop is a no-op — idempotent by design.
 *
 * @returns {Promise<{
 *   cursor: object|null,
 *   remainingCount: number,
 *   promotedCount: number
 * }>}
 */
export async function rehydrateQueueFromCursor() {
  // Step 1: check for cursor presence.
  const raw = TokenStorage.getResumeCursor();
  if (!raw) {
    return { cursor: null, remainingCount: 0, promotedCount: 0 };
  }

  // Step 2: parse + validate cursor shape.
  let cursor;
  try {
    cursor = JSON.parse(raw);
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      (cursor.state !== "copying" && cursor.state !== "paused") ||
      typeof cursor.savedAt !== "number"
    ) {
      throw new Error("malformed cursor");
    }
  } catch (err) {
    // Step 3: malformed — log, clear, bail.
    console.warn("[rehydrate] malformed cursor, clearing:", err.message);
    TokenStorage.saveResumeCursor(null);
    return { cursor: null, remainingCount: 0, promotedCount: 0 };
  }

  // Step 4: read current queue tasks.
  const tasks = await QueueStore.getTasks();
  let promotedCount = 0;

  // Step 5: promote orphaned 'copying' rows → 'unknown' (D-04).
  // These are rows that were in-flight at the time of the last page reload.
  for (const t of tasks) {
    if (t.status === "copying") {
      await QueueStore.updateTask(t.id, {
        status: 'unknown',
        reason: 'refresh-during-copy',
        errorMsg: 'Interrupted by reload — verify manually',
      });
      promotedCount++;
    }
  }

  // Step 6: recount resumable rows after promotions.
  const freshTasks = await QueueStore.getTasks();
  // The 'copying' branch is defensive: Step 5 promoted all of them, but
  // Strict-Mode second invocations or a hypothetical concurrent writer
  // could leave one behind — include it to keep the count correct.
  const remainingCount = freshTasks.filter(
    (t) => t.status === "pending" || t.status === "copying",
  ).length;

  // Step 7: auto-clear cursor if nothing remains (D-03, covers
  // hard-crash-mid-completion edge case).
  if (remainingCount === 0) {
    TokenStorage.saveResumeCursor(null);
    return { cursor: null, remainingCount: 0, promotedCount };
  }

  // Step 8: return resumable state.
  return { cursor, remainingCount, promotedCount };
}
