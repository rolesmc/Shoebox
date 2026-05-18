// src/mocks/mockData.js
// DEV-only by convention — enforced by callers using DEV-gated dynamic imports.
import { faker } from "@faker-js/faker";

// Deterministic seed so the dataset is identical across reloads (debuggability).
faker.seed(20260518);

// ============================================================
// MIME type constants
// ============================================================
const MIME = {
  DOC: "application/vnd.google-apps.document",
  SHEET: "application/vnd.google-apps.spreadsheet",
  SLIDE: "application/vnd.google-apps.presentation",
  FOLDER: "application/vnd.google-apps.folder",
  FORM: "application/vnd.google-apps.form",
  SITE: "application/vnd.google-apps.site",
  JAM: "application/vnd.google-apps.jam",
  SHORTCUT: "application/vnd.google-apps.shortcut",
  DRIVE_SDK: "application/vnd.google-apps.drive-sdk",
  PDF: "application/pdf",
  PNG: "image/png",
  ZIP: "application/zip",
  MP4: "video/mp4",
};

// ============================================================
// Owner constants
// ============================================================
const ME_OWNER = {
  displayName: "Student",
  emailAddress: "student@school.edu",
  me: true,
};
const OTHER_OWN = {
  displayName: "Advisor",
  emailAddress: "advisor@school.edu",
  me: false,
};

// ============================================================
// Capabilities constants
// ============================================================
const CAPS_FULL = { canCopy: true, canDownload: true, canEdit: true };
const CAPS_NOCP = { canCopy: false, canDownload: true, canEdit: true };

// ============================================================
// File factory — D-05: all 12 fields ALWAYS present, never optional
// ============================================================
function file(overrides) {
  return {
    id: faker.string.alphanumeric(28),
    name: "Untitled",
    mimeType: MIME.DOC,
    size: "0", // string per Drive API convention
    starred: false,
    parents: ["root"],
    modifiedTime: faker.date.recent({ days: 365 }).toISOString(),
    owners: [ME_OWNER],
    ownedByMe: true,
    shared: false,
    capabilities: CAPS_FULL,
    trashed: false,
    ...overrides,
  };
}

// ============================================================
// Folder hierarchy — D-04: ≥3 levels nested + empty folders
// ============================================================
const folders = [
  file({
    id: "fld_root",
    name: "My Drive",
    mimeType: MIME.FOLDER,
    parents: [],
  }),
  file({
    id: "fld_thesis",
    name: "Thesis",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }),
  file({
    id: "fld_thesis_ch1",
    name: "Chapter 1",
    mimeType: MIME.FOLDER,
    parents: ["fld_thesis"],
  }),
  file({
    id: "fld_thesis_ch1_d",
    name: "Drafts",
    mimeType: MIME.FOLDER,
    parents: ["fld_thesis_ch1"],
  }), // depth 4
  file({
    id: "fld_resume",
    name: "Resume",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }),
  file({
    id: "fld_project",
    name: "Project Final",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }),
  file({
    id: "fld_final",
    name: "Final Submissions",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }),
  file({
    id: "fld_misc",
    name: "Misc",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }),
  file({
    id: "fld_empty",
    name: "Empty Folder",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }), // EMPTY (SCAN-03)
  file({
    id: "fld_empty2",
    name: "Old Coursework (empty)",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
  }), // EMPTY
  file({
    id: "fld_shared_drive",
    name: "Lab Shared Drive",
    mimeType: MIME.FOLDER,
    parents: ["fld_root"],
    shared: true,
    owners: [OTHER_OWN],
    ownedByMe: false,
  }),
];

// ============================================================
// Curated edge cases — D-04: every enumerated case must be present
// ============================================================
const curated = [
  // === Clean Slate targets (FILT-03): Untitled, Draft, Copy of, <2KB binaries ===
  file({
    name: "Untitled document",
    mimeType: MIME.DOC,
    parents: ["fld_misc"],
  }),
  file({
    name: "Untitled spreadsheet",
    mimeType: MIME.SHEET,
    parents: ["fld_misc"],
  }),
  file({
    name: "Draft - Personal Statement",
    mimeType: MIME.DOC,
    parents: ["fld_misc"],
  }),
  file({ name: "Copy of Resume", mimeType: MIME.DOC, parents: ["fld_misc"] }),
  file({
    name: "tiny-icon.png",
    mimeType: MIME.PNG,
    size: "512",
    parents: ["fld_misc"],
  }), // <2KB
  file({
    name: "fragment.txt",
    mimeType: "text/plain",
    size: "900",
    parents: ["fld_misc"],
  }),

  // === All-Star Core targets (FILT-02): starred OR parent name matches Thesis/Resume/Project/Final ===
  file({
    name: "Thesis Final Draft.gdoc",
    mimeType: MIME.DOC,
    parents: ["fld_thesis"],
    starred: true,
  }),
  file({
    name: "Resume 2026.gdoc",
    mimeType: MIME.DOC,
    parents: ["fld_resume"],
    starred: true,
  }),
  file({
    name: "Project Proposal",
    mimeType: MIME.DOC,
    parents: ["fld_project"],
  }), // parent name match (no star)
  file({
    name: "Final Slide Deck",
    mimeType: MIME.SLIDE,
    parents: ["fld_final"],
  }),
  file({
    name: "Starred Notes",
    mimeType: MIME.DOC,
    parents: ["fld_misc"],
    starred: true,
  }),

  // === Academic Portfolio targets (FILT-01): owned Docs/Sheets/Slides, size:0 (Google-native) ===
  file({
    name: "Research Notes",
    mimeType: MIME.DOC,
    parents: ["fld_thesis_ch1"],
    size: "0",
  }),
  file({
    name: "Data Analysis",
    mimeType: MIME.SHEET,
    parents: ["fld_thesis_ch1"],
    size: "0",
  }),
  file({
    name: "Defense Presentation",
    mimeType: MIME.SLIDE,
    parents: ["fld_thesis"],
    size: "0",
  }),

  // === Unsupported MIME types (COPY-05 — must be filterable/skippable) ===
  file({ name: "Course Survey", mimeType: MIME.FORM, parents: ["fld_misc"] }),
  file({ name: "Lab Website", mimeType: MIME.SITE, parents: ["fld_misc"] }),
  file({
    name: "Whiteboard Session",
    mimeType: MIME.JAM,
    parents: ["fld_misc"],
  }),
  file({
    name: "Shortcut to Shared Doc",
    mimeType: MIME.SHORTCUT,
    parents: ["fld_misc"],
  }),
  file({
    name: "Diagram.drawio",
    mimeType: MIME.DRIVE_SDK,
    parents: ["fld_misc"],
    capabilities: CAPS_NOCP,
  }),

  // === Size extremes (Clean Slate + StorageGauge stress) ===
  file({
    name: "Defense Recording.mp4",
    mimeType: MIME.MP4,
    size: String(150 * 1024 * 1024),
    parents: ["fld_thesis"],
  }), // >100MB
  file({
    name: "Dataset Archive.zip",
    mimeType: MIME.ZIP,
    size: String(250 * 1024 * 1024),
    parents: ["fld_thesis_ch1"],
  }),
  file({
    name: "Course Reader.pdf",
    mimeType: MIME.PDF,
    size: String(40 * 1024 * 1024),
    parents: ["fld_project"],
  }),
  file({
    name: "Thesis Bibliography.pdf",
    mimeType: MIME.PDF,
    size: String(8 * 1024 * 1024),
    parents: ["fld_thesis"],
  }),

  // === Shared Drive items (SCAN-04 skip-banner targets) ===
  file({
    name: "Lab Protocol v3",
    mimeType: MIME.DOC,
    parents: ["fld_shared_drive"],
    shared: true,
    owners: [OTHER_OWN],
    ownedByMe: false,
  }),
  file({
    name: "Group Budget",
    mimeType: MIME.SHEET,
    parents: ["fld_shared_drive"],
    shared: true,
    owners: [OTHER_OWN],
    ownedByMe: false,
  }),
  file({
    name: "Shared Notes (collab)",
    mimeType: MIME.DOC,
    parents: ["fld_root"],
    shared: true,
    owners: [OTHER_OWN, ME_OWNER],
    ownedByMe: false,
  }),

  // === Nested-folder files (folder mirror topo-sort exercise) ===
  file({
    name: "Chapter 1 Draft v1",
    mimeType: MIME.DOC,
    parents: ["fld_thesis_ch1_d"],
  }), // depth 4
  file({
    name: "Chapter 1 Draft v2",
    mimeType: MIME.DOC,
    parents: ["fld_thesis_ch1_d"],
  }),
  file({
    name: "Chapter 1 Final",
    mimeType: MIME.DOC,
    parents: ["fld_thesis_ch1"],
  }),
];

// ============================================================
// Faker-pad to exactly 500 entries
// NOTE: 500 = files only. Folders are returned separately by listFolders() (D-08 contract).
// Counts split so callers can audit "files vs folders" without inferring from the API surface.
// ============================================================
const TARGET = 500;
const padCount = TARGET - curated.length; // calculate; folders are returned separately
const padFolderParents = [
  "fld_root",
  "fld_thesis",
  "fld_thesis_ch1",
  "fld_resume",
  "fld_project",
  "fld_final",
  "fld_misc",
];
const padMimes = [
  MIME.DOC,
  MIME.SHEET,
  MIME.SLIDE,
  MIME.PDF,
  MIME.PNG,
  MIME.ZIP,
  MIME.MP4,
];

const padding = Array.from({ length: padCount }, () => {
  const mime = faker.helpers.arrayElement(padMimes);
  const isGoogleNative = [MIME.DOC, MIME.SHEET, MIME.SLIDE].includes(mime);
  return file({
    name: `${faker.word.adjective()}-${faker.word.noun()}-${faker.number.int({ min: 1, max: 999 })}${isGoogleNative ? "" : "." + mime.split("/")[1]}`,
    mimeType: mime,
    size: isGoogleNative
      ? "0"
      : String(faker.number.int({ min: 2000, max: 50 * 1024 * 1024 })),
    parents: [faker.helpers.arrayElement(padFolderParents)],
    starred: faker.datatype.boolean({ probability: 0.08 }), // ~8% starred
    modifiedTime: faker.date.past({ years: 3 }).toISOString(),
  });
});

const allFiles = [...curated, ...padding];

// ============================================================
// Exports
// ============================================================

// NOTE: 500 = files only. Folders are returned separately by getAllFolders().
export const FILES_DATASET_SIZE = allFiles.length; // 500
export const FOLDERS_DATASET_SIZE = folders.length; // ~11 (curated only; no faker pad)

export function getAllFiles() {
  return allFiles;
}
export function getAllFolders() {
  return folders;
}

// ============================================================
// Plan 05 stress test: pad dataset to 10,000 entries on demand (DevPanel toggle).
// ============================================================
let stressFiles = null;
export function getStressFiles(target = 10000) {
  if (stressFiles && stressFiles.length === target) return stressFiles;
  const extra = target - allFiles.length;
  stressFiles = [
    ...allFiles,
    ...Array.from({ length: extra }, (_, i) =>
      file({
        name: `stress-file-${i + 1}.txt`,
        size: String(faker.number.int({ min: 1000, max: 1024 * 1024 })),
        mimeType: "text/plain",
        parents: ["fld_root"],
      }),
    ),
  ];
  return stressFiles;
}
