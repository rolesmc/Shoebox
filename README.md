# UniVault

A 100% client-side, single-page web app for migrating Google Drive contents from one Google account to another (canonical case: school account → personal account before graduation).

Files transfer **directly between Google's drives** via the Drive `files/{id}/copy` endpoint — nothing streams through a server.

## Stack

- Vite 8 + React 19 (plain JS, no TypeScript)
- Plain CSS variables (no Tailwind)
- Google Identity Services (GIS) for dual-account OAuth
- IndexedDB (`idb`) for the file index, selection, queue, and folder map
- `localStorage` for tokens and resume cursor
- `canvas-confetti` for completion celebration (dynamic-imported)
- `react-window` for the virtualized file list

Bundle budget: **≤250 KB gzipped main chunk**, enforced at build time.

## Requirements

- Node `>=20.19 <21` or `>=22.12`
- A Google Cloud OAuth 2.0 Client ID (Web application)

## Local development

```bash
npm ci
echo 'VITE_GOOGLE_CLIENT_ID="YOUR-CLIENT-ID.apps.googleusercontent.com"' > .env.local
npm run dev          # http://localhost:5188
```

Without `VITE_GOOGLE_CLIENT_ID`, the app falls back to mock Drive data — useful for UI work without a Google Cloud Console setup.

Scripts:

- `npm run dev` — Vite dev server with dual-mode CSP
- `npm run build` — production build to `dist/`, runs bundle size guard + emits `dist/_headers`
- `npm run preview` — serve the built bundle
- `npm run lint` — ESLint flat config
- `npm run smoke:prod` — production smoke check (see `scripts/smoke-prod.mjs`)

## Cloudflare Pages deploy

1. **Create OAuth Client** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Application type: **Web application**
   - Authorized JavaScript origins: add your production URL (e.g. `https://univault.pages.dev`) and any preview/custom domains. Add `http://localhost:5188` for local dev.
   - No redirect URI needed — GIS token model uses a popup, not a redirect.
   - Scopes the app requests at runtime: `https://www.googleapis.com/auth/drive.readonly` (source) and `https://www.googleapis.com/auth/drive.file` (destination).

2. **Create Cloudflare Pages project**:
   - Connect this repo
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `VITE_GOOGLE_CLIENT_ID` = your client ID (set for both Production and Preview)
   - Compatibility: Node 22

3. **Verify** after first deploy:
   - DevTools → Network → response headers contain `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` (served from `dist/_headers`)
   - `<meta http-equiv="Content-Security-Policy">` is present in the HTML with strict production directives (no `unsafe-eval`, no inline scripts)
   - Main JS chunk is ≤250 KB gzipped

## Security model

- No backend. No server-side secrets.
- Two independent `initTokenClient` instances per account — no shared `state` discriminator.
- Tokens stored in `localStorage` with explicit `expiresAt`; pre-emptive re-auth banner at 50 minutes; 401 from any Drive call pauses the queue and surfaces a reconnect prompt.
- Strict CSP (`default-src 'none'`, `script-src 'self' https://accounts.google.com/gsi/client`, frames denied) is injected at build time and shipped both as a `<meta>` tag and via `dist/_headers` so Cloudflare Pages serves it as a real header.
- `prefers-reduced-motion` honored throughout.

## Project status

All implementation phases (0–9) are complete: scaffold, CSP + bundle budget, IndexedDB persistence, dual-OAuth, real scanner, FileExplorer + smart filters + preflight, folder mirror, copy pool + error classification, resume + wake lock, and polish (animation + confetti + completion summary). Phase 10 (production deploy + real-account smoke test) is the only remaining step and requires the steps above.

## License

Personal-use tool. No license granted for redistribution.
