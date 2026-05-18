/**
 * Filters predicates for UniVault Smart Filters.
 */

export function isAcademic(f) {
  // FILT-01: Google Docs, Sheets, Slides owned by me
  return (
    f.ownedByMe &&
    [
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
      "application/vnd.google-apps.presentation",
    ].includes(f.mimeType)
  );
}

export function isAllStar(f, foldersById) {
  // FILT-02: starred OR parent folder matches Thesis|Resume|Project|Final (case-insensitive)
  if (f.starred) return true;
  const parentId = f.parents?.[0];
  const parent = foldersById.get(parentId);
  const pat = /thesis|resume|project|final/i;
  return parent && pat.test(parent.name);
}

export function isCleanSlate(f) {
  // FILT-03: exclude Untitled/Draft/Copy of, AND exclude binaries <2KB
  const pat = /^(Untitled|Draft|Copy of)/i;
  if (pat.test(f.name)) return false;
  const isBinary = !f.mimeType.startsWith("application/vnd.google-apps.");
  if (isBinary && Number(f.size || 0) < 2048) return false;
  return true;
}

export function applyFilters(files, activeFilters, folders) {
  const foldersById = new Map(folders.map((f) => [f.id, f]));
  return files.filter((f) => {
    if (activeFilters.academic && !isAcademic(f)) return false;
    if (activeFilters.allStar && !isAllStar(f, foldersById)) return false;
    if (activeFilters.cleanSlate && !isCleanSlate(f)) return false;
    return true;
  });
}
