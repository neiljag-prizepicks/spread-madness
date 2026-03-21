#!/usr/bin/env node
/**
 * For ESPN games that map to a bracket slot with both teams resolved,
 * fetch summary pickcenter (DraftKings line on ESPN) and merge
 * favorite_team_id + spread_from_favorite_perspective into game_schedule_and_lines.json,
 * and scheduled_tip_utc from the scoreboard event when the bracket template and overlay lack it.
 *
 * Spread convention matches games_*.json: negative = favorite laying points.
 * See scripts/README.md.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildPairToGameId,
  defaultDatesEt,
  fetchScoreboardYmd,
  fetchSummaryForEvent,
  homeAwayTeamIds,
  loadAbbrevToTeamId,
  loadAliases,
  readJson,
  requireFile,
} from "./lib/espn-shared.mjs";
import { spreadLineChanged } from "./lib/result-timestamp.mjs";
import { resultsMapFromFileObject } from "./lib/results-normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    dates: null,
    games: null,
    teams: null,
    results: null,
    overlay: null,
    aliases: null,
    dryRun: false,
    verbose: false,
    force: false,
    onlyMissing: true,
    delayMs: 80,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--verbose" || a === "-v") out.verbose = true;
    else if (a === "--force") {
      out.force = true;
      out.onlyMissing = false;
    } else if (a === "--always-update") {
      out.onlyMissing = false;
    } else if (a === "--dates") out.dates = argv[++i];
    else if (a === "--games") out.games = argv[++i];
    else if (a === "--teams") out.teams = argv[++i];
    else if (a === "--results") out.results = argv[++i];
    else if (a === "--overlay") out.overlay = argv[++i];
    else if (a === "--aliases") out.aliases = argv[++i];
    else if (a === "--delay-ms") out.delayMs = parseInt(argv[++i], 10) || 0;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function pickFirstWithSpread(summary) {
  const list = summary?.pickcenter;
  if (!Array.isArray(list)) return null;
  return (
    list.find((p) => {
      if (!p || p.spread === undefined || p.spread === null) return false;
      const n = Number(p.spread);
      return !Number.isNaN(n);
    }) ?? null
  );
}

/**
 * @returns {{ favorite_team_id: string, spread_from_favorite_perspective: number } | null}
 */
function patchFromPickcenter(pick, tidHome, tidAway) {
  if (!pick) return null;
  const raw = Number(pick.spread);
  if (Number.isNaN(raw)) return null;

  let favoriteTid;
  if (pick.homeTeamOdds?.favorite === true) favoriteTid = tidHome;
  else if (pick.awayTeamOdds?.favorite === true) favoriteTid = tidAway;
  else return null;

  const mag = Math.abs(raw);
  if (mag === 0) return null;
  return {
    favorite_team_id: favoriteTid,
    spread_from_favorite_perspective: -mag,
  };
}

function shouldSkipExistingSpread(overlay, gid, onlyMissing) {
  if (!onlyMissing) return false;
  const ex = overlay[gid];
  if (!ex || !("spread_from_favorite_perspective" in ex)) return false;
  const s = ex.spread_from_favorite_perspective;
  return typeof s === "number" && !Number.isNaN(s);
}

/** Same “has a tip” rule as web overlay merge / import-game-overlay. */
function overlayHasScheduledTip(overlayEntry) {
  return (
    overlayEntry &&
    "scheduled_tip_utc" in overlayEntry &&
    overlayEntry.scheduled_tip_utc != null &&
    String(overlayEntry.scheduled_tip_utc).trim() !== ""
  );
}

function bracketHasScheduledTip(game) {
  return (
    game?.scheduled_tip_utc != null &&
    String(game.scheduled_tip_utc).trim() !== ""
  );
}

/**
 * Tip used to decide if we may still write a spread: overlay → bracket template →
 * this scoreboard row’s event time (so R32+ with null template still locks correctly).
 */
function tipForSpreadLock(game, overlayEntry, eventDateIso) {
  if (overlayHasScheduledTip(overlayEntry)) return overlayEntry.scheduled_tip_utc;
  if (bracketHasScheduledTip(game)) return game.scheduled_tip_utc;
  if (eventDateIso) return eventDateIso;
  return null;
}

/**
 * Before scheduled tip (UTC ms): no spread writes on or after tip.
 * If no tip is known, allow (same idea as CSV overlay import).
 */
function isBeforeScheduledTip(tipIso, nowMs = Date.now()) {
  if (!tipIso) return true;
  const t = Date.parse(tipIso);
  if (Number.isNaN(t)) return true;
  return nowMs < t;
}

/** Matches UI “has a line”: both favorite and spread present (see Matchup.tsx noLine). */
function overlayHasCompleteSpread(overlayEntry) {
  if (!overlayEntry || typeof overlayEntry !== "object") return false;
  const s = overlayEntry.spread_from_favorite_perspective;
  const f = overlayEntry.favorite_team_id;
  return (
    f != null &&
    String(f).trim() !== "" &&
    typeof s === "number" &&
    !Number.isNaN(s)
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Fetch ESPN summary pickcenter (book spread) for resolved bracket matchups;
merge into game_schedule_and_lines.json.

Requires both teams known for that game_id (same as results poll: uses results.json + bracket).

Usage:
  node scripts/fetch-espn-spreads.mjs --dates auto
  node scripts/fetch-espn-spreads.mjs --dates 20260320 --dry-run --verbose
  node scripts/fetch-espn-spreads.mjs --dates auto --force

Options:
  --dates auto          Yesterday, today, and tomorrow (US/Eastern)
  --force               Overwrite spread in overlay even if already set
  --always-update       Same as --force
  --only-missing        Default: skip games that already have spread in overlay
  --delay-ms N          Pause between summary requests (default 80)
  --dry-run             Print overlay JSON; do not write
  --verbose             Log skips

For each ESPN event that maps to a bracket game: if the overlay and games template have no
scheduled_tip_utc, the script stores ESPN’s event time as scheduled_tip_utc. Spread lock order is
overlay tip → template tip → that same ESPN event time. After tip, existing overlay lines are not
refetched (locked); if the overlay never got a line, the script still fetches pickcenter so live
games are not stuck with “spread not set”.

Note: Lines come from ESPN’s pickcenter (e.g. DraftKings). Verify for your pool rules.
`);
    process.exit(0);
  }

  const root = path.join(__dirname, "..");
  const gamesPath =
    args.games ?? path.join(root, "web/public/data/games_2026_march_madness.json");
  const teamsPath =
    args.teams ?? path.join(root, "web/public/data/teams_2026_march_madness.json");
  const resultsPath =
    args.results ?? path.join(root, "web/public/data/results.json");
  const overlayPath =
    args.overlay ?? path.join(root, "web/public/data/game_schedule_and_lines.json");
  const aliasesPath =
    args.aliases ?? path.join(root, "scripts/espn-abbrev-aliases.json");

  let dateList;
  if (!args.dates || args.dates === "auto") {
    dateList = defaultDatesEt(); // yesterday + today + tomorrow (ET)
  } else {
    dateList = args.dates.split(",").map((s) => s.trim()).filter(Boolean);
  }

  requireFile(gamesPath);
  const gamesData = readJson(gamesPath);
  const games = gamesData.games ?? [];
  const abbrevToTeamId = loadAbbrevToTeamId(teamsPath);
  const aliases = loadAliases(aliasesPath);

  let resultsObj = {};
  if (fs.existsSync(resultsPath)) {
    resultsObj = readJson(resultsPath);
    if (!resultsObj || typeof resultsObj !== "object" || Array.isArray(resultsObj))
      resultsObj = {};
  }
  const resultsMap = resultsMapFromFileObject(resultsObj);

  let overlay = {};
  if (fs.existsSync(overlayPath)) {
    overlay = readJson(overlayPath);
    if (!overlay || typeof overlay !== "object" || Array.isArray(overlay))
      overlay = {};
  }

  const opts = { verbose: args.verbose };
  const gameById = new Map(games.map((g) => [g.id, g]));

  for (const ymd of dateList) {
    let data;
    try {
      data = await fetchScoreboardYmd(ymd);
    } catch (e) {
      console.error(`Scoreboard fetch failed for ${ymd}:`, e.message);
      process.exit(1);
    }

    const pair = buildPairToGameId(games, resultsMap);
    const events = data.events ?? [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      if (!comp?.competitors || comp.competitors.length !== 2) continue;

      const ha = homeAwayTeamIds(
        comp,
        aliases,
        abbrevToTeamId,
        opts.verbose,
        ev.shortName ?? ev.name
      );
      if (!ha) continue;

      const key = [ha.tidHome, ha.tidAway].sort().join("|");
      const gid = pair.get(key);
      if (!gid) {
        if (opts.verbose)
          console.warn(
            `No bracket slot for ${ha.abbrevHome} vs ${ha.abbrevAway} — ${ev.shortName ?? ""}`
          );
        continue;
      }

      const prev = overlay[gid] ?? {};
      const bracketGame = gameById.get(gid);
      let next = { ...prev };

      if (
        !overlayHasScheduledTip(prev) &&
        !bracketHasScheduledTip(bracketGame) &&
        ev.date
      ) {
        next.scheduled_tip_utc = ev.date;
      }

      const lockTip = tipForSpreadLock(bracketGame, prev, ev.date);

      if (shouldSkipExistingSpread(overlay, gid, args.onlyMissing)) {
        overlay[gid] = next;
        if (opts.verbose) console.warn(`Skip ${gid}: overlay already has spread`);
        continue;
      }

      // After tip: do not refetch if we already stored a line (locks the number).
      // If we never got a line before tip, still fetch so the app is not stuck on "Spread not set".
      if (
        !isBeforeScheduledTip(lockTip, Date.now()) &&
        overlayHasCompleteSpread(prev)
      ) {
        overlay[gid] = next;
        if (opts.verbose)
          console.warn(
            `Skip ${gid}: on or after scheduled tip, line already set (${lockTip ?? "no tip"})`
          );
        continue;
      }

      let summary;
      try {
        summary = await fetchSummaryForEvent(ev.id);
      } catch (e) {
        overlay[gid] = next;
        if (opts.verbose) console.warn(`Summary ${ev.id}: ${e.message}`);
        continue;
      }

      await sleep(args.delayMs);

      const pick = pickFirstWithSpread(summary);
      const linePatch = patchFromPickcenter(pick, ha.tidHome, ha.tidAway);
      if (!linePatch) {
        overlay[gid] = next;
        if (opts.verbose)
          console.warn(`No pickcenter spread for ${ev.shortName ?? ev.id}`);
        continue;
      }

      next = { ...next, ...linePatch };

      if (
        spreadLineChanged(
          prev,
          linePatch.favorite_team_id,
          linePatch.spread_from_favorite_perspective
        )
      ) {
        next.spread_updated_at = new Date().toISOString();
      } else if (prev.spread_updated_at) {
        next.spread_updated_at = prev.spread_updated_at;
      }

      overlay[gid] = next;
    }
  }

  const outJson = JSON.stringify(overlay, null, 2) + "\n";
  if (args.dryRun) {
    console.log(outJson);
    return;
  }

  fs.writeFileSync(overlayPath, outJson, "utf8");
  console.log(
    `Updated ${overlayPath} (ESPN tips + pickcenter spreads, dates ${dateList.join(", ")})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
