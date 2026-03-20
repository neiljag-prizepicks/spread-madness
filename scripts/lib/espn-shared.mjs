/**
 * Shared ESPN scoreboard/summary helpers for bracket scripts.
 */

import fs from "fs";
import { buildGameMap, resolveTeamId } from "./bracket-resolve.mjs";

export const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

export const ESPN_SUMMARY =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary";

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function requireFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`Missing file: ${p}`);
    process.exit(1);
  }
}

export function ymdPartsEt(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value])
  );
  const y = parts.year;
  const m = parts.month.padStart(2, "0");
  const d = parts.day.padStart(2, "0");
  return `${y}${m}${d}`;
}

export function defaultDatesEt() {
  const now = Date.now();
  const today = ymdPartsEt(new Date(now));
  const yest = ymdPartsEt(new Date(now - 86400000));
  return today === yest ? [today] : [today, yest];
}

export function loadAbbrevToTeamId(teamsPath) {
  requireFile(teamsPath);
  const data = readJson(teamsPath);
  const list = Array.isArray(data) ? data : data.teams ?? [];
  const m = new Map();
  for (const t of list) {
    if (t?.abbrev && t?.id) m.set(String(t.abbrev).toUpperCase(), t.id);
  }
  return m;
}

export function loadAliases(aliasesPath) {
  if (!aliasesPath || !fs.existsSync(aliasesPath)) return {};
  const j = readJson(aliasesPath);
  return j && typeof j === "object" ? j : {};
}

export function espnAbbrevToTeamId(espnAbbr, aliases, abbrevToTeamId) {
  const raw = String(espnAbbr ?? "").trim();
  if (!raw) return null;
  const mapped = aliases[raw] ?? aliases[raw.toUpperCase()];
  const ourAbbrev = (mapped ?? raw).toUpperCase();
  return abbrevToTeamId.get(ourAbbrev) ?? null;
}

export function buildPairToGameId(games, resultsMap) {
  const gm = buildGameMap(games);
  const map = new Map();
  for (const game of games) {
    const ta = resolveTeamId(game, "side_a", gm, resultsMap, new Set());
    const tb = resolveTeamId(game, "side_b", gm, resultsMap, new Set());
    if (!ta || !tb) continue;
    const key = [ta, tb].sort().join("|");
    map.set(key, game.id);
  }
  return map;
}

export async function fetchScoreboardYmd(ymd) {
  const url = `${ESPN_SCOREBOARD}?dates=${ymd}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status} for ${ymd}`);
  return res.json();
}

export async function fetchSummaryForEvent(eventId) {
  const url = `${ESPN_SUMMARY}?event=${eventId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN summary HTTP ${res.status} for ${eventId}`);
  return res.json();
}

/**
 * Home/away team_ids from scoreboard competition + abbrev mapping.
 */
export function homeAwayTeamIds(comp, aliases, abbrevToTeamId, verbose, label) {
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const ah = home?.team?.abbreviation;
  const aa = away?.team?.abbreviation;
  const tidH = espnAbbrevToTeamId(ah, aliases, abbrevToTeamId);
  const tidA = espnAbbrevToTeamId(aa, aliases, abbrevToTeamId);
  if (!tidH || !tidA) {
    if (verbose)
      console.warn(
        `Skip (unmapped abbrevs): ${ah} vs ${aa} — ${label ?? ""}`
      );
    return null;
  }
  return { tidHome: tidH, tidAway: tidA, abbrevHome: ah, abbrevAway: aa };
}
