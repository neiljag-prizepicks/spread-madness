#!/usr/bin/env node
/**
 * For ESPN games that map to a bracket slot with both teams resolved,
 * fetch summary pickcenter (DraftKings line on ESPN) and merge
 * favorite_team_id + spread_from_favorite_perspective into game_schedule_and_lines.json.
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
    includeTip: false,
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
    } else if (a === "--include-tip") out.includeTip = true;
    else if (a === "--dates") out.dates = argv[++i];
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

/** Overlay tip overrides games template (same as web merge). */
function effectiveTipUtc(game, overlayEntry, includeTipFallback, eventDateIso) {
  if (
    overlayEntry &&
    "scheduled_tip_utc" in overlayEntry &&
    overlayEntry.scheduled_tip_utc != null &&
    String(overlayEntry.scheduled_tip_utc).trim() !== ""
  ) {
    return overlayEntry.scheduled_tip_utc;
  }
  if (game?.scheduled_tip_utc) return game.scheduled_tip_utc;
  if (includeTipFallback && eventDateIso) return eventDateIso;
  return null;
}

/** Strictly before scheduled tip instant (UTC ms); no spread writes on or after tip. */
function isBeforeScheduledTip(tipIso, nowMs = Date.now()) {
  if (!tipIso) return false;
  const t = Date.parse(tipIso);
  if (Number.isNaN(t)) return false;
  return nowMs < t;
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
  --dates auto          Today + yesterday (US/Eastern)
  --force               Overwrite spread in overlay even if already set
  --always-update       Same as --force
  --only-missing        Default: skip games that already have spread in overlay
  --include-tip         Set scheduled_tip_utc from ESPN event time when overlay lacks it
  --delay-ms N          Pause between summary requests (default 80)
  --dry-run             Print overlay JSON; do not write
  --verbose             Log skips

Spreads are **never** written on or after the game’s scheduled tip (field: scheduled_tip_utc from
games JSON or overlay, else ESPN event time if --include-tip).

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
    dateList = defaultDatesEt();
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

    const events = data.events ?? [];
    for (const ev of events) {
      const comp = ev?.competitions?.[0];
      if (!comp?.competitors || comp.competitors.length !== 2) continue;

      const pair = buildPairToGameId(games, resultsMap);
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

      if (shouldSkipExistingSpread(overlay, gid, args.onlyMissing)) {
        if (opts.verbose) console.warn(`Skip ${gid}: overlay already has spread`);
        continue;
      }

      const bracketGame = gameById.get(gid);
      const tip = effectiveTipUtc(
        bracketGame,
        overlay[gid],
        args.includeTip,
        ev.date
      );
      if (!isBeforeScheduledTip(tip, Date.now())) {
        if (opts.verbose)
          console.warn(
            `Skip ${gid}: on or after scheduled tip (${tip ?? "no tip"})`
          );
        continue;
      }

      let summary;
      try {
        summary = await fetchSummaryForEvent(ev.id);
      } catch (e) {
        if (opts.verbose) console.warn(`Summary ${ev.id}: ${e.message}`);
        continue;
      }

      await sleep(args.delayMs);

      const pick = pickFirstWithSpread(summary);
      const linePatch = patchFromPickcenter(pick, ha.tidHome, ha.tidAway);
      if (!linePatch) {
        if (opts.verbose)
          console.warn(`No pickcenter spread for ${ev.shortName ?? ev.id}`);
        continue;
      }

      const prev = overlay[gid] ?? {};
      const next = { ...prev, ...linePatch };

      if (args.includeTip && ev.date && !("scheduled_tip_utc" in prev)) {
        next.scheduled_tip_utc = ev.date;
      }

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
  console.log(`Updated ${overlayPath} (ESPN pickcenter spreads, dates ${dateList.join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
