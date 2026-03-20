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

## Scores (POC)

1. **Toolbar demos:** prefill **E-R64-1** (Duke vs Siena) for cover / no-cover.
2. **Enter score (POC)** on any matchup → modal with side A/B team ids.
3. **Import scores:** `node ../scripts/import-results.mjs` — see `../scripts/README.md`. Commissioner index: `../scripts/games_results_index.csv` (regenerate with `--write-index`). **Reset:** `node ../scripts/reset-results.mjs`.
4. **ESPN poll (interim):** `node ../scripts/fetch-espn-results.mjs --dates auto` — updates `results.json`. **`node ../scripts/fetch-espn-spreads.mjs --dates auto`** — fills spread + favorite into `game_schedule_and_lines.json` when both teams are set. Combined loop: `../scripts/poll-espn-all.sh`. Reload the app to see changes.

## Build

```bash
npm run build
npm run preview   # serve production build
```

## Brand

Semantic colors match PrizePicks dark tokens (`index.css` / `App.css`). Swap logo mark in `App.tsx` for official assets when available.
