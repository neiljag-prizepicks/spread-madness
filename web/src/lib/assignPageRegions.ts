import type { BracketGame, GameSide, Team } from "../types";
import type { GroupMemberCap } from "./groupConstants";
import { buildOwnershipUnits, type OwnershipUnit } from "./ownershipUnits";
import type { OwnershipRow } from "./ownershipMap";

/**
 * One row in the region-tabbed assign grid. First Four opponents that share a seed
 * line (feeder `first_four` → that region’s R64 slot) share one dropdown (`isPair`);
 * `representativeTeamId` is used with `updateTeamOwner`. This covers both R64
 * placeholders (`source_game_id`) and schedules that list only one FF team id on R64.
 */
export type RegionAssignRow = {
  key: string;
  representativeTeamId: string;
  teamIds: string[];
  label: string;
  isPair: boolean;
};

/** Canonical sort: East, Midwest, South, West, then any others alphabetically. */
const REGION_ORDER = ["East", "Midwest", "South", "West"];

function sortRegions(regions: string[]): string[] {
  return [...regions].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
}

export function tabRegionsFromGames(games: BracketGame[]): string[] {
  const s = new Set<string>();
  for (const g of games) {
    if (g.round === "round_of_64") s.add(g.region);
  }
  return sortRegions([...s]);
}

/**
 * One side of an R64 game: either a single team or the two First Four opponents
 * that share the seed line (winner advances as that seed).
 */
type RoundOf64Slot =
  | { kind: "pair"; teamIds: [string, string] }
  | { kind: "single"; teamId: string | null };

function resolveRoundOf64Slot(
  side: GameSide,
  gamesById: Map<string, BracketGame>
): RoundOf64Slot {
  if (side.team_id) {
    return { kind: "single", teamId: side.team_id };
  }
  if (side.source_game_id) {
    const src = gamesById.get(side.source_game_id);
    if (src?.round === "first_four") {
      const a = src.side_a.team_id;
      const b = src.side_b.team_id;
      if (a && b) {
        const sorted = [a, b].sort((x, y) => x.localeCompare(y)) as [
          string,
          string,
        ];
        return { kind: "pair", teamIds: sorted };
      }
    }
  }
  return { kind: "single", teamId: null };
}

/** Stable key for a First Four pair (two team ids), regardless of argument order. */
function canonicalFfPairKey(idA: string, idB: string): string {
  return [idA, idB].sort((x, y) => x.localeCompare(y)).join("\0");
}

function pushPairRow(
  rows: RegionAssignRow[],
  teamIdA: string,
  teamIdB: string,
  teamsById: Map<string, Team>
): void {
  const sortedPair = [teamIdA, teamIdB].sort((x, y) =>
    x.localeCompare(y)
  );
  const t1 = teamsById.get(sortedPair[0]!);
  const t2 = teamsById.get(sortedPair[1]!);
  const label =
    t1 && t2
      ? `${t1.seed === t2.seed ? t1.seed : Math.min(t1.seed, t2.seed)}. ${t1.abbrev}/${t2.abbrev}`
      : `${sortedPair[0]} / ${sortedPair[1]}`;
  rows.push({
    key: `pair-${sortedPair[0]}-${sortedPair[1]}`,
    representativeTeamId: sortedPair[0]!,
    teamIds: sortedPair,
    label,
    isPair: true,
  });
}

/** Minimum seed among physical teams in the row; TBD / unknown teams sort last. */
function rowSortSeed(row: RegionAssignRow, teamsById: Map<string, Team>): number {
  if (row.teamIds.length === 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const tid of row.teamIds) {
    const t = teamsById.get(tid);
    if (t != null) min = Math.min(min, t.seed);
  }
  return min;
}

export function buildRegionAssignRows(
  region: string,
  games: BracketGame[],
  teamsById: Map<string, Team>,
  ffPairMap: Map<string, string>
): RegionAssignRow[] {
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const r64 = games.filter(
    (g) => g.round === "round_of_64" && g.region === region
  );
  const rows: RegionAssignRow[] = [];
  /** Avoid duplicate rows when R64 lists one FF team id but not both (e.g. W11A vs W06). */
  const emittedFfPairKeys = new Set<string>();

  const tryEmitFfPair = (idA: string, idB: string): void => {
    const k = canonicalFfPairKey(idA, idB);
    if (emittedFfPairKeys.has(k)) return;
    emittedFfPairKeys.add(k);
    pushPairRow(rows, idA, idB, teamsById);
  };

  for (const g of r64) {
    const slotA = resolveRoundOf64Slot(g.side_a, gamesById);
    const slotB = resolveRoundOf64Slot(g.side_b, gamesById);
    const ta = g.side_a.team_id;
    const tb = g.side_b.team_id;

    // Legacy: both R64 sides list the two FF opponents directly (no source_game_id).
    if (
      slotA.kind === "single" &&
      slotB.kind === "single" &&
      ta &&
      tb &&
      ffPairMap.get(ta) === tb
    ) {
      tryEmitFfPair(ta, tb);
      continue;
    }

    for (const slot of [slotA, slotB]) {
      if (slot.kind === "pair") {
        tryEmitFfPair(slot.teamIds[0], slot.teamIds[1]);
        continue;
      }
      const tid = slot.teamId;
      if (!tid) {
        rows.push({
          key: `${g.id}-tbd-${rows.length}`,
          representativeTeamId: "",
          teamIds: [],
          label: "TBD",
          isPair: false,
        });
        continue;
      }
      // First Four: feeder lists only one team id on R64 (e.g. W11A vs W06); pair lives in ffPairMap.
      const ffOther = ffPairMap.get(tid);
      if (ffOther) {
        tryEmitFfPair(tid, ffOther);
        continue;
      }
      const t = teamsById.get(tid);
      const label = t ? `${t.seed}. ${t.school} ${t.mascot}` : tid;
      rows.push({
        key: tid,
        representativeTeamId: tid,
        teamIds: [tid],
        label,
        isPair: false,
      });
    }
  }
  rows.sort((a, b) => {
    const sa = rowSortSeed(a, teamsById);
    const sb = rowSortSeed(b, teamsById);
    if (sa !== sb) return sa - sb;
    return a.key.localeCompare(b.key);
  });
  return rows;
}

/** NCAA: one region’s round-of-64 field is 16 seeds (each grid row is one seed line for the admin). */
export const REGION_SEED_LINE_COUNT = 16;

/**
 * Tab fraction: **assigned seed lines / seed lines to fill** (First Four pair = 1 line).
 * Denominator is {@link REGION_SEED_LINE_COUNT} unless the grid has extra rows (bad data).
 */
export function regionSeedSlotProgress(
  rows: RegionAssignRow[],
  local: OwnershipRow[]
): { assigned: number; total: number } {
  const m = new Map(local.map((r) => [r.team_id, r.user_id]));
  let assigned = 0;
  for (const row of rows) {
    if (row.teamIds.length === 0) continue;
    if (row.isPair && row.teamIds.length >= 2) {
      const a = row.teamIds[0]!;
      const b = row.teamIds[1]!;
      const ua = m.get(a) ?? "";
      const ub = m.get(b) ?? "";
      const ok =
        String(ua).trim() !== "" &&
        String(ub).trim() !== "" &&
        ua === ub;
      if (ok) assigned++;
    } else {
      const tid = row.teamIds[0]!;
      const u = m.get(tid);
      if (u != null && String(u).trim() !== "") assigned++;
    }
  }
  const total =
    rows.length > REGION_SEED_LINE_COUNT
      ? rows.length
      : REGION_SEED_LINE_COUNT;
  return { assigned, total };
}

/** Fair logical-unit target per member per region (same basis as assignUnitsBalanced). */
export function fairTargetLogicalUnitsPerMemberPerRegion(
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>,
  memberCap: GroupMemberCap
): Map<string, number> {
  const units = buildOwnershipUnits(games, allTeamIds, teamsById);
  const unitsPerRegion = new Map<string, number>();
  for (const u of units) {
    unitsPerRegion.set(u.region, (unitsPerRegion.get(u.region) ?? 0) + 1);
  }
  const targets = new Map<string, number>();
  for (const [reg, n] of unitsPerRegion) {
    targets.set(reg, n / memberCap);
  }
  return targets;
}

function ownerForUnit(
  unit: OwnershipUnit,
  local: OwnershipRow[]
): string | null {
  const m = new Map(local.map((r) => [r.team_id, r.user_id]));
  if (unit.teamIds.length === 1) {
    const u = m.get(unit.teamIds[0]!);
    return u != null && String(u).trim() !== "" ? u : null;
  }
  const a = m.get(unit.teamIds[0]!);
  const b = m.get(unit.teamIds[1]!);
  if (
    a == null ||
    b == null ||
    String(a).trim() === "" ||
    String(b).trim() === "" ||
    a !== b
  ) {
    return null;
  }
  return a;
}

/** How many logical units (FF pair = 1) this member holds in `region` in `local`. */
export function logicalUnitsOwnedInRegion(
  memberUid: string,
  region: string,
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>,
  local: OwnershipRow[]
): number {
  const units = buildOwnershipUnits(games, allTeamIds, teamsById);
  let n = 0;
  for (const u of units) {
    if (u.region !== region) continue;
    if (ownerForUnit(u, local) === memberUid) n++;
  }
  return n;
}

export function ownershipRowsEqual(
  a: OwnershipRow[],
  b: OwnershipRow[]
): boolean {
  if (a.length !== b.length) return false;
  const sort = (x: OwnershipRow[]) =>
    [...x].sort((p, q) => p.team_id.localeCompare(q.team_id));
  const sa = sort(a);
  const sb = sort(b);
  for (let i = 0; i < sa.length; i++) {
    if (
      sa[i]!.team_id !== sb[i]!.team_id ||
      sa[i]!.user_id !== sb[i]!.user_id
    ) {
      return false;
    }
  }
  return true;
}
