import type { BracketGame, GameResult, Team } from "../types";
import type { GroupVisibility } from "./firestore/groupsApi";
import { gameMap, ncaaWinner, resolveTeamId } from "./resolveTeams";
import type { OwnershipUnit } from "./ownershipUnits";
import { buildOwnershipUnits } from "./ownershipUnits";

/**
 * Teams that lost a finalized NCAA game in this bracket (including First Four losers).
 */
export function getEliminatedTeamIds(
  games: BracketGame[],
  results: Map<string, GameResult>
): Set<string> {
  const gm = gameMap(games);
  const eliminated = new Set<string>();
  for (const g of games) {
    const w = ncaaWinner(g, gm, results);
    if (!w) continue;
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    if (!ta || !tb) continue;
    eliminated.add(ta === w ? tb : ta);
  }
  return eliminated;
}

/** Public pools always restrict; private pools allow eliminated teams only when admin enables it. */
export function shouldRestrictToSurvivingTeams(
  visibility: GroupVisibility,
  allowAssignEliminatedTeams?: boolean
): boolean {
  if (visibility === "public") return true;
  return allowAssignEliminatedTeams !== true;
}

export function assignableTeamIdsSet(
  allTeamIds: string[],
  games: BracketGame[],
  results: Map<string, GameResult>,
  restrictToSurvivors: boolean
): Set<string> {
  if (!restrictToSurvivors) return new Set(allTeamIds);
  const elim = getEliminatedTeamIds(games, results);
  return new Set(allTeamIds.filter((id) => !elim.has(id)));
}

/**
 * Ownership units for the assignment grid: drops eliminated teams; splits FF pair units
 * when only one FF team is still alive.
 */
export function buildAssignmentOwnershipUnits(
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>,
  assignable: Set<string>
): OwnershipUnit[] {
  const base = buildOwnershipUnits(games, allTeamIds, teamsById);
  const out: OwnershipUnit[] = [];
  for (const u of base) {
    if (u.teamIds.length === 2) {
      const [a, b] = u.teamIds;
      const aOk = assignable.has(a);
      const bOk = assignable.has(b);
      if (aOk && bOk) {
        out.push(u);
      } else if (aOk && !bOk) {
        const t = teamsById.get(a);
        out.push({ teamIds: [a], region: t?.region ?? u.region });
      } else if (!aOk && bOk) {
        const t = teamsById.get(b);
        out.push({ teamIds: [b], region: t?.region ?? u.region });
      }
    } else {
      const id = u.teamIds[0]!;
      if (assignable.has(id)) out.push(u);
    }
  }
  return out;
}

/** Physical `ownership` rows (empty user_id) for every team id in assignment units. */
export function ownershipSkeletonFromAssignmentUnits(
  units: OwnershipUnit[]
): { team_id: string; user_id: string }[] {
  const rows: { team_id: string; user_id: string }[] = [];
  for (const u of units) {
    for (const tid of u.teamIds) {
      rows.push({ team_id: tid, user_id: "" });
    }
  }
  rows.sort((a, b) => a.team_id.localeCompare(b.team_id));
  return rows;
}

/** Align persisted Firestore rows to the current assignment skeleton (drops eliminated teams). */
export function reconcileOwnershipToAssignmentSkeleton(
  persisted: { team_id: string; user_id: string }[],
  skeletonRows: { team_id: string; user_id: string }[]
): { team_id: string; user_id: string }[] {
  const m = new Map(persisted.map((r) => [r.team_id, r.user_id]));
  return skeletonRows.map((r) => ({
    team_id: r.team_id,
    user_id: m.get(r.team_id) ?? "",
  }));
}

export function fairTargetLogicalUnitsPerMemberPerRegionFromUnits(
  units: OwnershipUnit[],
  memberCap: number
): Map<string, number> {
  const unitsPerRegion = new Map<string, number>();
  for (const u of units) {
    unitsPerRegion.set(u.region, (unitsPerRegion.get(u.region) ?? 0) + 1);
  }
  const targets = new Map<string, number>();
  for (const [reg, n] of unitsPerRegion) {
    targets.set(reg, memberCap > 0 ? n / memberCap : 0);
  }
  return targets;
}

export function assignablePhysicalTeamRowCount(units: OwnershipUnit[]): number {
  return units.reduce((s, u) => s + u.teamIds.length, 0);
}

/** Drop ownership rows for eliminated teams when restricting to survivors (pool UI + scoring). */
export function filterOwnershipRowsForSurvivorPools(
  rows: { team_id: string; user_id: string }[],
  allTeamIds: string[],
  games: BracketGame[],
  results: Map<string, GameResult>,
  restrictToSurvivors: boolean
): { team_id: string; user_id: string }[] {
  if (!restrictToSurvivors) return rows;
  const keep = assignableTeamIdsSet(allTeamIds, games, results, true);
  return rows.filter((r) => keep.has(r.team_id));
}

export function regionMinMaxLogicalUnitsPerMember(
  units: OwnershipUnit[],
  memberCap: number
): Map<string, { min: number; max: number }> {
  const unitsPerRegion = new Map<string, number>();
  for (const u of units) {
    unitsPerRegion.set(u.region, (unitsPerRegion.get(u.region) ?? 0) + 1);
  }
  const m = new Map<string, { min: number; max: number }>();
  for (const [reg, n] of unitsPerRegion) {
    const low = Math.floor(n / memberCap);
    const high = Math.ceil(n / memberCap);
    m.set(reg, { min: low, max: high });
  }
  return m;
}
