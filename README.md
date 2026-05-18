# UniVault

100% client-side Vite + React SPA for selectively migrating Google Drive
contents from one Google account to another. See repository root
`CLAUDE.md` for product framing and stack rationale.

## Setup

```bash
cd univault
npm install
npm run dev
```

Requires Node 20.19+ or 22.12+ (enforced via `engines`).

## Verifying a release candidate

Before declaring a build deployable, run:

```bash
npm run smoke:prod
```

This script:

1. Runs `npm run build`.
2. Serves `dist/` via `vite preview` on an ephemeral port.
3. Loads the served URL in headless Chrome (falls back to a strict
   HTTP-level check if Chrome is not on PATH; the fallback prints a
   warning because it cannot detect runtime exceptions).
4. Asserts the React tree mounted (`#root` non-empty), the string
   `loaded outside DEV` is absent from the bundle, and the strings
   `UniVault` + `glass-card` are present.
5. Exits non-zero on any failure.

This catches the Phase 0 regression class where `npm run build`
exits 0 but the bundle throws on module load and renders a blank
page (see `.planning/phases/00-skeleton-mock-api/00-VERIFICATION.md`).

To force a specific Chrome binary:

```bash
CHROME_PATH=/path/to/chrome npm run smoke:prod
```

## Manual UX checks (Phase 0 acceptance)

After `npm run dev`, open `http://localhost:5188` and verify:

1. **Glassmorphism visual fidelity**: dark background `#060608`,
   glass cards visibly blurred with subtle borders, Inter font on
   body text, JetBrains Mono on tabular numbers, emerald/purple
   accents on action elements.
2. **DevPanel state cycling**: cycle each toggle row (Auth × 5,
   Scan × 4, Queue × 6, Gauge × 4, Resume × 2, Failure × 6,
   Dataset × 4). Each toggle should update the corresponding
   component without console errors.
3. **10k-row FileExplorer scroll smoothness**: click `Dataset →
10,000 rows` in the DevPanel. Scroll the FileExplorer with the
   mouse wheel from top to bottom while Chrome DevTools →
   Performance is recording (5-second capture). Acceptance:
   - Scroll feels smooth (no perceptible jank).
   - Performance flame-graph shows no frames longer than ~50ms.
   - DOM inspection of the row container shows ~15-25
     `<div role="row">` (or `<label>`) row elements, NOT 10,000.
