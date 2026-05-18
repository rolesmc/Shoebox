#!/usr/bin/env node
// smoke-phase5.mjs
//
// Verification harness for Phase 5 (FileExplorer + Smart Filters + Pre-flight).
// Asserts correctness of isAcademic, isAllStar, isCleanSlate, and composed applyFilters logic.
//
// Constraints:
//   - Zero extra npm dependencies. Node 20+ builtins only.
//   - Single-file ESM module (.mjs).

import { isAcademic, isAllStar, isCleanSlate, applyFilters } from "./src/services/filters.js";

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`INFO: ${msg}`);
}

async function runTests() {
  info("Starting Phase 5 Smart Filter and Pre-flight Logic Verification...");

  // Mock Files Dataset
  const mockFiles = [
    // Academic candidate (Docs, Sheets, Slides owned by me)
    {
      id: "f1",
      name: "Thesis.docx",
      mimeType: "application/vnd.google-apps.document",
      ownedByMe: true,
      starred: false,
      size: "0",
      parents: ["folder1"],
    },
    // Non-academic document (not owned by me)
    {
      id: "f2",
      name: "Shared Lecture.docx",
      mimeType: "application/vnd.google-apps.document",
      ownedByMe: false,
      starred: true,
      size: "0",
      parents: ["folder1"],
    },
    // Binary file (not academic)
    {
      id: "f3",
      name: "Archive.zip",
      mimeType: "application/zip",
      ownedByMe: true,
      starred: false,
      size: "4096",
      parents: ["folder1"],
    },
    // All-Star by Starred
    {
      id: "f4",
      name: "Important Sheet.xlsx",
      mimeType: "application/vnd.google-apps.spreadsheet",
      ownedByMe: true,
      starred: true,
      size: "0",
      parents: ["folder2"],
    },
    // All-Star by Parent Folder name
    {
      id: "f5",
      name: "Project Presentation.pptx",
      mimeType: "application/vnd.google-apps.presentation",
      ownedByMe: true,
      starred: false,
      size: "0",
      parents: ["folder_project"],
    },
    // Clean Slate exclusions (Untitled)
    {
      id: "f6",
      name: "Untitled Document",
      mimeType: "application/vnd.google-apps.document",
      ownedByMe: true,
      starred: false,
      size: "0",
      parents: ["folder1"],
    },
    // Clean Slate exclusions (Binary < 2KB)
    {
      id: "f7",
      name: "small_icon.png",
      mimeType: "image/png",
      ownedByMe: true,
      starred: false,
      size: "1024", // 1KB
      parents: ["folder1"],
    },
  ];

  const mockFolders = [
    { id: "folder1", name: "General" },
    { id: "folder2", name: "Archive" },
    { id: "folder_project", name: "Final Project Submissions" },
  ];

  const foldersById = new Map(mockFolders.map((f) => [f.id, f]));

  // --- 1. Test isAcademic predicate ---
  info("Testing isAcademic predicate...");
  if (isAcademic(mockFiles[0]) !== true) fail("f1 (my doc) should be academic");
  if (isAcademic(mockFiles[1]) !== false) fail("f2 (not my doc) should not be academic");
  if (isAcademic(mockFiles[2]) !== false) fail("f3 (zip archive) should not be academic");
  pass("isAcademic predicate logic conforms to FILT-01 specifications.");

  // --- 2. Test isAllStar predicate ---
  info("Testing isAllStar predicate...");
  if (isAllStar(mockFiles[1], foldersById) !== true) fail("f2 (starred) should be all-star");
  if (isAllStar(mockFiles[3], foldersById) !== true) fail("f4 (starred) should be all-star");
  if (isAllStar(mockFiles[4], foldersById) !== true) fail("f5 (under Final Project Submissions folder) should be all-star");
  if (isAllStar(mockFiles[0], foldersById) !== false) fail("f1 (unstarred, general folder) should not be all-star");
  pass("isAllStar predicate logic conforms to FILT-02 specifications.");

  // --- 3. Test isCleanSlate predicate ---
  info("Testing isCleanSlate predicate...");
  if (isCleanSlate(mockFiles[0]) !== true) fail("f1 should pass clean slate");
  if (isCleanSlate(mockFiles[5]) !== false) fail("f6 (Untitled) should be excluded in clean slate");
  if (isCleanSlate(mockFiles[6]) !== false) fail("f7 (Binary < 2KB) should be excluded in clean slate");
  pass("isCleanSlate predicate logic conforms to FILT-03 specifications.");

  // --- 4. Test Compositional applyFilters ---
  info("Testing compositional applyFilters...");
  // Test academic filter active
  const academicOnly = applyFilters(mockFiles, { academic: true, allStar: false, cleanSlate: false }, mockFolders);
  if (academicOnly.length !== 4) {
    fail(`Academic only filtering failed. Returned IDs: ${academicOnly.map(f => f.id).join(", ")}`);
  }

  // Test both academic AND clean slate composing
  const academicAndClean = applyFilters(mockFiles, { academic: true, allStar: false, cleanSlate: true }, mockFolders);
  // f6 (Untitled) is excluded by cleanSlate. f1, f4, f5 remain.
  if (academicAndClean.length !== 3) {
    fail(`Composed academic and clean slate filtering failed. Expected 3, got: ${academicAndClean.length}`);
  }

  // Test both allStar AND clean slate composing
  const allStarAndClean = applyFilters(mockFiles, { academic: false, allStar: true, cleanSlate: true }, mockFolders);
  // f2 (starred, clean slate doc), f4 (starred, clean slate sheet), f5 (project, clean slate slide)
  if (allStarAndClean.length !== 3) {
    fail(`Composed all-star and clean slate filtering failed. Expected 3, got: ${allStarAndClean.length}`);
  }
  pass("Compositional applyFilters logic conforms to D24 / FILT-04 specifications.");

  console.log("\nALL TESTS PASSED: YES");
  pass("Phase 5 core predicate verification runs with 100% correctness.");
}

runTests().catch((e) => {
  fail(`Exception caught during test execution: ${e.message}`);
});
