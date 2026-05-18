#!/usr/bin/env node
// scripts/smoke-db.mjs
//
// EPHEMERAL BROWSER-LEVEL INTEGRATION SMOKE HARNESS FOR INDEXEDDB PERSISTENCE LAYER.
// Uses a native Node.js HTTP server to serve the static dist/ bundles and receive
// a POST callback containing the complete asynchronous browser assertions.
//
// Constraints:
//   - Zero extra npm dependencies. Node 20+ builtins only.
//   - Single-file ESM module (.mjs).

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, "..");

const TEST_TIMEOUT_MS = 10_000;

function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  console.error(`FAIL: ${msg}`);
}
function info(msg) {
  console.log(`INFO: ${msg}`);
}

async function pickFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function locateChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const macCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const p of macCandidates) {
    if (fs.existsSync(p)) return p;
  }
  const which = (name) => {
    const r = spawnSync("which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    return null;
  };
  for (const name of [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ]) {
    const hit = which(name);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  process.chdir(PKG_ROOT);
  info(`Testing Persistence Layer in workspace: ${process.cwd()}`);

  const chromePath = locateChrome();
  if (!chromePath) {
    fail(
      "No system Chrome or Chromium binary located. Headless browser testing aborted.",
    );
    process.exit(1);
  }
  pass(`Chrome located successfully: ${chromePath}`);

  // Step 1: Run production build
  info("Running `npm run build` …");
  const build = spawnSync("npm", ["run", "build"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (build.status !== 0) {
    fail("npm run build exited non-zero");
    process.stderr.write(build.stderr || "");
    process.stdout.write(build.stdout || "");
    process.exit(1);
  }
  pass("npm run build succeeded (exit 0)");

  // Step 2: Pick ephemeral port
  const port = await pickFreePort();
  info(`Selected ephemeral port: ${port}`);

  // Step 3: Start Node HTTP server to serve static dist/ and receive test callbacks
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };

  let chromeProcess = null;
  let testResolve = null;
  let testTimeout = null;

  const testPromise = new Promise((resolve) => {
    testResolve = resolve;
  });

  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/test-results") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        });
        res.end("ok");
        try {
          const payload = JSON.parse(body);
          testResolve(payload);
        } catch (e) {
          testResolve({
            passed: false,
            results: `Invalid JSON payload from browser: ${e.message}`,
          });
        }
      });
      return;
    }

    const safeUrl = req.url.split("?")[0];
    const filePath = path.join(
      PKG_ROOT,
      "dist",
      safeUrl === "/" ? "index.html" : safeUrl,
    );

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    info(`Internal static server listening on http://127.0.0.1:${port}`);

    // Spawn Chrome Headlessly (Real Time, no --dump-dom, no virtual-time budget)
    const testUrl = `http://127.0.0.1:${port}/db-test.html`;
    info(`Spawning Headless Chrome targeting: ${testUrl}`);

    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      testUrl,
    ];
    chromeProcess = spawn(chromePath, args);

    // Set a global timeout safeguard
    testTimeout = setTimeout(() => {
      testResolve({
        passed: false,
        results: `FAIL: Database test suite timed out after ${TEST_TIMEOUT_MS / 1000}s without posting results.`,
      });
    }, TEST_TIMEOUT_MS);
  });

  // Await the callback from the browser
  const data = await testPromise;

  // Cleanup
  clearTimeout(testTimeout);
  if (chromeProcess) {
    try {
      chromeProcess.kill("SIGKILL");
    } catch {}
  }
  server.close();

  console.log("\n--- BROWSER RUNNER LOGS ---");
  console.log(data.results);
  console.log("---------------------------\n");

  if (data.passed && data.results.includes("ALL TESTS PASSED: YES")) {
    pass("Database Persistence Layer Invariant checks successfully verified.");
    console.log("\nSMOKE PASS: Persistence Layer checks pass successfully!");
    process.exit(0);
  } else {
    fail("Database Persistence Layer Invariant checks returned failures.");
    process.exit(1);
  }
}

main().catch((e) => {
  fail(`Unhandled execution exception: ${e && e.stack ? e.stack : String(e)}`);
  process.exit(1);
});
