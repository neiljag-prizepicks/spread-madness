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
  /**
   * Full summary for My Teams cards: cover (when applicable) + margin + final score.
   */
  message: string;
  /**
   * Regional bracket matchup secondary line: scoreboard winner won by N (no final score sentence).
   */
  bracketMarginLine: string;
};

function ownerOf(teamId: string, teamToUser: Map<string, string>): string {
  return teamToUser.get(teamId) ?? "";
}

function sideForTeam(
  game: BracketGame,
  teamId: string,
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>
): "side_a" | "side_b" {
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  return ta === teamId ? "side_a" : "side_b";
}

/**
 * Pool controller for the team in `game.side` as they enter this game: draft pick if
 * no feeder, otherwise `poolOwnerUserId` from the settled feeder (recursive).
 */
function resolvePoolOwnerEnteringGameSide(
  game: BracketGame,
  side: "side_a" | "side_b",
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): string {
  const gm = gameMap(games);
  const teamToUser = buildTeamToUserId(ownershipRows);
  const tid = resolveTeamId(game, side, gm, results, new Set());
  if (!tid) return "";

  const feeder = findFeeder(games, game.id, side);
  if (!feeder) {
    return teamToUser.get(tid) ?? "";
  }

  const w = ncaaWinner(feeder, gm, results);
  if (w == null || w !== tid) {
    return teamToUser.get(tid) ?? "";
  }

  const out = computePoolOutcome(
    feeder,
    games,
    results,
    ownershipRows,
    teamsById,
    (id) => id
  );
  return out?.poolOwnerUserId ?? teamToUser.get(tid) ?? "";
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
  const oa = resolvePoolOwnerEnteringGameSide(
    game,
    "side_a",
    games,
    results,
    ownershipRows,
    teamsById
  );
  const ob = resolvePoolOwnerEnteringGameSide(
    game,
    "side_b",
    games,
    results,
    ownershipRows,
    teamsById
  );

  const abbrev = (id: string) => teamsById.get(id)?.abbrev ?? id;

  if (oa && ob && oa === ob) {
    const ncaaWinnerId = sa > sb ? ta : tb;
    const scoreSummary = `${abbrev(ta)} ${sa}, ${abbrev(tb)} ${sb}`;
    const winMargin = Math.abs(sa - sb);
    const winWord = winMargin === 1 ? "point" : "points";
    const wonByPhrase = `${abbrev(ncaaWinnerId)} won by ${winMargin} ${winWord}`;
    const msg = `${abbrev(ncaaWinnerId)} advances. ${wonByPhrase}. The final score was ${scoreSummary}.`;
    return {
      ncaaWinnerId,
      poolOwnerUserId: oa,
      coveredTeamId: ncaaWinnerId,
      favoriteId: ta,
      dogId: tb,
      marginFromFavorite: 0,
      message: msg,
      bracketMarginLine: `${wonByPhrase}.`,
    };
  }

  const fav = game.favorite_team_id;
  const spread = game.spread_from_favorite_perspective;

  if (!fav || spread == null) {
    const ncaaWinnerId = sa > sb ? ta : tb;
    const winSide = sideForTeam(game, ncaaWinnerId, gm, results);
    const owner =
      resolvePoolOwnerEnteringGameSide(
        game,
        winSide,
        games,
        results,
        ownershipRows,
        teamsById
      ) || ownerOf(ncaaWinnerId, teamToUser);
    const scoreSummary = `${abbrev(ta)} ${sa}, ${abbrev(tb)} ${sb}`;
    const winMargin = Math.abs(sa - sb);
    const winWord = winMargin === 1 ? "point" : "points";
    const wonByPhrase = `${abbrev(ncaaWinnerId)} won by ${winMargin} ${winWord}`;
    return {
      ncaaWinnerId,
      poolOwnerUserId: owner,
      coveredTeamId: ncaaWinnerId,
      favoriteId: fav ?? ta,
      dogId: fav === ta ? tb : ta,
      marginFromFavorite: sa - sb,
      message: `${wonByPhrase}. The final score was ${scoreSummary}.`,
      bracketMarginLine: `${wonByPhrase}.`,
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
    poolOwnerUserId =
      resolvePoolOwnerEnteringGameSide(
        game,
        sideForTeam(game, dog, gm, results),
        games,
        results,
        ownershipRows,
        teamsById
      ) || ownerOf(dog, teamToUser);
  } else {
    ncaaWinnerId = fav;
    const margin = favScore - dogScore;
    if (margin > line) {
      coveredTeamId = fav;
      poolOwnerUserId =
        resolvePoolOwnerEnteringGameSide(
          game,
          sideForTeam(game, fav, gm, results),
          games,
          results,
          ownershipRows,
          teamsById
        ) || ownerOf(fav, teamToUser);
    } else {
      coveredTeamId = dog;
      poolOwnerUserId =
        resolvePoolOwnerEnteringGameSide(
          game,
          sideForTeam(game, dog, gm, results),
          games,
          results,
          ownershipRows,
          teamsById
        ) || ownerOf(dog, teamToUser);
    }
  }

  const marginFromFavorite = fav === ta ? sa - sb : sb - sa;
  const opponentId = coveredTeamId === ta ? tb : ta;
  const scoreSummary = `${abbrev(ta)} ${sa}, ${abbrev(tb)} ${sb}`;
  const winMargin = Math.abs(sa - sb);
  const winWord = winMargin === 1 ? "point" : "points";
  const coveredWonNcaa = coveredTeamId === ncaaWinnerId;
  const marginPhrase = coveredWonNcaa
    ? `${abbrev(coveredTeamId)} won by ${winMargin} ${winWord}`
    : `${abbrev(coveredTeamId)} lost by ${winMargin} ${winWord}`;
  const coverLead = `${abbrev(coveredTeamId)} covered the spread vs. ${abbrev(opponentId)}!`;
  const msg = `${coverLead} ${marginPhrase}. The final score was ${scoreSummary}.`;

  return {
    ncaaWinnerId,
    poolOwnerUserId,
    coveredTeamId,
    favoriteId: fav,
    dogId: dog,
    marginFromFavorite,
    message: msg,
    bracketMarginLine: `${marginPhrase}.`,
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

/** User id shown as owner for `side` — same resolution as {@link getOwnerDisplayForSide}. */
export function getOwnerUserIdForSide(
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
  if (w == null || w !== tid) return null;

  const teamsById = new Map<string, Team>();
  const out = computePoolOutcome(
    feeder,
    games,
    results,
    ownershipRows,
    teamsById,
    (id) => id
  );
  const uid = out?.poolOwnerUserId ?? teamToUser.get(tid);
  return uid && uid !== "" ? uid : null;
}
