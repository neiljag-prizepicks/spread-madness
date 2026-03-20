#!/usr/bin/env node
/**
 * Merge CSV rows into web/public/data/game_schedule_and_lines.json
 * (tip times + favorite + spread overrides). See scripts/README.md.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    games: null,
    overlay: null,
    csv: null,
    json: null,
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--games") out.games = argv[++i];
    else if (a === "--overlay") out.overlay = argv[++i];
    else if (a === "--csv") out.csv = argv[++i];
    else if (a === "--json") out.json = argv[++i];
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function requireFile(absPath) {
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }
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

function loadGameIds(gamesPath) {
  requireFile(gamesPath);
  const data = readJson(gamesPath);
  const games = data.games ?? [];
  return new Set(games.map((g) => g.id));
}

function gamesByIdFromPath(gamesPath) {
  requireFile(gamesPath);
  const data = readJson(gamesPath);
  return new Map((data.games ?? []).map((g) => [g.id, g]));
}

/** Effective tip after merge: patch wins, then prev overlay, then bracket template. */
function mergedScheduledTipUtc(bracketGame, prevOverlay, nextOverlay) {
  if (
    nextOverlay &&
    "scheduled_tip_utc" in nextOverlay &&
    nextOverlay.scheduled_tip_utc != null &&
    String(nextOverlay.scheduled_tip_utc).trim() !== ""
  ) {
    return nextOverlay.scheduled_tip_utc;
  }
  if (
    prevOverlay?.scheduled_tip_utc != null &&
    String(prevOverlay.scheduled_tip_utc).trim() !== ""
  ) {
    return prevOverlay.scheduled_tip_utc;
  }
  return bracketGame?.scheduled_tip_utc ?? null;
}

/** Strictly before scheduled tip instant (UTC ms); no spread writes on or after tip. */
function isBeforeScheduledTip(tipIso, nowMs = Date.now()) {
  if (!tipIso) return false;
  const t = Date.parse(tipIso);
  if (Number.isNaN(t)) return false;
  return nowMs < t;
}

/**
 * If favorite/spread would change on or after tip, revert those fields to prev overlay.
 * When there is no known tip, allow changes (same as manual ops before tip is set).
 */
/** @returns {boolean} true if spread/favorite were reverted due to tip lock */
function enforceSpreadBeforeTip(gameId, bracketGame, prevOverlay, nextOverlay) {
  const lineChanged =
    prevOverlay.favorite_team_id !== nextOverlay.favorite_team_id ||
    prevOverlay.spread_from_favorite_perspective !==
      nextOverlay.spread_from_favorite_perspective;
  if (!lineChanged) return false;
  const tip = mergedScheduledTipUtc(bracketGame, prevOverlay, nextOverlay);
  if (!tip || isBeforeScheduledTip(tip)) return false;
  nextOverlay.favorite_team_id = prevOverlay.favorite_team_id;
  nextOverlay.spread_from_favorite_perspective =
    prevOverlay.spread_from_favorite_perspective;
  console.warn(
    `import-game-overlay: skipped spread/favorite for ${gameId} (on or after scheduled tip ${tip})`
  );
  return true;
}

function applyCSV(csvPath, gameIds, gameById, base) {
  requireFile(csvPath);
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV needs header + ≥1 row");
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const need = ["game_id"];
  for (const h of need) {
    if (!(h in idx)) throw new Error(`CSV missing column: ${h}`);
  }

  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const gameId = cells[idx.game_id];
    if (!gameId) continue;
    if (!gameIds.has(gameId)) throw new Error(`Unknown game_id: ${gameId}`);

    const prev = base[gameId] ?? {};
    const patch = { ...prev };

    if (idx.scheduled_tip_utc !== undefined) {
      const v = cells[idx.scheduled_tip_utc];
      if (v !== undefined && v !== "") {
        patch.scheduled_tip_utc = v;
      }
    }
    if (idx.favorite_team_id !== undefined) {
      const v = cells[idx.favorite_team_id];
      if (v !== undefined && v !== "") {
        patch.favorite_team_id = v;
      }
    }
    if (idx.spread_from_favorite_perspective !== undefined) {
      const v = cells[idx.spread_from_favorite_perspective];
      if (v !== undefined && v !== "") {
        const n = parseFloat(v);
        if (Number.isNaN(n)) {
          throw new Error(`Row ${r + 1}: invalid spread ${JSON.stringify(v)}`);
        }
        patch.spread_from_favorite_perspective = n;
      }
    }

    const reverted = enforceSpreadBeforeTip(
      gameId,
      gameById.get(gameId),
      prev,
      patch
    );
    if (reverted) {
      patch.spread_updated_at = prev.spread_updated_at;
    } else if (
      prev.favorite_team_id !== patch.favorite_team_id ||
      prev.spread_from_favorite_perspective !==
        patch.spread_from_favorite_perspective
    ) {
      patch.spread_updated_at = new Date().toISOString();
    } else if (prev.spread_updated_at) {
      patch.spread_updated_at = prev.spread_updated_at;
    }

    if (Object.keys(patch).length > 0) base[gameId] = patch;
  }
}

function applyJSONPatch(jsonPath, gameIds, gameById, base) {
  requireFile(jsonPath);
  const patch = readJson(jsonPath);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("JSON patch must be an object keyed by game_id");
  }
  for (const [gid, raw] of Object.entries(patch)) {
    if (!gameIds.has(gid)) throw new Error(`Unknown game_id: ${gid}`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid patch for ${gid}`);
    }
    const prev = base[gid] ?? {};
    const next = { ...prev };
    if ("scheduled_tip_utc" in raw) {
      next.scheduled_tip_utc =
        raw.scheduled_tip_utc === null || raw.scheduled_tip_utc === undefined
          ? null
          : String(raw.scheduled_tip_utc);
    }
    if ("favorite_team_id" in raw) {
      next.favorite_team_id =
        raw.favorite_team_id === null || raw.favorite_team_id === undefined
          ? null
          : String(raw.favorite_team_id);
    }
    if ("spread_from_favorite_perspective" in raw) {
      const s = raw.spread_from_favorite_perspective;
      next.spread_from_favorite_perspective =
        s === null || s === undefined ? null : Number(s);
    }
    const reverted = enforceSpreadBeforeTip(gid, gameById.get(gid), prev, next);
    if (reverted) {
      next.spread_updated_at = prev.spread_updated_at;
    } else if ("spread_updated_at" in raw) {
      next.spread_updated_at =
        raw.spread_updated_at === null || raw.spread_updated_at === undefined
          ? null
          : String(raw.spread_updated_at);
    } else if (
      prev.favorite_team_id !== next.favorite_team_id ||
      prev.spread_from_favorite_perspective !==
        next.spread_from_favorite_perspective
    ) {
      next.spread_updated_at = new Date().toISOString();
    } else if (prev.spread_updated_at) {
      next.spread_updated_at = prev.spread_updated_at;
    }
    base[gid] = next;
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Usage:
  node scripts/import-game-overlay.mjs --csv <patch.csv>
  node scripts/import-game-overlay.mjs --json <patch.json>
  [--games <games.json>] [--overlay <game_schedule_and_lines.json>] [--dry-run]

Defaults: web/public/data/games_2026_march_madness.json, game_schedule_and_lines.json
`);
    process.exit(0);
  }

  const root = path.join(__dirname, "..");
  const gamesPath =
    args.games ?? path.join(root, "web/public/data/games_2026_march_madness.json");
  const overlayPath =
    args.overlay ??
    path.join(root, "web/public/data/game_schedule_and_lines.json");

  if (!args.csv && !args.json) {
    console.error("Provide --csv or --json");
    process.exit(1);
  }

  const gameIds = loadGameIds(gamesPath);
  const gameById = gamesByIdFromPath(gamesPath);
  let base = {};
  if (fs.existsSync(overlayPath)) {
    const raw = readJson(overlayPath);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      base = { ...raw };
    }
  }

  if (args.csv)
    applyCSV(path.resolve(args.csv), gameIds, gameById, base);
  if (args.json)
    applyJSONPatch(path.resolve(args.json), gameIds, gameById, base);

  const outJson = JSON.stringify(base, null, 2) + "\n";
  if (args.dryRun) {
    console.log(outJson);
  } else {
    fs.writeFileSync(overlayPath, outJson, "utf8");
    console.log(`Wrote ${overlayPath}`);
  }
}

main();
