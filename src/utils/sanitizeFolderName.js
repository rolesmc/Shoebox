// univault/src/utils/sanitizeFolderName.js
// Folder name sanitization for Phase 6 mirror (MIRROR-02, MIRROR-03).
// Strips bidi-override + zero-width + control characters; caps length at 255.
// Rationale: RESEARCH §Pitfall 3 + §Focus 12 — prevents RTL-spoofing in destination
// folder names rendered later by the resume banner / completion summary. XSS is not
// the threat (React escapes text children + Phase 1 CSP); spoofing IS.

/**
 * sanitizeFolderName(name)
 * Returns a Drive-safe folder name with:
 *   - U+202A..U+202E (LRE/RLE/PDF/LRO/RLO) removed
 *   - U+2066..U+2069 (isolates LRI/RLI/FSI/PDI) removed
 *   - U+200B..U+200F (ZWSP/ZWNJ/ZWJ/LRM/RLM) removed
 *   - U+00AD (soft hyphen) removed
 *   - ASCII control chars U+0000..U+001F and U+007F removed
 *   - Leading/trailing whitespace trimmed
 *   - Truncated to 255 characters
 *   - Empty result coerced to "Untitled"
 * Preserves emoji, CJK, accents, punctuation.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function sanitizeFolderName(name) {
  if (!name) return "Untitled";
  const cleaned = String(name)
    // WR-04: explicit \u escapes — auditable in any editor/diff tool, robust
    // against Unicode normalization in copy-paste, and won't trip security
    // scanners on invisible source codepoints.
    //   U+202A..U+202E  LRE, RLE, PDF, LRO, RLO
    //   U+2066..U+2069  LRI, RLI, FSI, PDI
    //   U+200B..U+200F  ZWSP, ZWNJ, ZWJ, LRM, RLM
    //   U+00AD          soft hyphen
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u00AD]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 255);
  return cleaned || "Untitled";
}
