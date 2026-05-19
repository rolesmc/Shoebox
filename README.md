# Shoebox

A 100% client-side, single-page web app for moving your Google Drive files from one Google account to another — the place you keep what matters and carry it to a new home.

Connect two Google accounts in the browser, filter your Drive down to what you actually want to keep (starred items, owned Docs/Sheets/Slides, named project folders — not "Untitled" cruft), and copy the selection into the destination account. Files transfer **directly between Google's drives** via the Drive `files/{id}/copy` endpoint — nothing ever streams through your device, and no file body touches a server we own.

## Who it's for

Anyone consolidating or moving Google Drive content between accounts:

- Switching from an old personal account to a new one
- Backing up files into a separate Google account before closing the original
- Cleaning up and carrying forward only the files worth keeping

### School / Workspace accounts (experimental)

The original use case was the graduating-student migration (school account → personal account before the school account is revoked). This still works in many cases, but **Google Workspace accounts managed by a school or organization frequently restrict third-party OAuth apps and the Drive copy API**, which can block the flow entirely depending on the admin's policy. Treat school/Workspace accounts as an **experimental** source until a more reliable path exists. Personal `@gmail.com` accounts on both ends are the fully supported configuration.

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

## License

Personal-use tool. No license granted for redistribution.

> Note: the GitHub repo and the `univault.pages.dev` URL still carry the old "univault" name — only the product/UI has been renamed to Shoebox. Renaming those is optional and separate (renaming the Pages project would require re-adding the new origin to the OAuth client's Authorized JavaScript origins).
