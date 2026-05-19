// univault/src/utils/classifyDriveError.js
// Pure classifier — maps a Drive API error to one of five action buckets.
// COPY-03: retry transient, reauth on 401, skip permanent, stop on quota, unknown on network.
// D-08: errors with no status AND no reason → 'unknown' (avoids re-issuing a copy
// whose POST may have succeeded server-side but whose response was lost).
// No I/O, no React, no Drive coupling — pure data → label mapping.

export const STOP_REASONS = new Set([
  "dailyLimitExceeded",
  "quotaExceeded",
  "storageQuotaExceeded",
  "domainPolicy",
  "activeItemCreationLimitExceeded",
  "numChildrenInNonRootLimitExceeded",
]);

export const RETRY_REASONS = new Set([
  "userRateLimitExceeded",
  "rateLimitExceeded",
  "sharingRateLimitExceeded",
]);

export function classifyDriveError(err) {
  const reason = err?.reason;
  const status = err?.status;

  // 1. Network / unclassified — D-08 unknown bucket
  if (status === undefined && !reason) return "unknown";

  // 2. Reauth — 401 / authError only. NOT appNotAuthorizedToFile (see RESEARCH.md
  //    Open Question Q2 RESOLVED → skip): drive.file is per-file ACL, re-auth does
  //    not grant access to a previously-unauthorized file. Safer to skip the row
  //    than to bounce the user through a re-auth that cannot help.
  if (status === 401 || reason === "authError") {
    return "reauth";
  }

  // 3. Stop (cannot make progress today)
  if (STOP_REASONS.has(reason)) return "stop";

  // 4. Retry (transient)
  if (RETRY_REASONS.has(reason)) return "retry";
  if (typeof status === "number" && status >= 500 && status < 600) return "retry";

  // 5. Skip (file-specific permanent — default for any other 4xx)
  // 404, cannotCopyFile, insufficientFilePermissions, myDriveHierarchyDepthLimitExceeded,
  // badRequest, invalid all fall through here.
  return "skip";
}
