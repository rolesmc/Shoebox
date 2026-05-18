#!/usr/bin/env node
// scripts/smoke-prod.mjs
//
// Production-bundle smoke harness for UniVault (GAP-1 regression guard).
//
// Pipeline:
//   1. cd to package root (univault/)
//   2. Run `npm run build`
//   3. Pick a free ephemeral port via node:net
//   4. Spawn `npx vite preview --port <port> --strictPort` in background
//   5. Wait for "Local:" stdout signal (timeout 30s)
//   6. Locate a system Chrome binary; if found, headless `--dump-dom` poll
//      (up to 10 attempts, 500ms backoff) to assert:
//        - <div id="root"> inner length > 200
//        - "loaded outside DEV" absent (fail-fast if present)
//        - "UniVault" present
//        - "glass-card" present (as class attribute)
//      Else fall back to a strict HTTP-only check that asserts dist/assets/*.js
//      does NOT contain "loaded outside DEV" / "throwIfArmed" and DOES contain
//      "UniVault".
//   7. Kill preview, exit 0 on pass / 1 on any failure.
//
// Constraints:
//   - Zero npm dependencies. Node 20+ builtins only (node:* prefixed imports).
//   - Single-file ESM module (.mjs).

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

const MAX_ATTEMPTS = 10;
const BACKOFF_MS = 500;
const PREVIEW_READY_TIMEOUT_MS = 30_000;
const PREVIEW_KILL_GRACE_MS = 2_000;

// --- helpers ------------------------------------------------------------

function pass(msg) { console.log(`PASS: ${msg}`); }
function fail(msg) { console.error(`FAIL: ${msg}`); }
function info(msg) { console.log(`INFO: ${msg}`); }
function warn(msg) { console.warn(`WARN: ${msg}`); }

async function pickFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function locateChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const macCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const p of macCandidates) {
    if (existsSync(p)) return p;
  }
  const which = (name) => {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    return null;
  };
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const hit = which(name);
    if (hit) return hit;
  }
  return null;
}

function extractRootBlock(html) {
  // Locate <div id="root"> ... </div>. The Chrome --dump-dom output is a
  // serialized DOM tree, so the closing </div> we want is the one that
  // balances the opening tag. We walk attribute-aware: count opening <div
  // and closing </div> from the first id="root" occurrence.
  const startIdx = html.search(/<div[^>]*id="root"[^>]*>/);
  if (startIdx === -1) return null;
  const openTagMatch = html.slice(startIdx).match(/<div[^>]*id="root"[^>]*>/);
  const tagEnd = startIdx + openTagMatch[0].length;

  let depth = 1;
  let i = tagEnd;
  const openRe = /<div\b/gi;
  const closeRe = /<\/div>/gi;
  // Scan char-by-char counting nested <div> ... </div> openings.
  while (i < html.length && depth > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) break;
    if (o && o.index < c.index) {
      depth += 1;
      i = o.index + 4; // length of "<div"
    } else {
      depth -= 1;
      i = c.index + 6; // length of "</div>"
    }
  }
  if (depth !== 0) return null;
  return { full: html.slice(startIdx, i), inner: html.slice(tagEnd, i - 6) };
}

async function dumpDomOnce(chromePath, url) {
  return new Promise((res) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--virtual-time-budget=2000',
      '--run-all-compositor-stages-before-draw',
      '--timeout=10000',
      '--dump-dom',
      url,
    ];
    const child = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => res({ code, stdout: out, stderr: err }));
    child.on('error', () => res({ code: -1, stdout: '', stderr: 'spawn-failed' }));
  });
}

// --- pipeline -----------------------------------------------------------

async function main() {
  process.chdir(PKG_ROOT);
  info(`cwd: ${process.cwd()}`);

  // Step 1: build
  info('Running `npm run build` …');
  const build = spawnSync('npm', ['run', 'build'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    fail('npm run build exited non-zero');
    process.stderr.write(build.stderr || '');
    process.stdout.write(build.stdout || '');
    process.exit(1);
  }
  pass('npm run build (exit 0)');

  // Step 2: locate chrome (used later; locate early so we can choose strategy)
  const chromePath = locateChrome();
  const chromeAvailable = Boolean(chromePath);
  if (chromeAvailable) info(`Chrome located: ${chromePath}`);
  else warn('No Chrome binary found — falling back to HTTP-only structural check (weaker).');

  // Step 3: pick a free port
  const port = await pickFreePort();
  info(`Ephemeral port: ${port}`);

  // Step 4: spawn vite preview
  info(`Spawning vite preview on port ${port} …`);
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: false },
  );
  let previewOut = '';
  let previewErr = '';
  preview.stdout.on('data', (d) => { previewOut += d.toString(); });
  preview.stderr.on('data', (d) => { previewErr += d.toString(); });

  const killPreview = () => {
    if (!preview.killed) {
      try { preview.kill('SIGTERM'); } catch { /* noop */ }
      // SIGKILL fallback after grace
      setTimeout(() => { try { preview.kill('SIGKILL'); } catch { /* noop */ } }, PREVIEW_KILL_GRACE_MS).unref?.();
    }
  };

  try {
    // Wait for "Local:" signal (or timeout)
    const startedAt = Date.now();
    while (!previewOut.includes('Local:')) {
      if (Date.now() - startedAt > PREVIEW_READY_TIMEOUT_MS) {
        fail(`vite preview did not emit "Local:" within ${PREVIEW_READY_TIMEOUT_MS / 1000}s`);
        process.stderr.write(previewErr);
        process.stdout.write(previewOut);
        process.exit(1);
      }
      if (preview.exitCode !== null) {
        fail(`vite preview exited prematurely with code ${preview.exitCode}`);
        process.stderr.write(previewErr);
        process.stdout.write(previewOut);
        process.exit(1);
      }
      await sleep(100);
    }
    pass('vite preview ready');

    const url = `http://127.0.0.1:${port}/`;

    if (chromeAvailable) {
      // Step 5a: headless Chrome polling
      info(`Headless Chrome polling (up to ${MAX_ATTEMPTS} attempts, ${BACKOFF_MS}ms backoff) …`);
      let passingDom = null;
      let lastInnerLen = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const { code, stdout } = await dumpDomOnce(chromePath, url);
        if (code !== 0) {
          info(`  attempt ${attempt}: chrome exit ${code} (will retry)`);
          await sleep(BACKOFF_MS);
          continue;
        }
        // Fail-fast on the GAP-1 fingerprint.
        if (/loaded outside DEV/i.test(stdout)) {
          fail(`prod bundle contains "loaded outside DEV" at offset ${stdout.search(/loaded outside DEV/i)} — Plan 06 regression`);
          process.exit(1);
        }
        const rootBlock = extractRootBlock(stdout);
        const innerLen = rootBlock ? rootBlock.inner.length : 0;
        lastInnerLen = innerLen;
        if (innerLen > 200) {
          passingDom = stdout;
          info(`  attempt ${attempt}: root inner length=${innerLen} → PASS`);
          break;
        }
        info(`  attempt ${attempt}: root inner length=${innerLen} (need > 200), retrying after ${BACKOFF_MS}ms`);
        await sleep(BACKOFF_MS);
      }
      if (!passingDom) {
        fail(`root never rendered after ${MAX_ATTEMPTS} attempts (~${(MAX_ATTEMPTS * BACKOFF_MS) / 1000}s wall clock). Last inner length: ${lastInnerLen}. Possible mount regression or compile error.`);
        process.exit(1);
      }
      pass('react tree mounted (root innerHTML > 200 chars)');

      // Structural greps on the passing DOM.
      if (/Uncaught Error/i.test(passingDom)) {
        fail('DOM contains "Uncaught Error" — likely error-boundary fallback rendered');
        process.exit(1);
      }
      pass('no "Uncaught Error" in DOM');

      if (!passingDom.includes('UniVault')) {
        fail('DOM does NOT contain "UniVault" — App header missing');
        process.exit(1);
      }
      pass('"UniVault" present in DOM');

      if (!/class="[^"]*glass-card[^"]*"/.test(passingDom)) {
        fail('DOM does NOT contain a `glass-card` class — design system CSS classes not mounted');
        process.exit(1);
      }
      pass('"glass-card" class present in DOM');

      console.log('\nSMOKE PASS: prod bundle renders in Chrome mode.');
    } else {
      // Step 5b: HTTP-only fallback
      warn('Using HTTP-only fallback — cannot detect runtime exceptions, only structural correctness.');
      const indexHtml = await (await fetch(url)).text();
      const htmlStatus = (await fetch(url)).status;
      if (htmlStatus !== 200) {
        fail(`HTTP ${htmlStatus} on ${url}`);
        process.exit(1);
      }
      pass('GET / → 200');

      if (!/<div\s+id="root">\s*<\/div>|<div\s+id="root">\s*<\/div>/.test(indexHtml) && !indexHtml.includes('id="root"')) {
        fail('index.html missing <div id="root">');
        process.exit(1);
      }
      pass('index.html contains <div id="root">');

      const assetMatch = indexHtml.match(/<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/);
      if (!assetMatch) {
        fail('index.html missing reference to assets/index-*.js');
        process.exit(1);
      }
      pass(`index.html references ${assetMatch[1]}`);

      // Load the bundle from disk for stronger structural assertions.
      const distAssetsDir = join(PKG_ROOT, 'dist', 'assets');
      const jsFiles = readdirSync(distAssetsDir).filter((f) => /^index-.*\.js$/.test(f));
      if (jsFiles.length === 0) {
        fail('dist/assets/ contains no index-*.js bundle');
        process.exit(1);
      }
      const bundle = readFileSync(join(distAssetsDir, jsFiles[0]), 'utf8');

      const badNeedles = ['loaded outside DEV', 'throwIfArmed'];
      for (const n of badNeedles) {
        if (bundle.includes(n)) {
          fail(`prod bundle contains forbidden marker "${n}" at offset ${bundle.indexOf(n)} in ${jsFiles[0]}`);
          process.exit(1);
        }
      }
      pass('prod bundle clean of "loaded outside DEV" + "throwIfArmed"');

      if (!bundle.includes('UniVault')) {
        fail('prod bundle does NOT contain literal "UniVault"');
        process.exit(1);
      }
      pass('prod bundle contains "UniVault"');

      console.log('\nSMOKE PASS: prod bundle structural checks (HTTP-only mode).');
    }
  } finally {
    killPreview();
    // Give the child a brief moment to release the port before exit.
    await sleep(150);
  }
}

main().catch((err) => {
  fail(`unhandled exception: ${err && err.stack ? err.stack : String(err)}`);
  process.exit(1);
});
