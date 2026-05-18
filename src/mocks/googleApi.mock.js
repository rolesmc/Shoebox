// src/mocks/googleApi.mock.js
// DEV-ONLY mock that matches the Phase 4 utils/googleApi.js contract (D-08).
// When Phase 4 lands, consumers swap import path with no other changes.
// DEV-only by convention — enforced by callers using DEV-gated dynamic imports.

import { getAllFiles, getAllFolders } from './mockData.js';
import { throwIfArmed } from './failureInjection.js';

const PAGE_SIZE = 1000;

// 50–200ms randomized latency per call (D-07).
function latency() {
  const ms = 50 + Math.floor(Math.random() * 150);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pagination contract (D-06): pageSize=1000 with nextPageToken cycling even for 500-row sets.
 * We force ≥2 pages by splitting the dataset in half regardless of size, so streaming code
 * in Phase 4 can be developed today.
 */
function paginate(items, pageToken) {
  const half = Math.ceil(items.length / 2);
  if (!pageToken) {
    return { files: items.slice(0, half), nextPageToken: 'page-2' };
  }
  if (pageToken === 'page-2') {
    return { files: items.slice(half), nextPageToken: null };
  }
  // Defensive: unknown token → treat as final.
  return { files: [], nextPageToken: null };
}

/** D-08: listFiles({ pageToken, q }) — q is the Drive query string (ignored in Phase 0 mock except for trashed=false). */
export async function listFiles({ pageToken, q } = {}) {
  await latency();
  throwIfArmed();
  let items = getAllFiles().filter((f) => !f.trashed);
  // Trivial q-handling: when Phase 4 sends `mimeType='application/vnd.google-apps.folder'`, return only folders.
  if (q && q.includes("mimeType='application/vnd.google-apps.folder'")) {
    items = getAllFolders();
  }
  return paginate(items, pageToken);
}

/** D-08: listFolders() — convenience wrapper for SCAN-03 separate-query path. */
export async function listFolders() {
  await latency();
  throwIfArmed();
  return { folders: getAllFolders() };
}

/** D-08: copyFile({ fileId, parents, name, modifiedTime, starred }) — returns the new file shape. */
export async function copyFile({ fileId, parents, name, modifiedTime, starred }) {
  await latency();
  throwIfArmed();
  // Mock returns a plausible new ID; preserves the requested name/modifiedTime/starred.
  return {
    id: `copy_${fileId}_${Date.now()}`,
    name,
    parents,
    modifiedTime,
    starred: Boolean(starred),
  };
}

/** D-08: createFolder({ name, parents }) — returns the new folder shape. */
export async function createFolder({ name, parents }) {
  await latency();
  throwIfArmed();
  return {
    id: `fld_new_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    name,
    parents,
    mimeType: 'application/vnd.google-apps.folder',
  };
}

/** D-08: getAbout() — returns storageQuota matching Drive's About endpoint shape. */
export async function getAbout() {
  await latency();
  throwIfArmed();
  // Numbers chosen so StorageGauge can demo every state via DevPanel toggling the dataset.
  return {
    storageQuota: {
      limit:        String(100 * 1024 * 1024 * 1024),  // 100 GB
      usage:        String(42  * 1024 * 1024 * 1024),  // 42 GB used
      usageInDrive: String(38  * 1024 * 1024 * 1024),  // 38 GB in Drive
    },
  };
}
