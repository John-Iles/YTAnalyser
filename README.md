# KirstCheen Explorer

A deployable web app that lets a non-technical colleague ask natural-language questions about a YouTube channel and get cited, grounded answers drawn from the channel's video transcripts — plus a deterministic browse/filter view of the keyword data.


## Architecture

```
┌─────────────────────────────────┐      ┌──────────────────────────────┐
│  GitHub Pages (static)          │─────▶│  Cloudflare Worker (proxy)   │
│  Vite + React + TypeScript      │ HTTPS│  Holds ANTHROPIC_API_KEY     │
│  + Tailwind + MiniSearch        │      │  Streams answers back        │
│  https://<user>.github.io/      │      │  CORS-locked to Pages origin │
│  YTAnalyser/                    │      └──────────────────────────────┘
└─────────────────────────────────┘
```

- **Frontend** — static assets built by Vite and deployed to GitHub Pages via GitHub Actions. The browser never sees any API key.
- **Worker** — a Cloudflare Worker that holds secrets, calls the Anthropic API, and streams the response back to the browser.
- **Corpus** — `scripts/build-corpus.ts` reads `keyword_report.json` + `report.json` from the repo root and emits `src/data/corpus.json` at build time.

## Repository layout

```
.
├── src/                    # Frontend source (React + TS)
│   ├── data/               # corpus.json lives here after build:corpus
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   └── build-corpus.ts     # Corpus build script (Phase 1)
├── worker/
│   ├── src/index.ts        # Cloudflare Worker
│   ├── wrangler.toml
│   └── package.json
├── .github/workflows/
│   └── deploy.yml          # Pages CI/CD
├── index.html
├── 404.html                # Hash-redirect fallback for Pages
├── vite.config.ts
└── package.json
```

## Prerequisites

- Node.js ≥ 20
- `npm` ≥ 10
- A [Cloudflare account](https://dash.cloudflare.com/) (free tier is fine)
- `wrangler` CLI: `npm i -g wrangler` then `wrangler login`
- An Anthropic API key

## Data files (required before first build)

Place these two files in the **repo root** before running `npm run build:corpus`:

| File | Description |
|---|---|
| `keyword_report.json` | ~132 video records with keyword presence/counts/quotes |
| `report.json` | ~51 richer video records with descriptions, tags, analysis |

They are gitignored — do not commit them.

## Local development

```bash
# Install frontend dependencies
npm install

# Build the corpus (requires keyword_report.json + report.json in root)
npm run build:corpus

# Start the frontend dev server (http://localhost:5173/YTAnalyser/)
npm run dev

# In a separate terminal — start the Worker locally
cd worker
npm install
npm run dev   # wrangler dev, default port 8787
```

Set `VITE_WORKER_URL=http://localhost:8787` in a `.env.local` file in the root so the frontend talks to your local Worker.

## Deploying the frontend (GitHub Pages)

1. In the repo on GitHub: **Settings → Pages → Source → GitHub Actions**.
2. Make sure `keyword_report.json` and `report.json` are present in the repo root **on the branch being deployed** (or add a build step to download them).
3. Push to `main` — the Actions workflow (`.github/workflows/deploy.yml`) will:
   - Install dependencies
   - Run `npm run build:corpus` to generate `src/data/corpus.json`
   - Run `npm run build` (Vite)
   - Deploy the `dist/` folder to Pages
4. The live URL will be: `https://john-iles.github.io/YTAnalyser/`

You can also trigger the workflow manually via **Actions → Deploy to GitHub Pages → Run workflow**.

## Deploying the Cloudflare Worker

```bash
cd worker
npm install

# Set secrets (one-time; stored in Cloudflare, never committed)
npx wrangler secret put ANTHROPIC_API_KEY   # paste key when prompted
npx wrangler secret put APP_ACCESS_CODE     # shared code your colleague enters

# Deploy
npx wrangler deploy
```

Wrangler will print the Worker URL (e.g. `https://ytanalyser-worker.<account>.workers.dev`). Copy it.

Then set `VITE_WORKER_URL=<your-worker-url>` as a **GitHub Actions secret** (repo Settings → Secrets → Actions) so the Pages build picks it up. The GitHub Actions workflow already passes it as an env var during `npm run build`.

## Environment variables & secrets

### Frontend (Vite)

| Variable | Where set | Description |
|---|---|---|
| `VITE_WORKER_URL` | GitHub Actions secret | Full URL of the deployed Cloudflare Worker |

For local dev, create `/.env.local` (gitignored):
```
VITE_WORKER_URL=http://localhost:8787
```

### Cloudflare Worker secrets

Set via `wrangler secret put` — **never committed to the repo**.

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `APP_ACCESS_CODE` | Shared access code your colleague enters to unlock the app |

### Worker `[vars]` (non-secret, in `wrangler.toml`)

| Var | Default | Description |
|---|---|---|
| `MODEL` | `claude-sonnet-4-6` | Anthropic model to use |
| `APP_ORIGIN` | `https://john-iles.github.io` | Allowed CORS origin |

## Swapping models

Edit `MODEL` in `worker/wrangler.toml`, then redeploy:

```toml
[vars]
MODEL = "claude-haiku-4-5-20251001"   # cheapest / fastest
# MODEL = "claude-sonnet-4-6"          # default — good balance
# MODEL = "claude-opus-4-8"            # most capable
```

Current model IDs: see [Anthropic model overview](https://docs.anthropic.com/en/docs/about-claude/models/overview).

## Setting the access code

Pick any passphrase and store it as a Worker secret:

```bash
cd worker
npx wrangler secret put APP_ACCESS_CODE
# Enter value: my-secret-phrase
```

Tell your colleague the phrase — they'll enter it once in the app to unlock the Ask view.

## Expected per-query cost

Using `claude-sonnet-4-6` with the default context cap (~6–8 k tokens in + ~1 k tokens out):

- Input: ~8 000 tokens × $3 / M ≈ **$0.024**
- Output: ~1 000 tokens × $15 / M ≈ **$0.015**
- **Total: ~$0.04 per query**

Switching to `claude-haiku-4-5` cuts this to roughly **$0.002 per query**.

Rate limiting in the Worker caps heavy use automatically (see Phase 4).

## Sharing with your colleague

1. Send them the Pages URL: `https://john-iles.github.io/YTAnalyser/`
2. Send them the `APP_ACCESS_CODE` separately (e.g. via a password manager share).
3. They open the URL, enter the code once, and can immediately use the Ask and Browse views.

No account, no install, no API key needed on their end.

## Build phases

| Phase | Status | Description |
|---|---|---|
| 0 — Scaffold | ✅ Done | Vite+React+TS+Tailwind, Pages workflow, Worker skeleton |
| 1 — Corpus | ⏳ Next | `build-corpus.ts` → `corpus.json` (130 videos, deduped, ISO dates) |
| 2 — Index + Browse | ⏳ | MiniSearch + sortable/filterable 130-video table |
| 3 — Worker + Ask | ⏳ | `/ask` streaming proxy + ask UI with citations |
| 4 — Hardening | ⏳ | Access gate, rate limiting, input caps, bundle secret grep |
| 5 — Handoff | ⏳ | Final README polish + clean deploy walkthrough |

## Accuracy notes

- **No timestamps** exist in the source data. The app never invents them. The YouTube video link is the finest reference available.
- ~29 videos have no caption text. The app flags these clearly and never implies transcript coverage for them.
- Answers are generated from auto-caption transcripts of public videos, may be imperfect, and should not be treated as verbatim quotes.
