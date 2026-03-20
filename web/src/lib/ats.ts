import type { BracketGame, GameResult, Team } from "../types";
import { findFeeder, gameMap, ncaaWinner, resolveTeamId } from "./resolveTeams";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";

export type PoolOutcome = {
  ncaaWinnerId: string;
  poolOwnerUserId: string;
  coveredTeamId: string;
  favoriteId: string;
  dogId: string;
  marginFromFavorite: number;
  /** Product copy */
  message: string;
};

function ownerOf(teamId: string, teamToUser: Map<string, string>): string {
  return teamToUser.get(teamId) ?? "";
}

export function computePoolOutcome(
  game: BracketGame,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  displayName: (userId: string) => string
): PoolOutcome | null {
  const gm = gameMap(games);
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  if (!ta || !tb) return null;

  const r = results.get(game.id);
  if (r?.status !== "final") return null;
  const sa = r?.scores?.[ta];
  const sb = r?.scores?.[tb];
  if (sa == null || sb == null) return null;

  const teamToUser = buildTeamToUserId(ownershipRows);
  const oa = ownerOf(ta, teamToUser);
  const ob = ownerOf(tb, teamToUser);

  const abbrev = (id: string) => teamsById.get(id)?.abbrev ?? id;
  const school = (id: string) => teamsById.get(id)?.school ?? id;

  if (oa && ob && oa === ob) {
    const ncaaWinnerId = sa > sb ? ta : tb;
    const msg = `${abbrev(ncaaWinnerId)} advances. ${displayName(oa)} controls ${school(ncaaWinnerId)}.`;
    return {
      ncaaWinnerId,
      poolOwnerUserId: oa,
      coveredTeamId: ncaaWinnerId,
      favoriteId: ta,
      dogId: tb,
      marginFromFavorite: 0,
      message: msg,
    };
  }

  const fav = game.favorite_team_id;
  const spread = game.spread_from_favorite_perspective;

  if (!fav || spread == null) {
    const ncaaWinnerId = sa > sb ? ta : tb;
    const owner = ownerOf(ncaaWinnerId, teamToUser);
    return {
      ncaaWinnerId,
      poolOwnerUserId: owner,
      coveredTeamId: ncaaWinnerId,
      favoriteId: fav ?? ta,
      dogId: fav === ta ? tb : ta,
      marginFromFavorite: sa - sb,
      message: `No spread set — ${school(ncaaWinnerId)} wins. ${displayName(owner)} controls ${school(ncaaWinnerId)}.`,
    };
  }

  const dog = fav === ta ? tb : ta;
  const favScore = fav === ta ? sa : sb;
  const dogScore = fav === ta ? sb : sa;
  const line = Math.abs(spread);

  let ncaaWinnerId: string;
  let coveredTeamId: string;
  let poolOwnerUserId: string;

  if (dogScore > favScore) {
    ncaaWinnerId = dog;
    coveredTeamId = dog;
    poolOwnerUserId = ownerOf(dog, teamToUser);
  } else {
    ncaaWinnerId = fav;
    const margin = favScore - dogScore;
    if (margin > line) {
      coveredTeamId = fav;
      poolOwnerUserId = ownerOf(fav, teamToUser);
    } else {
      coveredTeamId = dog;
      poolOwnerUserId = ownerOf(dog, teamToUser);
    }
  }

  const marginFromFavorite = fav === ta ? sa - sb : sb - sa;
  const msg = `${abbrev(coveredTeamId)} covered the spread! ${displayName(poolOwnerUserId)} controls ${school(ncaaWinnerId)}.`;

  return {
    ncaaWinnerId,
    poolOwnerUserId,
    coveredTeamId,
    favoriteId: fav,
    dogId: dog,
    marginFromFavorite,
    message: msg,
  };
}

/** Who controls pool for `teamId` shown on `game.side` (after feeder wins). */
export function getPoolOwnerForSide(
  game: BracketGame,
  side: "side_a" | "side_b",
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[]
): string | null {
  const gm = gameMap(games);
  const tid = resolveTeamId(game, side, gm, results, new Set());
  if (!tid) return null;

  const teamToUser = buildTeamToUserId(ownershipRows);
  const feeder = findFeeder(games, game.id, side);

  if (!feeder) {
    return teamToUser.get(tid) ?? null;
  }

  const w = ncaaWinner(feeder, gm, results);
  if (w == null) return null;
  if (w !== tid) return null;

  const teamsById = new Map<string, Team>();
  const out = computePoolOutcome(
    feeder,
    games,
    results,
    ownershipRows,
    teamsById,
    (id) => id
  );
  return out?.poolOwnerUserId ?? teamToUser.get(tid) ?? null;
}

/** Owner label for UI: R64 direct pick, or pool controller from feeder if resolved. */
export function getOwnerDisplayForSide(
  game: BracketGame,
  side: "side_a" | "side_b",
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  displayName: (userId: string) => string
): string {
  const gm = gameMap(games);
  const tid = resolveTeamId(game, side, gm, results, new Set());
  if (!tid) return "—";

  const teamToUser = buildTeamToUserId(ownershipRows);
  const feeder = findFeeder(games, game.id, side);

  if (!feeder) {
    const u = teamToUser.get(tid);
    return u ? displayName(u) : "—";
  }

  const w = ncaaWinner(feeder, gm, results);
  if (w == null) return "—";
  if (w !== tid) return "—";

  const teamsById = new Map<string, Team>();
  const out = computePoolOutcome(
    feeder,
    games,
    results,
    ownershipRows,
    teamsById,
    displayName
  );
  return out ? displayName(out.poolOwnerUserId) : displayName(teamToUser.get(tid) ?? "");
}
