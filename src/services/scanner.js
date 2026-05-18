// univault/src/services/scanner.js
// Recursive, paginated streaming Drive scanner writing direct to IndexedDB (SCAN-01, SCAN-02, SCAN-03, SCAN-04).

import { listFiles, listFolders } from "./googleApi.js";
import { FileStore } from "./db.js";

/**
 * Identifies if a file belongs to a Shared Drive (Team Drive)
 * @param {Object} file - Google Drive file metadata object
 * @returns {boolean} True if the item resides in a Shared Drive
 */
function isSharedDriveItem(file) {
  // Real Google Drive API indicators
  if (file.driveId || file.teamDriveId) return true;

  // Mock dataset indicators (SCAN-04 parent references or custom owners)
  if (file.parents && file.parents.includes("fld_shared_drive")) return true;

  return false;
}

/**
 * scanDrive({ token, onProgress, onPage })
 * Recursively scans My Drive, streaming pages into IndexedDB and counting skipped shared drive files.
 * @param {Object} options
 * @param {string} options.token - Google OAuth access token
 * @param {Function} options.onProgress - Callback(scannedCount, skippedCount) triggered per page
 * @param {Function} options.onPage - Callback(filesChunk) triggered per page
 * @returns {Promise<{ fileCount: number, skippedCount: number }>} Cumulative scan details
 */
export async function scanDrive({ token, onProgress, onPage } = {}) {
  // Clear any existing cached files in IndexedDB before initiating a new scan (PERS-01/02 cleanup)
  await FileStore.clear();

  let pageToken;
  let fileCount = 0;
  let skippedCount = 0;
  const processedFileIds = new Set();

  console.log("[Scanner] Initiating streaming Drive scan...");

  // 1. Fetch and stream all non-folder files (or folders mixed in standard lists)
  do {
    const result = await listFiles({
      pageToken,
      token,
      // Focus query: trashed = false (SCAN-01)
      q: "trashed = false",
    });

    if (result.files && result.files.length > 0) {
      const validFiles = [];

      for (const item of result.files) {
        if (isSharedDriveItem(item)) {
          skippedCount++;
        } else {
          // Avoid duplicate entries
          if (!processedFileIds.has(item.id)) {
            processedFileIds.add(item.id);
            validFiles.push(item);
          }
        }
      }

      fileCount += validFiles.length;

      // Stream the valid files chunk directly into IndexedDB files store (SCAN-02)
      if (validFiles.length > 0) {
        await FileStore.putFiles(validFiles);
        if (onPage) onPage(validFiles);
      }
    }

    // Call progress callback
    if (onProgress) {
      onProgress(fileCount, skippedCount);
    }

    pageToken = result.nextPageToken;
  } while (pageToken);

  // 2. Separate query for ALL folders (including empty folders) to guarantee navigation skeleton (SCAN-03)
  console.log("[Scanner] Fetching empty and structural folders...");
  try {
    const folderResults = await listFolders({ token });
    if (folderResults.folders && folderResults.folders.length > 0) {
      const validFolders = [];
      for (const folder of folderResults.folders) {
        if (isSharedDriveItem(folder)) {
          // Folders can also reside in Shared Drives
          continue;
        }
        if (!processedFileIds.has(folder.id)) {
          processedFileIds.add(folder.id);
          validFolders.push(folder);
        }
      }

      if (validFolders.length > 0) {
        await FileStore.putFiles(validFolders);
        fileCount += validFolders.length;
        if (onPage) onPage(validFolders);
      }
    }
  } catch (err) {
    console.warn(
      "[Scanner] Separate folder tree fetch failed (non-fatal):",
      err,
    );
  }

  // Trigger final progress update
  if (onProgress) {
    onProgress(fileCount, skippedCount);
  }

  console.log(
    `[Scanner] Scan completed. Scanned: ${fileCount} files, Skipped: ${skippedCount} Shared Drive entries.`,
  );
  return { fileCount, skippedCount };
}
