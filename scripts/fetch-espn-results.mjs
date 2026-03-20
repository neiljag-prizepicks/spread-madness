#!/usr/bin/env node
/**
 * Pull men's college basketball scoreboard from ESPN's public JSON API
 * (same payload their site uses — not HTML scraping), map to bracket team_ids,
 * merge into results.json. See scripts/README.md → ESPN poll.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildPairToGameId,
  defaultDatesEt,
  espnAbbrevToTeamId,
  fetchScoreboardYmd,
  loadAbbrevToTeamId,
  loadAliases,
  readJson,
  requireFile,
} from "./lib/espn-shared.mjs";
import { mergeGameResultWithScoresTimestamp } from "./lib/result-timestamp.mjs";
import {
  normalizeGameResultEntry,
  resultsMapFromFileObject,
} from "./lib/results-normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    dates: null,
    games: null,
    teams: null,
    results: null,
    aliases: null,
    dryRun: false,
    verbose: false,
    skipPre: true,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--verbose" || a === "-v") out.verbose = true;
    else if (a === "--include-pre") out.skipPre = false;
    else if (a === "--dates") out.dates = argv[++i];
    else if (a === "--games") out.games = argv[++i];
    else if (a === "--teams") out.teams = argv[++i];
    else if (a === "--results") out.results = argv[++i];
    else if (a === "--aliases") out.aliases = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function eventToResult(event, pairToGid, aliases, abbrevToTeamId, opts) {
  const comp = event?.competitions?.[0];
  if (!comp || !Array.isArray(comp.competitors) || comp.competitors.length !== 2)
    return null;

  const st = comp.status?.type;
  if (!st) return null;

  const c0 = comp.competitors[0];
  const c1 = comp.competitors[1];
  const a0 = c0?.team?.abbreviation;
  const a1 = c1?.team?.abbreviation;
  const t0 = espnAbbrevToTeamId(a0, aliases, abbrevToTeamId);
  const t1 = espnAbbrevToTeamId(a1, aliases, abbrevToTeamId);
  if (!t0 || !t1) {
    if (opts.verbose)
      console.warn(
        `Skip ESPN event (unmapped abbrevs): ${a0} vs ${a1} — ${event.name ?? event.id}`
      );
    return null;
  }

  const key = [t0, t1].sort().join("|");
  const gid = pairToGid.get(key);
  if (!gid) {
    if (opts.verbose)
      console.warn(
        `No bracket game for matchup ${t0} vs ${t1} (${a0} vs ${a1}) — ${event.name ?? ""}`
      );
    return null;
  }

  const s0 = parseInt(String(c0.score ?? ""), 10);
  const s1 = parseInt(String(c1.score ?? ""), 10);

  if (st.completed === true || st.state === "post") {
    if (Number.isNaN(s0) || Number.isNaN(s1)) return null;
    return {
      gid,
      result: {
        status: "final",
        clock: null,
        scores: { [t0]: s0, [t1]: s1 },
      },
    };
  }

  if (st.state === "in") {
    const clock = st.detail || st.shortDetail || null;
    const scores = {};
    if (!Number.isNaN(s0)) scores[t0] = s0;
    if (!Number.isNaN(s1)) scores[t1] = s1;
    return {
      gid,
      result: {
        status: "in_progress",
        clock,
        scores,
      },
    };
  }

  if (st.state === "pre") {
    if (opts.skipPre) return null;
    return {
      gid,
      result: {
        status: "not_started",
        clock: null,
        scores: {},
      },
    };
  }

  return null;
}

function writeOrderedResults(games, baseObj, outPath) {
  const ordered = {};
  for (const g of games) {
    if (baseObj[g.id]) ordered[g.id] = baseObj[g.id];
  }
  for (const [k, v] of Object.entries(baseObj)) {
    if (!ordered[k]) ordered[k] = v;
  }
  fs.writeFileSync(outPath, JSON.stringify(ordered, null, 2) + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Fetch ESPN MCB scoreboard JSON and merge into results.json.

Usage:
  node scripts/fetch-espn-results.mjs --dates 20260320
  node scripts/fetch-espn-results.mjs --dates 20260319,20260320
  node scripts/fetch-espn-results.mjs --dates auto
  node scripts/fetch-espn-results.mjs --dates auto --dry-run --verbose

Options:
  --dates auto     Today + yesterday (US/Eastern calendar dates)
  --include-pre    Write not_started rows for scheduled games (default: skip)
  --aliases PATH   ESPN abbrev → our abbrev (default: scripts/espn-abbrev-aliases.json)
  --dry-run        Print JSON only; do not write results.json
  --verbose        Log unmapped / unmatched ESPN games
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

  let baseObj = {};
  if (fs.existsSync(resultsPath)) {
    baseObj = readJson(resultsPath);
    if (!baseObj || typeof baseObj !== "object" || Array.isArray(baseObj))
      baseObj = {};
  }

  const resultsMap = resultsMapFromFileObject(baseObj);
  const opts = { verbose: args.verbose, skipPre: args.skipPre };

  for (const ymd of dateList) {
    let data;
    try {
      data = await fetchScoreboardYmd(ymd);
    } catch (e) {
      console.error(`Fetch failed for ${ymd}:`, e.message);
      process.exit(1);
    }
    const events = data.events ?? [];
    for (const ev of events) {
      const pair = buildPairToGameId(games, resultsMap);
      const out = eventToResult(ev, pair, aliases, abbrevToTeamId, opts);
      if (!out) continue;
      const merged = mergeGameResultWithScoresTimestamp(
        baseObj[out.gid],
        out.result
      );
      baseObj[out.gid] = merged;
      resultsMap.set(out.gid, normalizeGameResultEntry(merged));
    }
  }

  if (args.dryRun) {
    const ordered = {};
    for (const g of games) {
      if (baseObj[g.id]) ordered[g.id] = baseObj[g.id];
    }
    for (const [k, v] of Object.entries(baseObj)) {
      if (!ordered[k]) ordered[k] = v;
    }
    console.log(JSON.stringify(ordered, null, 2));
    return;
  }

  writeOrderedResults(games, baseObj, resultsPath);
  console.log(`Updated ${resultsPath} from ESPN (${dateList.join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});