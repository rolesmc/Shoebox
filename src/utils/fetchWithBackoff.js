// univault/src/utils/fetchWithBackoff.js
// Generic retry wrapper — COPY-02. Generalizes createFolderWithRetry (folderMirror.js:76-114)
// per STATE.md D12 / D-A1. Retries up to 5 times with ±50% jitter (base 1s, cap 32s) ONLY
// when classifyDriveError(err) === 'retry'. All other classes (reauth/stop/skip/unknown)
// propagate immediately so the orchestrator one level up can route them.
//
// WR-01: this wrapper does NOT invoke any auth-error callback. The orchestrator's outer
// catch is the single funnel — folderMirror.js WR-01 explains why double-invocation is fragile.
//
// PHASE-7 FIX vs Phase 6: skip the sleep on the final attempt — wastes up to 32s returning
// a terminal error the caller could see immediately. Net behavior matches Phase 6
// (Phase 6's `attempt < RETRY_MAX_ATTEMPTS` guard already prevented it; here we make the
// structure cleaner by checking attempts === MAX_ATTEMPTS before the sleep call).

import { classifyDriveError } from "./classifyDriveError.js";

export const MAX_ATTEMPTS = 5;
export const BASE_MS = 1000;
export const CAP_MS = 32_000;

export async function fetchWithBackoff(
  fn,
  { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  if (typeof fn !== "function") {
    throw new Error("[fetchWithBackoff] fn must be a function");
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const cls = classifyDriveError(err);

      // Non-retryable classes propagate immediately — caller orchestrator handles routing.
      if (cls !== "retry") throw err;

      // PHASE-7 FIX: don't sleep after the final attempt.
      if (attempt === MAX_ATTEMPTS) throw err;

      // ±50% jitter (matches folderMirror.js lines 97-98 verbatim)
      const base = Math.min(BASE_MS * 2 ** (attempt - 1), CAP_MS);
      const jitter = base * (0.5 + Math.random()); // [0.5×base, 1.5×base)
      console.warn(
        `[fetchWithBackoff] retry attempt ${attempt} after ${Math.round(jitter)}ms`,
        err?.reason || err?.message,
      );
      await sleep(jitter);
    }
  }
  // WR-06 defensive: loop always exits via return or throw, but surface a clear error if not.
  throw lastErr || new Error("[fetchWithBackoff] exhausted without resolution");
}
