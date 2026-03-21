import type { BracketGame, GameResult, Team, User } from "../types";
import { computePoolOutcome, getPoolOwnerForSide } from "./ats";
import type { OwnershipRow } from "./ownershipMap";
import { getTeamPoolControlSnapshot } from "./myTeams";
import { gameMap, resolveTeamId } from "./resolveTeams";

/**
 * Round is treated as not started until at least one game has a scheduled tip in the past.
 * Missing or unparsable tip times count as "not set yet".
 */
function isRoundNotYetStarted(
  round: BracketGame["round"],
  games: BracketGame[],
  nowMs: number
): boolean {
  const gs = games.filter((g) => g.round === round);
  if (gs.length === 0) return true;
  return gs.every((g) => {
    const tip = g.scheduled_tip_utc;
    if (tip == null || String(tip).trim() === "") return true;
    const t = Date.parse(tip);
    if (Number.isNaN(t)) return true;
    return t > nowMs;
  });
}

function countTeamsControlledInRound(
  userId: string,
  round: BracketGame["round"],
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[]
): number {
  const gm = gameMap(games);
  const controlled = new Set<string>();
  for (const g of games) {
    if (g.round !== round) continue;
    for (const side of ["side_a", "side_b"] as const) {
      const tid = resolveTeamId(g, side, gm, results, new Set());
      if (!tid) continue;
      const owner = getPoolOwnerForSide(
        g,
        side,
        games,
        results,
        ownershipRows
      );
      if (owner === userId) controlled.add(tid);
    }
  }
  return controlled.size;
}

function coverAttemptsAndCoversForUser(
  userId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): { attempts: number; covers: number } {
  const gm = gameMap(games);
  let attempts = 0;
  let covers = 0;
  const dn = (id: string) => id;

  for (const g of games) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    if (!ta || !tb) continue;

    const oa = getPoolOwnerForSide(g, "side_a", games, results, ownershipRows);
    const ob = getPoolOwnerForSide(g, "side_b", games, results, ownershipRows);
    const participates = oa === userId || ob === userId;
    if (!participates) continue;

    const out = computePoolOutcome(
      g,
      games,
      results,
      ownershipRows,
      teamsById,
      dn
    );
    if (!out) continue;

    attempts += 1;
    const coveredSide: "side_a" | "side_b" =
      out.coveredTeamId === ta ? "side_a" : "side_b";
    const coverOwner = getPoolOwnerForSide(
      g,
      coveredSide,
      games,
      results,
      ownershipRows
    );
    if (coverOwner === userId) covers += 1;
  }

  return { attempts, covers };
}

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  /** Teams the user currently controls (alive in NCAA + pool controller). */
  teamsInControl: number;
  /** 0–1 when the user has at least one finalized ATS game; otherwise null. */
  coverRate: number | null;
  /** null when that round has not started yet (all tips unset or still in the future). */
  roundOf32: number | null;
  sweet16: number | null;
  elite8: number | null;
  finalFour: number | null;
  championship: number | null;
};

export function buildLeaderboardRows(
  users: User[],
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): LeaderboardRow[] {
  const teamIds = [...teamsById.keys()];
  const nowMs = Date.now();
  const r32Live = !isRoundNotYetStarted("round_of_32", games, nowMs);
  const s16Live = !isRoundNotYetStarted("sweet_16", games, nowMs);
  const e8Live = !isRoundNotYetStarted("elite_8", games, nowMs);
  const ffLive = !isRoundNotYetStarted("final_four", games, nowMs);
  const champLive = !isRoundNotYetStarted("championship", games, nowMs);

  return users.map((u) => {
    let teamsInControl = 0;
    for (const teamId of teamIds) {
      const snap = getTeamPoolControlSnapshot(
        teamId,
        games,
        results,
        ownershipRows
      );
      if (snap?.alive && snap.controllerUserId === u.id) teamsInControl += 1;
    }

    const { attempts, covers } = coverAttemptsAndCoversForUser(
      u.id,
      games,
      results,
      ownershipRows,
      teamsById
    );

    return {
      userId: u.id,
      displayName: u.display_name,
      teamsInControl,
      coverRate: attempts > 0 ? covers / attempts : null,
      roundOf32: r32Live
        ? countTeamsControlledInRound(
            u.id,
            "round_of_32",
            games,
            results,
            ownershipRows
          )
        : null,
      sweet16: s16Live
        ? countTeamsControlledInRound(
            u.id,
            "sweet_16",
            games,
            results,
            ownershipRows
          )
        : null,
      elite8: e8Live
        ? countTeamsControlledInRound(
            u.id,
            "elite_8",
            games,
            results,
            ownershipRows
          )
        : null,
      finalFour: ffLive
        ? countTeamsControlledInRound(
            u.id,
            "final_four",
            games,
            results,
            ownershipRows
          )
        : null,
      championship: champLive
        ? countTeamsControlledInRound(
            u.id,
            "championship",
            games,
            results,
            ownershipRows
          )
        : null,
    };
  });
}

export type LeaderboardSortKey =
  | "displayName"
  | "teamsInControl"
  | "coverRate"
  | "roundOf32"
  | "sweet16"
  | "elite8"
  | "finalFour"
  | "championship";
