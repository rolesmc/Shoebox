import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { Buffer } from "node:buffer";

import { cloudflare } from "@cloudflare/vite-plugin";

// Custom Content Security Policy & Cloudflare headers plugin
function viteCspPlugin() {
  let isDev = false;
  let outDir = "dist";

  return {
    name: "vite-csp-plugin",
    configResolved(config) {
      isDev = config.command === "serve";
      outDir = config.build.outDir || "dist";
    },
    transformIndexHtml(html) {
      const devCsp = [
        "default-src 'none'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com/gsi/client",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' ws://localhost:* wss://localhost:* https://www.googleapis.com/ https://accounts.google.com/gsi/",
        "img-src 'self' data: https://lh3.googleusercontent.com/",
        "frame-src https://accounts.google.com/",
        "base-uri 'none'",
        "object-src 'none';",
      ].join("; ");

      const prodCsp = [
        "default-src 'none'",
        "script-src 'self' https://accounts.google.com/gsi/client",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://www.googleapis.com/ https://accounts.google.com/gsi/",
        "img-src 'self' data: https://lh3.googleusercontent.com/",
        "frame-src https://accounts.google.com/",
        "base-uri 'none'",
        "object-src 'none';",
      ].join("; ");

      const csp = isDev ? devCsp : prodCsp;
      const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

      // Inject meta tag directly at the top of <head>
      if (html.includes("<head>")) {
        return html.replace("<head>", `<head>\n    ${metaTag}`);
      }
      return html.replace("<html>", `<html>\n<head>\n    ${metaTag}\n</head>`);
    },
    closeBundle() {
      if (isDev) return;
      // Write Cloudflare Pages _headers file to the distribution folder
      const headersContent =
        [
          "/*",
          "  Content-Security-Policy: frame-ancestors 'none'",
          "  X-Frame-Options: DENY",
          "  X-Content-Type-Options: nosniff",
          "  Referrer-Policy: strict-origin-when-cross-origin",
        ].join("\n") + "\n";

      try {
        writeFileSync(join(outDir, "_headers"), headersContent, "utf8");
        console.log(
          "\n✓ Generated dist/_headers with strict frame protection.",
        );
      } catch (err) {
        console.error("Failed to write _headers file:", err);
      }
    },
  };
}

// Custom bundle size budget plugin
function viteBundleSizeGuardPlugin(maxGzipSizeKb = 250) {
  return {
    name: "vite-bundle-size-guard",
    writeBundle(options, bundle) {
      console.log("\n--- Bundle Size Budget Report ---");
      let exceeded = false;
      const limitBytes = maxGzipSizeKb * 1024;

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk" && chunk.type !== "asset") continue;

        const content = chunk.type === "chunk" ? chunk.code : chunk.source;
        if (!content) continue;

        const buffer =
          typeof content === "string" ? Buffer.from(content, "utf8") : content;
        const rawSize = buffer.length;
        const gzipped = zlib.gzipSync(buffer);
        const gzipSize = gzipped.length;

        const rawSizeKb = (rawSize / 1024).toFixed(2);
        const gzipSizeKb = (gzipSize / 1024).toFixed(2);

        console.log(
          `  ${fileName.padEnd(40)} │ Raw: ${rawSizeKb.padStart(8)} KB │ Gzip: ${gzipSizeKb.padStart(8)} KB`,
        );

        if (gzipSize > limitBytes) {
          console.error(
            `\x1b[31m[ERROR] Asset ${fileName} exceeds the gzipped size budget of ${maxGzipSizeKb} KB (Actual: ${gzipSizeKb} KB)\x1b[0m`,
          );
          exceeded = true;
        }
      }
      console.log("---------------------------------\n");

      if (exceeded) {
        throw new Error(`Bundle size limit exceeded! Build aborted.`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteCspPlugin(), viteBundleSizeGuardPlugin(250), cloudflare()],
  server: {
    port: 5188,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        dbtest: "db-test.html",
      },
    },
  },
});