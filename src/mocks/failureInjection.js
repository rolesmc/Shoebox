// src/mocks/failureInjection.js
// DEV-ONLY: runtime-toggleable failure injector. Plan 04's DevPanel binds setFailureMode.
// DEV-only by convention — enforced by callers using DEV-gated dynamic imports.
// Module is inert if loaded in prod (no top-level side effects beyond Object.freeze).

export const FAILURE_MODES = Object.freeze([
  "none",
  "401", // token expired (AUTH-06)
  "429-userRateLimit", // userRateLimitExceeded (COPY-03 retry)
  "403-dailyLimit", // dailyLimitExceeded (COPY-03 stop)
  "404", // notFound (COPY-03 skip)
  "cannotCopyFile", // cannotCopyFile (COPY-03 skip)
]);

// Live state — DevPanel mutates via setFailureMode, googleApi.mock reads via getFailureMode.
export const failureState = { mode: "none" };

export function setFailureMode(mode) {
  if (!FAILURE_MODES.includes(mode)) {
    throw new Error(
      `Unknown failure mode: ${mode}. Allowed: ${FAILURE_MODES.join(", ")}`,
    );
  }
  failureState.mode = mode;
}

export function getFailureMode() {
  return failureState.mode;
}

/**
 * Throws a Drive-API-shaped error matching the current failure mode.
 * The shape matches what Phase 7's fetchWithBackoff will classify (PITFALLS.md Pitfall 8).
 *
 * Error reason taxonomy per COPY-03:
 *   userRateLimitExceeded → retry with backoff
 *   dailyLimitExceeded    → stop entire run
 *   notFound              → skip this file
 *   cannotCopyFile        → skip this file
 *   authError             → surface to user (AUTH-06)
 */
export function throwIfArmed() {
  const mode = failureState.mode;
  if (mode === "none") return;
  const err = new Error(`Mock failure: ${mode}`);
  err.status =
    mode === "401"
      ? 401
      : mode === "404"
        ? 404
        : mode === "429-userRateLimit"
          ? 429
          : 403;
  err.errors = [
    {
      reason: {
        401: "authError",
        "429-userRateLimit": "userRateLimitExceeded",
        "403-dailyLimit": "dailyLimitExceeded",
        404: "notFound",
        cannotCopyFile: "cannotCopyFile",
      }[mode],
      message: err.message,
    },
  ];
  throw err;
}
