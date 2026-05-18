// univault/src/services/googleApi.js
// Production REST client for Google Drive v3 API with dynamic fallback to developer mocks (D16, D22).

import { TokenStorage } from "./storage.js";

// Helper to get source or destination token from storage if not provided
function getActiveToken(token, type = "source") {
  if (token) return token;
  const credentials = TokenStorage.getCredentials();
  return type === "source" ? credentials.sourceToken : credentials.destToken;
}

// Check if we should fall back to mock
function isMockActive() {
  return !import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

/**
 * listFiles({ pageToken, q, token })
 * Fetches paginated list of files from source Google Drive.
 */
export async function listFiles({ pageToken, q, token } = {}) {
  if (isMockActive()) {
    const mock = await import("../mocks/googleApi.mock.js");
    return mock.listFiles({ pageToken, q });
  }

  const activeToken = getActiveToken(token, "source");
  if (!activeToken) {
    throw new Error("Authentication required: No source token found.");
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set(
    "fields",
    "nextPageToken, files(id, name, mimeType, size, starred, parents, modifiedTime, owners, ownedByMe, shared, capabilities)",
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");

  // Base query: trashed = false (SCAN-01)
  let queryStr = "trashed = false";
  if (q) {
    queryStr = `${queryStr} and (${q})`;
  }
  url.searchParams.set("q", queryStr);

  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${activeToken}`,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(
      errData.error?.message || `Drive API error: ${response.status}`,
    );
    err.status = response.status;
    // CR-01: only default to "authError" on actual 401 — otherwise leave undefined so
    // transient 5xx/network errors are not misclassified as auth failures by retry/auth handlers.
    err.reason = errData.error?.errors?.[0]?.reason
      || (response.status === 401 ? "authError" : undefined);
    throw err;
  }

  return response.json();
}

/**
 * listFolders({ token })
 * Convenience wrapper returning all non-trashed folders to reconstruct the full folder tree (SCAN-03).
 */
export async function listFolders({ token } = {}) {
  if (isMockActive()) {
    const mock = await import("../mocks/googleApi.mock.js");
    return mock.listFolders();
  }

  // Folders are collected page-by-page by filtering for the folder mimeType
  const folders = [];
  let pageToken;
  do {
    const result = await listFiles({
      pageToken,
      q: "mimeType = 'application/vnd.google-apps.folder'",
      token,
    });
    if (result.files) {
      folders.push(...result.files);
    }
    pageToken = result.nextPageToken;
  } while (pageToken);

  return { folders };
}

/**
 * copyFile({ fileId, parents, name, modifiedTime, starred, token })
 * Copies a file to the destination Google Drive (restricted to drive.file scope).
 */
export async function copyFile({
  fileId,
  parents,
  name,
  modifiedTime,
  starred,
  token,
} = {}) {
  if (isMockActive()) {
    const mock = await import("../mocks/googleApi.mock.js");
    return mock.copyFile({ fileId, parents, name, modifiedTime, starred });
  }

  const activeToken = getActiveToken(token, "dest");
  if (!activeToken) {
    throw new Error("Authentication required: No destination token found.");
  }

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${fileId}/copy`,
  );
  url.searchParams.set("supportsAllDrives", "true");

  const body = {
    name,
  };
  if (parents) body.parents = parents;
  if (modifiedTime) body.modifiedTime = modifiedTime;
  if (starred !== undefined) body.starred = Boolean(starred);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${activeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(
      errData.error?.message || `Drive API error: ${response.status}`,
    );
    err.status = response.status;
    // CR-01: only default to "authError" on actual 401 — otherwise leave undefined so
    // transient 5xx/network errors are not misclassified as auth failures by retry/auth handlers.
    err.reason = errData.error?.errors?.[0]?.reason
      || (response.status === 401 ? "authError" : undefined);
    throw err;
  }

  return response.json();
}

/**
 * createFolder({ name, parents, token })
 * Creates a folder in the destination Google Drive.
 */
export async function createFolder({ name, parents, token } = {}) {
  if (isMockActive()) {
    const mock = await import("../mocks/googleApi.mock.js");
    return mock.createFolder({ name, parents });
  }

  const activeToken = getActiveToken(token, "dest");
  if (!activeToken) {
    throw new Error("Authentication required: No destination token found.");
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("supportsAllDrives", "true");

  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parents) body.parents = parents;

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${activeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(
      errData.error?.message || `Drive API error: ${response.status}`,
    );
    err.status = response.status;
    // CR-01: only default to "authError" on actual 401 — otherwise leave undefined so
    // transient 5xx/network errors are not misclassified as auth failures by retry/auth handlers.
    err.reason = errData.error?.errors?.[0]?.reason
      || (response.status === 401 ? "authError" : undefined);
    throw err;
  }

  return response.json();
}

/**
 * getAbout({ token })
 * Queries destination account details to extract storage limits.
 */
export async function getAbout({ token } = {}) {
  if (isMockActive()) {
    const mock = await import("../mocks/googleApi.mock.js");
    return mock.getAbout();
  }

  const activeToken = getActiveToken(token, "dest");
  if (!activeToken) {
    throw new Error("Authentication required: No destination token found.");
  }

  const url = new URL("https://www.googleapis.com/drive/v3/about");
  url.searchParams.set("fields", "storageQuota");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${activeToken}`,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const err = new Error(
      errData.error?.message || `Drive API error: ${response.status}`,
    );
    err.status = response.status;
    // CR-01: only default to "authError" on actual 401 — otherwise leave undefined so
    // transient 5xx/network errors are not misclassified as auth failures by retry/auth handlers.
    err.reason = errData.error?.errors?.[0]?.reason
      || (response.status === 401 ? "authError" : undefined);
    throw err;
  }

  return response.json();
}
