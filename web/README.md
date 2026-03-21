# Spread Madness — Web POC

React + Vite bracket viewer for the March Madness ATS pool. Uses static JSON under `public/data/`.

## Prerequisites

- **Node.js 18+** (includes `npm`). If you see `command not found: npm`, install from [nodejs.org](https://nodejs.org) (LTS) or run `brew install node`.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Auth

- **Mock login:** pick any of the 8 league users → full bracket.
- **Google:** create `web/.env`:

  ```env
  VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  ```

  Add authorized JavaScript origins (e.g. `http://localhost:5173`). `main.tsx` wraps the app in `GoogleOAuthProvider` when this is set.

## Data

| File | Purpose |
|------|---------|
| `games_2026_march_madness.json` | Bracket template: games, `feeds_into`, `source_game_id` (tips/spreads may be null for later rounds) |
| `game_schedule_and_lines.json` | Optional overrides: `scheduled_tip_utc`, `favorite_team_id`, `spread` per `game_id` (see `../scripts/README.md`) |
| `teams_2026_march_madness.json` | Teams |
| `users_2026_march_madness.json` | Display names |
| `ownership_round1.json` | `{ user_id, team_id }[]` |
| `results.json` | Per-game state: `{ "GAME_ID": { "status", "clock", "scores" } }` (legacy flat scores still load) |

After editing JSON in the repo root, copy into `public/data/` (or symlink) so the dev server picks it up.

## Scores

- **ESPN poll (interim):** `node ../scripts/fetch-espn-results.mjs --dates auto` — updates `results.json`. **`node ../scripts/fetch-espn-spreads.mjs --dates auto`** — fills `scheduled_tip_utc` (from ESPN when missing in data), plus favorite + spread into `game_schedule_and_lines.json` when both teams are set. Combined loop: `../scripts/poll-espn-all.sh`. Reload the app to see changes.
- **Import / commissioner:** `node ../scripts/import-results.mjs` — see `../scripts/README.md`. Commissioner index: `../scripts/games_results_index.csv` (regenerate with `--write-index`). **Reset:** `node ../scripts/reset-results.mjs`.

## Build

```bash
npm run build
npm run preview   # serve production build
```

## Vercel (live scores without redeploy)

Deployment uses the **repo root** (`spreadMadness/`) so Vercel can run `api/` serverless routes and ship `scripts/` for ESPN merges. See [`vercel.json`](../vercel.json).

### What you do in Vercel

1. **Import the project** with **Root Directory** = repository root (folder that contains `vercel.json`, `web/`, `scripts/`, `api/`).
2. **Storage → Blob** — create a store and link it. Vercel injects **`BLOB_READ_WRITE_TOKEN`** into the project (or add it manually from the Blob store). Use a **Public** store: the server SDK’s `put()` requires public blobs, and clients still load data only via **`/api/live/data`** (blob URLs are not baked into the Vite app).
3. **Environment variables** (Production, and Preview if you want):

   | Variable | Purpose |
   |----------|---------|
   | `BLOB_READ_WRITE_TOKEN` | Read/write live JSON in Blob (usually auto from linked store). If you only have a custom name, **`SPREAD_MADNESS_READ_WRITE_TOKEN`** is also accepted (same token value). |
   | `CRON_SECRET` | Long random string. Secures `/api/cron/update`; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. |
   | `SITE_URL` | Canonical public URL, e.g. `https://your-app.vercel.app` (used to fetch `/data/*.json` during cron). Recommended so cron always hits the right host. |
   | `VITE_LIVE_POLL=1` | **Build-time** — enables the app to poll **`/api/live/data`** every ~90s (override interval with `VITE_LIVE_POLL_MS` in ms). Redeploy after changing. |
   | `ESPN_DATES` | Optional. Default `auto` for cron (today + yesterday ET). |

4. **Deploy.** After the first deploy, **trigger the updater once** so Blob is seeded (either wait for the cron schedule or open in a browser, with auth header if using a REST client):

   ```bash
   curl -sS -H "Authorization: Bearer YOUR_CRON_SECRET" \
     "https://YOUR_APP.vercel.app/api/cron/update"
   ```

5. **Crons** — [`vercel.json`](../vercel.json) runs `/api/cron/update` every **5 minutes** (`*/5 * * * *`). **Hobby** only allows one cron per day; use **Pro** (or trial) for frequent schedules. Change `schedule` in `vercel.json` if you want a different interval (requires redeploy). You can still call `GET /api/cron/update` manually with the Bearer secret between runs if needed.

### How it works

- **`GET /api/cron/update`** — Downloads `games` / `teams` / current `results` & overlay from **`SITE_URL`** (or existing Blob), runs the same Node scripts as locally, uploads **`mm-live/results.json`** and **`mm-live/overlay.json`** to Blob.
- **`GET /api/live/data`** — Returns `{ results, overlay }` from Blob when present, otherwise falls back to your static `/data/*.json`. The SPA polls this when `VITE_LIVE_POLL=1`.

### Local full stack

```bash
cd spreadMadness   # repo root
npm install
npx vercel dev
```

Use the URL `vercel dev` prints; set the same env vars in `.env.local` at the root or via the Vercel CLI.

## Brand

Semantic colors use the same dark token palette as the reference design (`index.css` / `App.css`). Swap the `P` mark in `App.tsx` for official assets when available.
