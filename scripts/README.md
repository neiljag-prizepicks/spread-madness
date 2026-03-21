# Results import

## `import-results.mjs`

Merges a **CSV** or **JSON** patch into [`web/public/data/results.json`](../web/public/data/results.json). Canonical per-game shape:

```json
{
  "E-R64-1": {
    "status": "final",
    "clock": null,
    "scores": { "E16": 65, "E01": 71 }
  }
}
```

- `status`: `not_started` | `in_progress` | `final`
- `clock`: display string when live (e.g. `1st Half 10:39`), else `null`
- `scores`: keys must be the two `team_id`s on that game in `games_*.json`

Legacy flat objects `{ "E16": 65, "E01": 71 }` are normalized to `status: final` on read/write.

### CSV columns

Required headers:

`game_id,team_id_a,score_a,team_id_b,score_b`

Optional:

`status`, `clock`

- `scores_updated_at` (ISO string): optional; scripts set this when `status` / `clock` / `scores` change so the app can show “score last updated” in the matchup info tooltip.

- `team_id_a` / `team_id_b` must match that game’s `side_a` / `side_b` `team_id` (either order).
- Empty scores are allowed; if both scores are filled and `status` is omitted → `final`.
- If both scores empty and `status` omitted → `not_started`.

### Examples

From repo root (`spreadMadness/`):

```bash
# Merge a patch (see sample-results-patch.csv)
node scripts/import-results.mjs --csv scripts/sample-results-patch.csv

# Preview merged JSON without writing
node scripts/import-results.mjs --csv scripts/sample-results-patch.csv --dry-run

# JSON patch — use a real file path (not a placeholder)
node scripts/import-results.mjs --json scripts/sample-results-patch.json

# Regenerate commissioner index (game ids + schools + current results)
node scripts/import-results.mjs --write-index scripts/games_results_index.csv

# Clear all results back to {}
node scripts/reset-results.mjs
```

Default paths: `web/public/data/games_2026_march_madness.json`, `teams_2026_march_madness.json`, `results.json`.

## `reset-results.mjs`

Writes `{}` to `results.json` (same default path as import). Optional: `--results /other/path/results.json`.

---

## Schedule & lines overlay (`game_schedule_and_lines.json`)

Tip times and spreads for later rounds often stay `null` in the main [`games_2026_march_madness.json`](../web/public/data/games_2026_march_madness.json) template. **Do not** duplicate advancing `team_id`s here—the app already resolves matchups from `results.json` + bracket links. This file only overrides:

- `scheduled_tip_utc` (ISO string)
- `favorite_team_id`
- `spread_from_favorite_perspective` (number; negative = favorite giving points)
- `spread_updated_at` (ISO string): optional; set automatically when the favorite/spread **changes** (ESPN script, CSV/JSON import) so the app can show “spread last updated” only when the line actually moved.

**Tip lock:** `favorite_team_id` / `spread_from_favorite_perspective` are **not** applied on or after that game’s effective `scheduled_tip_utc` (overlay → bracket template). The ESPN spread script uses the same order and, when both are missing, the **scoreboard event time** for that row so lines still freeze at tip-off. If no tip is known yet, imports still allow setting a line.

Per-game object: include **only** keys you want to override (same semantics as the React merge: omitted keys keep template values).

### `import-game-overlay.mjs`

```bash
node scripts/import-game-overlay.mjs --csv scripts/sample-game-schedule-lines.csv
node scripts/import-game-overlay.mjs --json scripts/sample-game-schedule-lines.json
node scripts/import-game-overlay.mjs --csv my.csv --dry-run
```

Defaults: `--games web/public/data/games_2026_march_madness.json`, `--overlay web/public/data/game_schedule_and_lines.json`.

CSV columns: **`game_id`** (required), plus optional `scheduled_tip_utc`, `favorite_team_id`, `spread_from_favorite_perspective`. Empty cells leave that field unchanged on the stored patch for that game.

JSON patch: object keyed by `game_id`, values `{ ... }` with any of the three fields; merges onto existing overlay entries.

### `reset-game-overlay.mjs`

```bash
node scripts/reset-game-overlay.mjs
```

Clears overlay to `{}`.

---

### ESPN scoreboard poll (interim automation)

ESPN serves a **public JSON scoreboard** (same data their site loads). `fetch-espn-results.mjs` maps games to your bracket via **team abbreviations** + [`espn-abbrev-aliases.json`](espn-abbrev-aliases.json), resolves TBD slots using current [`results.json`](../web/public/data/results.json) (same logic as the web app), then merges **final** and **in-progress** rows (`status`, `clock`, `scores`).

```bash
# One shot — explicit dates (YYYYMMDD, comma-separated)
node scripts/fetch-espn-results.mjs --dates 20260320
node scripts/fetch-espn-results.mjs --dates 20260319,20260320 --dry-run --verbose

# Today + yesterday (US/Eastern calendar)
node scripts/fetch-espn-results.mjs --dates auto

# Loop (writes results.json every POLL_SECONDS)
./scripts/poll-espn-results.sh
POLL_SECONDS=90 ESPN_DATES=auto ./scripts/poll-espn-results.sh
```

**Caveats**

- ESPN can change or rate-limit this endpoint; this is a **dev / league-ops** bridge until Sportradar (or similar).
- Add aliases when `--verbose` shows `unmapped abbrevs` (ESPN string → your `teams_*.json` `abbrev`).
- Default is to **skip** `pre` games; use `--include-pre` to write `not_started` rows.

**After updating `results.json`**, refresh the web app (or add client polling later) to see changes.

### ESPN spreads → `game_schedule_and_lines.json`

After **both teams** are known for a bracket game (including via feeder wins in `results.json`), ESPN’s **game summary** includes `pickcenter` lines (typically DraftKings on ESPN). [`fetch-espn-spreads.mjs`](fetch-espn-spreads.mjs) matches scoreboard events to those games, writes **`scheduled_tip_utc`** from the event when your template and overlay do not already define a tip, then calls the summary endpoint and writes **`favorite_team_id`** and **`spread_from_favorite_perspective`** (negative = favorite laying points, same as your games template).

```bash
node scripts/fetch-espn-spreads.mjs --dates auto
node scripts/fetch-espn-spreads.mjs --dates 20260320 --dry-run --verbose
# Overwrite spreads already in overlay:
node scripts/fetch-espn-spreads.mjs --dates auto --force
```

Defaults: reads [`results.json`](../web/public/data/results.json), writes [`game_schedule_and_lines.json`](../web/public/data/game_schedule_and_lines.json). Uses the same abbrev map as the results poll. **By default** it **does not** overwrite a game that already has `spread_from_favorite_perspective` in the overlay (use `--force`).

For each mapped ESPN event, if the games template and overlay have **no** `scheduled_tip_utc`, the script **writes ESPN’s event time** into the overlay so the web app can show tip-off. Spread eligibility uses the same ordering: **overlay tip → template tip → ESPN event time**; spreads are only written while `now` is before that instant (UTC). `spread_updated_at` in the overlay is bumped **only** when the favorite or spread value changes.

One summary request per game (small `--delay-ms` between calls). Run **after** `fetch-espn-results` (or in the same loop) so advancement + lines stay aligned.

```bash
./scripts/poll-espn-all.sh
ESPN_DATES=auto POLL_SECONDS=120 ./scripts/poll-espn-all.sh
```

---

### Automated feeds (production)

A licensed API should emit the same `results.json` shape, or POST to your backend; replace the ESPN script when ready.

**Vercel (no redeploy for scores):** The repo root [`vercel.json`](../vercel.json) runs a cron that calls the same scripts and stores output in **Vercel Blob**; the web app polls `/api/live/data`. Setup steps: [`web/README.md`](../web/README.md) → *Vercel (live scores without redeploy)*.
