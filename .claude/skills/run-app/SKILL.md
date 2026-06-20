---
name: run-app
description: Launch and drive the YTAnalyser app (Vite/React frontend + Cloudflare Worker) in this container. Use when asked to run, preview, screenshot, or visually verify the frontend, or to smoke-test the Worker's routes.
---

# Running the YTAnalyser app

Two halves: a static **frontend** (Vite + React + TS + Tailwind, served at the
`/YTAnalyser/` base path) and a **Cloudflare Worker** proxy under `worker/`.

## Frontend — build, serve, drive in a browser

The page is an SPA at the Pages subpath `/YTAnalyser/`. Build it, serve the
production bundle, then drive a headless Chromium against it and screenshot.

```bash
cd /home/user/YTAnalyser
npm install                              # first time only
npm run build:corpus 2>/dev/null || true # only if keyword_report.json+report.json present
npm run build                            # tsc -b && vite build  -> dist/
(npm run preview > /tmp/preview.log 2>&1 &)
timeout 30 bash -c 'until curl -sf http://localhost:4173/YTAnalyser/ >/dev/null; do sleep 1; done'
```

Stop with `pkill -f 'vite preview'` before relaunching (avoids `EADDRINUSE`).

### Driving the browser (the fiddly part)

There is **no `chromium-cli` and no working `playwright install`** in this
container — the chromium download is blocked by the network policy. But a
**pre-installed Playwright browser exists** at `/opt/pw-browsers`. Use
`playwright-core` at the version that matches that build (chromium-**1194** ↔
playwright **1.49.x**), installed outside the repo so it doesn't pollute
`package.json`:

```bash
( cd /tmp && npm init -y >/dev/null 2>&1 && npm i playwright-core@1.49.1 >/dev/null 2>&1 )
```

> If `/opt/pw-browsers` holds a different chromium build number, install the
> matching playwright-core (e.g. 1228 ↔ ~1.61). Mismatch = launch fails.

Driver script — note: `playwright-core` is CommonJS, so use a default import,
and pass the executable path + `--no-sandbox`:

```bash
cat > /tmp/drive.mjs <<'EOF'
import pkg from '/tmp/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: exec, args: ['--no-sandbox'] });
const p = await b.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await p.goto('http://localhost:4173/YTAnalyser/', { waitUntil: 'networkidle' });
await p.waitForSelector('h1');                 // wait-for the element you need
await p.screenshot({ path: '/tmp/app.png', fullPage: true });
console.log('H1:', JSON.stringify(await p.textContent('h1')));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await b.close();
EOF
node /tmp/drive.mjs
```

Then **look at `/tmp/app.png`** (Read tool) — a blank frame means it didn't
mount. Always check `CONSOLE ERRORS` before declaring success: the shell can
render while data fetches fail.

For later phases, add `await p.click(...)` / `await p.fill(...)` /
`await p.waitForSelector('text=...')` to drive Ask/Browse views, screenshotting
each step. Use `fill`/`type` (not `el.value=`) so React's onChange fires.

## Worker — run and smoke-test

```bash
cd /home/user/YTAnalyser/worker
npm install                              # first time only
(npx wrangler dev --port 8787 > /tmp/worker.log 2>&1 &)
timeout 40 bash -c 'until curl -sf http://localhost:8787/health >/dev/null 2>&1; do sleep 1; done'
curl -s http://localhost:8787/health                                   # -> {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8787/ask  # 501 until Phase 3
```

Stop with `pkill -f wrangler; pkill -f workerd`. The `worker/.wrangler/` cache
is gitignored.

## Gotchas that recur here

- **Base path**: the app is served under `/YTAnalyser/`, not `/`. Hitting `/`
  gives the 404 fallback. Always nav to the full subpath.
- **`playwright-core` is CommonJS** — `import { chromium }` fails; use
  `import pkg from ...; const { chromium } = pkg`.
- **Browser version must match `/opt/pw-browsers`** — don't `npx playwright
  install`, it's network-blocked. Point `executablePath` at the pre-installed one.
- **`--no-sandbox` is required** in this container or Chromium won't launch.
