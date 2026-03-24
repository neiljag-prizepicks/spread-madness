import type { BracketGame, Team } from "../types";
import type { GroupMemberCap } from "./groupConstants";
import { LOGICAL_BRACKET_SLOTS } from "./groupConstants";

export type OwnershipUnit = {
  /** One team, or two (First Four opponents) that must share an owner. */
  teamIds: string[];
  /** Region used for balancing (game region for pairs; team.region for singles). */
  region: string;
};

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Split `totalPairs` indivisible FF pair-units across `memberCount` players as evenly as possible,
 * then shuffle who gets which count when `randomize` (fair lottery for who receives an extra pair).
 */
function distributeFfPairTargets(
  totalPairs: number,
  sortedUids: string[],
  randomize: boolean
): Map<string, number> {
  const n = sortedUids.length;
  const base = Math.floor(totalPairs / n);
  const rem = totalPairs % n;
  const counts = sortedUids.map((_, i) => (i < rem ? base + 1 : base));
  if (randomize) shuffleInPlace(counts);
  const m = new Map<string, number>();
  sortedUids.forEach((uid, i) => m.set(uid, counts[i]!));
  return m;
}

/**
 * Build atomic ownership units: First Four opponents are one unit (2 team ids);
 * all other teams are singletons (68 team ids → 4 pair-units + 60 singles = 64 units).
 */
export function buildOwnershipUnits(
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>
): OwnershipUnit[] {
  const ffGames = games.filter((g) => g.round === "first_four");
  const paired = new Set<string>();
  const units: OwnershipUnit[] = [];

  for (const g of ffGames) {
    const a = g.side_a.team_id;
    const b = g.side_b.team_id;
    if (a && b) {
      const pair = [a, b].sort((x, y) => x.localeCompare(y));
      units.push({ teamIds: pair, region: g.region });
      paired.add(a);
      paired.add(b);
    }
  }

  for (const id of [...allTeamIds].sort((a, b) => a.localeCompare(b))) {
    if (!paired.has(id)) {
      const t = teamsById.get(id);
      units.push({
        teamIds: [id],
        region: t?.region ?? "East",
      });
    }
  }

  const teamSum = units.reduce((s, u) => s + u.teamIds.length, 0);
  if (teamSum !== allTeamIds.length) {
    throw new Error(
      `Ownership units (${teamSum} team ids) do not match roster (${allTeamIds.length}).`
    );
  }
  return units;
}

/** Map team_id -> other team_id in same FF pair, if any. */
export function buildFfPairMap(games: BracketGame[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of games.filter((x) => x.round === "first_four")) {
    const a = g.side_a.team_id;
    const b = g.side_b.team_id;
    if (a && b) {
      m.set(a, b);
      m.set(b, a);
    }
  }
  return m;
}

/**
 * Assign logical units when everyone gets the same count (L % N === 0).
 * Full 64-slot bracket uses {@link assignUnitsBalanced}; mid-tournament uses this with fewer units.
 */
export function assignUnitsBalancedForUnitList(
  units: OwnershipUnit[],
  memberUids: string[],
  memberCap: GroupMemberCap,
  randomize: boolean
): { team_id: string; user_id: string }[] {
  const logicalUnitTotal = units.length;
  const rosterTeamCount = units.reduce((s, u) => s + u.teamIds.length, 0);

  if (logicalUnitTotal === 0) {
    throw new Error("No assignable teams for this bracket state.");
  }
  if (logicalUnitTotal % memberCap !== 0) {
    throw new Error(
      `Cannot split ${logicalUnitTotal} logical units evenly across ${memberCap} members.`
    );
  }

  const unitsPerPlayer = logicalUnitTotal / memberCap;

  if (units.some((u) => u.teamIds.length > 2)) {
    throw new Error("Invalid unit: more than 2 team ids in one unit.");
  }
  const ffUnits = units.filter((u) => u.teamIds.length === 2);
  const singleUnits = units.filter((u) => u.teamIds.length === 1);
  const pairCount = ffUnits.length;

  if (pairCount > 0 && unitsPerPlayer === 1) {
    throw new Error(
      "A group cannot give everyone exactly one logical slot while keeping First Four pairs together. Use a larger group size."
    );
  }

  /** Units per region (FF pair = 1 unit in its region). */
  const unitsPerRegion = new Map<string, number>();
  for (const u of units) {
    unitsPerRegion.set(u.region, (unitsPerRegion.get(u.region) ?? 0) + 1);
  }
  const targetUnitsPerRegionPerPlayer = new Map<string, number>();
  const regMin = new Map<string, number>();
  const regMax = new Map<string, number>();
  for (const [reg, n] of unitsPerRegion) {
    targetUnitsPerRegionPerPlayer.set(reg, n / memberCap);
    regMin.set(reg, Math.floor(n / memberCap));
    regMax.set(reg, Math.ceil(n / memberCap));
  }
  const regionKeys = [...unitsPerRegion.keys()].sort((a, b) => a.localeCompare(b));

  const uids = [...memberUids].sort((a, b) => a.localeCompare(b));

  const maxTries = randomize ? 48 : 1;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const ffPairsTarget = distributeFfPairTargets(pairCount, uids, randomize);
    const ffTargetSum = [...ffPairsTarget.values()].reduce((a, b) => a + b, 0);
    if (ffTargetSum !== pairCount) {
      throw new Error(
        `Internal: FF targets (${ffTargetSum}) != FF games (${pairCount}).`
      );
    }
    for (const uid of uids) {
      const t = ffPairsTarget.get(uid) ?? 0;
      if (t > unitsPerPlayer) {
        throw new Error(
          `Internal: player cannot hold ${t} FF pairs with only ${unitsPerPlayer} unit slots.`
        );
      }
    }

    const rows: { team_id: string; user_id: string }[] = [];
    const rawCount = new Map<string, number>();
    const unitCount = new Map<string, number>();
    const ffAssigned = new Map<string, number>();
    const regionUnitCount = new Map<string, Map<string, number>>();
    for (const u of uids) {
      rawCount.set(u, 0);
      unitCount.set(u, 0);
      ffAssigned.set(u, 0);
      const rm = new Map<string, number>();
      for (const r of regionKeys) rm.set(r, 0);
      regionUnitCount.set(u, rm);
    }

    let failed = false;

    const ffOrder = [...ffUnits];
    if (randomize) shuffleInPlace(ffOrder);
    else ffOrder.sort((a, b) => a.teamIds[0].localeCompare(b.teamIds[0]));

    for (const unit of ffOrder) {
      const need = (uid: string) => ffPairsTarget.get(uid) ?? 0;
      const r = unit.region;
      const rMax = regMax.get(r) ?? 0;
      const candidates = uids.filter((uid) => {
        const tgt = need(uid);
        const ru = regionUnitCount.get(uid)!;
        return (
          (ffAssigned.get(uid) ?? 0) < tgt &&
          (unitCount.get(uid) ?? 0) < unitsPerPlayer &&
          (rawCount.get(uid) ?? 0) + 2 <= 2 * tgt &&
          (ru.get(r) ?? 0) < rMax
        );
      });
      if (candidates.length === 0) {
        failed = true;
        break;
      }

      const targetR = targetUnitsPerRegionPerPlayer.get(r) ?? 0;
      let bestUid = candidates[0]!;
      let bestKey = Infinity;
      for (const uid of candidates) {
        const rc = rawCount.get(uid) ?? 0;
        const ru = regionUnitCount.get(uid)!;
        const afterRegionUnits = (ru.get(r) ?? 0) + 1;
        const regionImbalance = Math.abs(afterRegionUnits - targetR);
        const key =
          rc * 1_000_000 +
          regionImbalance * 100 +
          (ru.get(r) ?? 0);
        if (key < bestKey) {
          bestKey = key;
          bestUid = uid;
        }
      }

      for (const tid of unit.teamIds) {
        rows.push({ team_id: tid, user_id: bestUid });
      }
      rawCount.set(bestUid, (rawCount.get(bestUid) ?? 0) + 2);
      unitCount.set(bestUid, (unitCount.get(bestUid) ?? 0) + 1);
      ffAssigned.set(bestUid, (ffAssigned.get(bestUid) ?? 0) + 1);
      const rm = regionUnitCount.get(bestUid)!;
      rm.set(r, (rm.get(r) ?? 0) + 1);
    }

    if (failed) continue;

    const singleOrder = [...singleUnits];
    if (randomize) shuffleInPlace(singleOrder);
    else singleOrder.sort((a, b) => a.teamIds[0].localeCompare(b.teamIds[0]));

    for (const unit of singleOrder) {
      const r = unit.region;
      const rMax = regMax.get(r) ?? 0;
      const candidates = uids.filter((uid) => {
        const tgt = ffPairsTarget.get(uid) ?? 0;
        const ru = regionUnitCount.get(uid)!;
        return (
          (unitCount.get(uid) ?? 0) < unitsPerPlayer &&
          (rawCount.get(uid) ?? 0) + 1 <= unitsPerPlayer + tgt &&
          (ru.get(r) ?? 0) < rMax
        );
      });
      if (candidates.length === 0) {
        failed = true;
        break;
      }

      const targetR = targetUnitsPerRegionPerPlayer.get(r) ?? 0;
      let bestUid = candidates[0]!;
      let bestKey = Infinity;
      for (const uid of candidates) {
        const rc = rawCount.get(uid) ?? 0;
        const ru = regionUnitCount.get(uid)!;
        const afterRegionUnits = (ru.get(r) ?? 0) + 1;
        const regionImbalance = Math.abs(afterRegionUnits - targetR);
        const key =
          rc * 1_000_000 +
          regionImbalance * 100 +
          (ru.get(r) ?? 0);
        if (key < bestKey) {
          bestKey = key;
          bestUid = uid;
        }
      }

      for (const tid of unit.teamIds) {
        rows.push({ team_id: tid, user_id: bestUid });
      }
      rawCount.set(bestUid, (rawCount.get(bestUid) ?? 0) + 1);
      unitCount.set(bestUid, (unitCount.get(bestUid) ?? 0) + 1);
      const rm = regionUnitCount.get(bestUid)!;
      rm.set(r, (rm.get(r) ?? 0) + 1);
    }

    if (failed) continue;

    let regionOk = true;
    for (const uid of uids) {
      const ru = regionUnitCount.get(uid)!;
      for (const reg of regionKeys) {
        const c = ru.get(reg) ?? 0;
        if (c < (regMin.get(reg) ?? 0) || c > (regMax.get(reg) ?? 0)) {
          regionOk = false;
          break;
        }
      }
      if (!regionOk) break;
    }
    if (!regionOk) continue;

    const physicalOk = uids.every((uid) => {
      const tgt = ffPairsTarget.get(uid) ?? 0;
      return (
        (unitCount.get(uid) ?? 0) === unitsPerPlayer &&
        (rawCount.get(uid) ?? 0) === unitsPerPlayer + tgt
      );
    });

    if (physicalOk && rows.length === rosterTeamCount) return rows;
  }

  if (randomize) {
    return assignUnitsBalancedForUnitList(units, memberUids, memberCap, false);
  }

  throw new Error(
    "Could not assign teams with First Four pairs and region balance. Try again."
  );
}

/**
 * Assign 64 logical units: everyone gets (64÷N) units; physical team_id rows vary (FF pair = 2 rows).
 * Phase 1 assigns all FF pair-units using per-player targets; phase 2 assigns singles.
 */
export function assignUnitsBalanced(
  units: OwnershipUnit[],
  memberUids: string[],
  memberCap: GroupMemberCap,
  randomize: boolean
): { team_id: string; user_id: string }[] {
  const logicalUnitTotal = units.length;
  if (logicalUnitTotal !== LOGICAL_BRACKET_SLOTS) {
    throw new Error(
      `Expected ${LOGICAL_BRACKET_SLOTS} logical units, found ${logicalUnitTotal}.`
    );
  }
  return assignUnitsBalancedForUnitList(units, memberUids, memberCap, randomize);
}

/**
 * When L % N !== 0 and there are no First Four pair-units left to assign (typical mid-tournament).
 * Each member gets floor(L/N) or ceil(L/N) logical units; per-region counts stay within
 * floor/ceil(regionUnits/N) per member. Retries with shuffles when `randomize`.
 */
export function assignUnitsUnevenSinglesOnly(
  units: OwnershipUnit[],
  memberUids: string[],
  memberCap: GroupMemberCap,
  randomize: boolean
): { team_id: string; user_id: string }[] {
  if (units.some((u) => u.teamIds.length > 2)) {
    throw new Error("Invalid unit: more than 2 team ids in one unit.");
  }
  const ffUnits = units.filter((u) => u.teamIds.length === 2);
  if (ffUnits.length > 0) {
    throw new Error(
      "Uneven member counts with active First Four pairs are not supported. Wait until the play-in games finish or allow eliminated-team assignment."
    );
  }

  const L = units.length;
  const N = memberCap;
  if (L === 0 || N <= 0) throw new Error("Invalid assignment request.");
  if (L % N === 0) {
    return assignUnitsBalancedForUnitList(units, memberUids, memberCap, randomize);
  }

  const low = Math.floor(L / N);
  const high = Math.ceil(L / N);
  const numHigh = L - low * N;
  const rosterTeamCount = L;

  const unitsPerRegion = new Map<string, number>();
  for (const u of units) {
    unitsPerRegion.set(u.region, (unitsPerRegion.get(u.region) ?? 0) + 1);
  }
  const regionKeys = [...unitsPerRegion.keys()].sort((a, b) => a.localeCompare(b));
  const regMin = new Map<string, number>();
  const regMax = new Map<string, number>();
  for (const [reg, n] of unitsPerRegion) {
    regMin.set(reg, Math.floor(n / N));
    regMax.set(reg, Math.ceil(n / N));
  }
  const targetUnitsPerRegionPerPlayer = new Map<string, number>();
  for (const [reg, n] of unitsPerRegion) {
    targetUnitsPerRegionPerPlayer.set(reg, n / N);
  }

  let baseUids = [...memberUids].sort((a, b) => a.localeCompare(b));
  const maxTries = randomize ? 64 : 1;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const uids = [...baseUids];
    if (randomize) shuffleInPlace(uids);

    const maxUnits = new Map<string, number>();
    const highUids = new Set(uids.slice(0, numHigh));
    for (const uid of uids) {
      maxUnits.set(uid, highUids.has(uid) ? high : low);
    }

    const rows: { team_id: string; user_id: string }[] = [];
    const unitCount = new Map<string, number>();
    const regionUnitCount = new Map<string, Map<string, number>>();
    for (const uid of uids) {
      unitCount.set(uid, 0);
      const rm = new Map<string, number>();
      for (const r of regionKeys) rm.set(r, 0);
      regionUnitCount.set(uid, rm);
    }

    const singleOrder = [...units];
    if (randomize) shuffleInPlace(singleOrder);
    else
      singleOrder.sort((a, b) =>
        a.teamIds[0]!.localeCompare(b.teamIds[0]!)
      );

    let failed = false;
    for (const unit of singleOrder) {
      const r = unit.region;
      const tid = unit.teamIds[0]!;
      const targetR = targetUnitsPerRegionPerPlayer.get(r) ?? 0;
      const candidates = uids.filter((uid) => {
        if ((unitCount.get(uid) ?? 0) >= (maxUnits.get(uid) ?? 0)) return false;
        const ru = regionUnitCount.get(uid)!;
        if ((ru.get(r) ?? 0) >= (regMax.get(r) ?? 0)) return false;
        return true;
      });
      if (candidates.length === 0) {
        failed = true;
        break;
      }

      let bestUid = candidates[0]!;
      let bestKey = Infinity;
      for (const uid of candidates) {
        const uc = unitCount.get(uid) ?? 0;
        const ru = regionUnitCount.get(uid)!;
        const afterR = (ru.get(r) ?? 0) + 1;
        const regionImbalance = Math.abs(afterR - targetR);
        const key = uc * 1_000_000 + regionImbalance * 100 + (ru.get(r) ?? 0);
        if (key < bestKey) {
          bestKey = key;
          bestUid = uid;
        }
      }

      rows.push({ team_id: tid, user_id: bestUid });
      unitCount.set(bestUid, (unitCount.get(bestUid) ?? 0) + 1);
      const rm = regionUnitCount.get(bestUid)!;
      rm.set(r, (rm.get(r) ?? 0) + 1);
    }

    if (failed) continue;

    const totalsOk = uids.every((uid) => (unitCount.get(uid) ?? 0) === maxUnits.get(uid));
    if (!totalsOk || rows.length !== rosterTeamCount) continue;

    let regionOk = true;
    for (const uid of uids) {
      const ru = regionUnitCount.get(uid)!;
      for (const reg of regionKeys) {
        const c = ru.get(reg) ?? 0;
        if (c < (regMin.get(reg) ?? 0) || c > (regMax.get(reg) ?? 0)) {
          regionOk = false;
          break;
        }
      }
      if (!regionOk) break;
    }
    if (!regionOk) continue;

    const evenOk = uids.every((uid) => {
      const logical = unitCount.get(uid) ?? 0;
      return logical % 2 === 0;
    });
    if (!evenOk) continue;

    return rows;
  }

  throw new Error(
    "Could not find a fair uneven assignment. Try a different group size or shuffle again."
  );
}

/** Pick balanced assignment for arbitrary assignment-unit list (mid-tournament or full bracket). */
export function assignUnitsForAssignmentList(
  units: OwnershipUnit[],
  memberUids: string[],
  memberCap: GroupMemberCap,
  randomize: boolean
): { team_id: string; user_id: string }[] {
  if (units.length % memberCap === 0) {
    return assignUnitsBalancedForUnitList(units, memberUids, memberCap, randomize);
  }
  return assignUnitsUnevenSinglesOnly(units, memberUids, memberCap, randomize);
}

export function buildBalancedOwnership(
  games: BracketGame[],
  allTeamIds: string[],
  teamsById: Map<string, Team>,
  memberUids: string[],
  memberCap: GroupMemberCap,
  randomize: boolean
): { team_id: string; user_id: string }[] {
  const units = buildOwnershipUnits(games, allTeamIds, teamsById);
  return assignUnitsBalanced(units, memberUids, memberCap, randomize);
}

/**
 * Logical bracket slots for one user: physical team_id rows minus one per fully-owned FF pair
 * (each pair is 2 rows but counts as 1 slot).
 */
export function logicalBracketSlotsForUser(
  userId: string,
  rows: { team_id: string; user_id: string }[],
  ffPairMap: Map<string, string>
): number {
  const mine = rows.filter((r) => r.user_id === userId);
  const physical = mine.length;
  const ids = new Set(mine.map((r) => r.team_id));
  let ffPairsOwned = 0;
  for (const tid of ids) {
    const other = ffPairMap.get(tid);
    if (other && ids.has(other) && tid.localeCompare(other) < 0) ffPairsOwned++;
  }
  return physical - ffPairsOwned;
}
