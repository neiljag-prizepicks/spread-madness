#!/usr/bin/env node
/**
 * Merge CSV or JSON patches into web/public/data/results.json.
 * See scripts/README.md for column contract.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mergeGameResultWithScoresTimestamp } from "./lib/result-timestamp.mjs";
import {
  normalizeGameResultEntry,
  parseStatus,
} from "./lib/results-normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    games: null,
    teams: null,
    results: null,
    csv: null,
    json: null,
    dryRun: false,
    writeIndex: null,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--games") out.games = argv[++i];
    else if (a === "--teams") out.teams = argv[++i];
    else if (a === "--results") out.results = argv[++i];
    else if (a === "--csv") out.csv = argv[++i];
    else if (a === "--json") out.json = argv[++i];
    else if (a === "--write-index") out.writeIndex = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function requireFile(absPath, hint) {
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    console.error(
      hint ??
        "Use a real path. Example: node scripts/import-results.mjs --json scripts/sample-results-patch.json (see scripts/README.md)."
    );
    process.exit(1);
  }
}

function loadGamesMap(gamesPath) {
  requireFile(gamesPath);
  const data = readJson(gamesPath);
  const games = data.games ?? [];
  const byId = new Map(games.map((g) => [g.id, g]));
  return { games, byId };
}

function loadTeamsById(teamsPath) {
  requireFile(teamsPath);
  const data = readJson(teamsPath);
  const list = Array.isArray(data) ? data : data.teams ?? [];
  return new Map(list.map((t) => [t.id, t]));
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseScoreCell(cell) {
  if (cell == null || String(cell).trim() === "") return null;
  const n = parseInt(String(cell), 10);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`Invalid score: ${JSON.stringify(cell)}`);
  }
  return n;
}

function sidesForGame(game) {
  const a = game.side_a?.team_id;
  const b = game.side_b?.team_id;
  return { a, b };
}

function validateTeamsForGame(gameId, game, tidA, tidB) {
  const { a, b } = sidesForGame(game);
  if (!a || !b) {
    throw new Error(`${gameId}: game missing side_a/side_b team_id`);
  }
  const set = new Set([tidA, tidB]);
  if (!set.has(a) || !set.has(b) || tidA === tidB) {
    throw new Error(
      `${gameId}: team_id_a/team_id_b must be ${a} and ${b} (order-free), got ${tidA}, ${tidB}`
    );
  }
}

function rowToResult(gameId, game, cells, headers) {
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const need = ["game_id", "team_id_a", "score_a", "team_id_b", "score_b"];
  for (const h of need) {
    if (!(h in idx)) throw new Error(`CSV missing column: ${h}`);
  }
  const tidA = cells[idx.team_id_a];
  const tidB = cells[idx.team_id_b];
  validateTeamsForGame(gameId, game, tidA, tidB);
  const sa = parseScoreCell(cells[idx.score_a]);
  const sb = parseScoreCell(cells[idx.score_b]);
  let status =
    idx.status !== undefined ? parseStatus(cells[idx.status]) : null;
  const clockRaw =
    idx.clock !== undefined ? cells[idx.clock] : null;
  const clock =
    clockRaw != null && String(clockRaw).trim() !== ""
      ? String(clockRaw)
      : null;

  const scores = {};
  if (sa != null) scores[tidA] = sa;
  if (sb != null) scores[tidB] = sb;

  if (!status) {
    if (sa != null && sb != null) status = "final";
    else if (sa == null && sb == null) status = "not_started";
    else status = "in_progress";
  }

  return { status, clock, scores };
}

function applyCSVPatch(csvPath, byId, base) {
  requireFile(csvPath);
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV needs header + ≥1 row");
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    if (cells.length === 1 && cells[0] === "") continue;
    const gameId = cells[headers.indexOf("game_id")];
    if (!gameId) continue;
    const game = byId.get(gameId);
    if (!game) throw new Error(`Unknown game_id: ${gameId}`);
    const result = rowToResult(gameId, game, cells, headers);
    base[gameId] = mergeGameResultWithScoresTimestamp(base[gameId], result);
  }
}

function applyJSONPatch(jsonPath, byId, base) {
  requireFile(jsonPath);
  const patch = readJson(jsonPath);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("JSON patch must be an object");
  }
  for (const [gid, raw] of Object.entries(patch)) {
    if (!byId.has(gid)) throw new Error(`Unknown game_id in JSON patch: ${gid}`);
    const norm = normalizeGameResultEntry(raw);
    base[gid] = mergeGameResultWithScoresTimestamp(base[gid], norm);
  }
}

function writeIndex(outPath, games, teamsById, resultsObj) {
  const esc = (s) => {
    if (s == null) return "";
    const t = String(s);
    if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const headers = [
    "game_id",
    "round",
    "region",
    "scheduled_tip_utc",
    "team_id_a",
    "team_id_b",
    "school_a",
    "school_b",
    "abbrev_a",
    "abbrev_b",
    "status",
    "clock",
    "score_a",
    "score_b",
  ];
  const rows = [headers.join(",")];
  for (const g of games) {
    const ta = g.side_a?.team_id ?? "";
    const tb = g.side_b?.team_id ?? "";
    const sa = ta ? teamsById.get(ta) : null;
    const sb = tb ? teamsById.get(tb) : null;
    const res = resultsObj[g.id];
    const scores = res?.scores ?? {};
    const scoreA = ta ? scores[ta] ?? "" : "";
    const scoreB = tb ? scores[tb] ?? "" : "";
    rows.push(
      [
        g.id,
        g.round,
        g.region,
        g.scheduled_tip_utc ?? "",
        ta,
        tb,
        sa?.school ?? "",
        sb?.school ?? "",
        sa?.abbrev ?? "",
        sb?.abbrev ?? "",
        res?.status ?? "",
        res?.clock ?? "",
        scoreA,
        scoreB,
      ]
        .map(esc)
        .join(",")
    );
  }
  fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage:
  node scripts/import-results.mjs --games <games.json> --teams <teams.json> --results <results.json> (--csv <patch.csv> | --json <patch.json>) [--dry-run] [--write-index <index.csv>]

Defaults (from repo root):
  --games web/public/data/games_2026_march_madness.json
  --teams web/public/data/teams_2026_march_madness.json
  --results web/public/data/results.json
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

  if (!args.csv && !args.json) {
    if (args.writeIndex) {
      const { games } = loadGamesMap(gamesPath);
      const teamsById = loadTeamsById(teamsPath);
      let resultsObj = {};
      if (fs.existsSync(resultsPath)) {
        const raw = readJson(resultsPath);
        for (const [k, v] of Object.entries(raw)) {
          resultsObj[k] = normalizeGameResultEntry(v);
        }
      }
      writeIndex(args.writeIndex, games, teamsById, resultsObj);
      console.log(`Wrote ${args.writeIndex}`);
      return;
    }
    console.error("Provide --csv or --json patch, or --write-index only.");
    process.exit(1);
  }

  const { games, byId } = loadGamesMap(gamesPath);
  const teamsById = loadTeamsById(teamsPath);

  let base = {};
  if (fs.existsSync(resultsPath)) {
    const raw = readJson(resultsPath);
    for (const [k, v] of Object.entries(raw)) {
      base[k] = normalizeGameResultEntry(v);
    }
  }

  if (args.csv) applyCSVPatch(path.resolve(args.csv), byId, base);
  if (args.json) applyJSONPatch(path.resolve(args.json), byId, base);

  const ordered = {};
  for (const g of games) {
    if (base[g.id]) ordered[g.id] = base[g.id];
  }
  for (const [k, v] of Object.entries(base)) {
    if (!ordered[k]) ordered[k] = v;
  }

  const outJson = JSON.stringify(ordered, null, 2) + "\n";

  if (args.dryRun) {
    console.log(outJson);
    if (args.writeIndex) {
      console.error("(index not written with --dry-run; omit --dry-run to write files)");
    }
  } else {
    fs.writeFileSync(resultsPath, outJson, "utf8");
    console.log(`Wrote ${resultsPath}`);
    if (args.writeIndex) {
      writeIndex(args.writeIndex, games, teamsById, readJson(resultsPath));
      console.log(`Wrote ${args.writeIndex}`);
    }
  }
}

main();
