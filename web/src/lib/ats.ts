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
   * Regional bracket bold line: spread cover, advances (same controller, no line), or won the game.
   */
  bracketHeadline: string;
  /**
   * Regional bracket secondary line: winner margin + who controls the winner going forward.
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

/**
 * Pool owner user id for `teamId`'s slot as they enter `game` (before this game's outcome).
 * Draft pick if no feeder; otherwise the controller inherited from the settled feeder chain.
 */
export function poolOwnerUserIdEnteringGameForTeam(
  game: BracketGame,
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): string {
  const gm = gameMap(games);
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  const side: "side_a" | "side_b" | null =
    ta === teamId ? "side_a" : tb === teamId ? "side_b" : null;
  if (!side) return "";
  return resolvePoolOwnerEnteringGameSide(
    game,
    side,
    games,
    results,
    ownershipRows,
    teamsById
  );
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
  const samePoolControllerEntering = Boolean(oa && ob && oa === ob);

  const ncaaWinnerId = sa > sb ? ta : tb;
  const fav = game.favorite_team_id;
  const spread = game.spread_from_favorite_perspective;
  const noLine = fav == null || spread == null;

  const scoreSummary = `${abbrev(ta)} ${sa}, ${abbrev(tb)} ${sb}`;
  const winMargin = Math.abs(sa - sb);
  const winWord = winMargin === 1 ? "point" : "points";
  const wonByPhrase = `${abbrev(ncaaWinnerId)} won by ${winMargin} ${winWord}`;

  let coveredTeamId: string;
  let poolOwnerUserId: string;
  let favoriteId: string;
  let dogId: string;
  let marginFromFavorite: number;
  let message: string;

  if (noLine) {
    coveredTeamId = ncaaWinnerId;
    const winSide = sideForTeam(game, ncaaWinnerId, gm, results);
    if (samePoolControllerEntering) {
      poolOwnerUserId = oa;
    } else {
      poolOwnerUserId =
        resolvePoolOwnerEnteringGameSide(
          game,
          winSide,
          games,
          results,
          ownershipRows,
          teamsById
        ) || ownerOf(ncaaWinnerId, teamToUser);
    }
    favoriteId = fav ?? ta;
    dogId = fav === ta ? tb : ta;
    marginFromFavorite = sa - sb;
    message = samePoolControllerEntering
      ? `${abbrev(ncaaWinnerId)} advances. ${wonByPhrase}. The final score was ${scoreSummary}.`
      : `${wonByPhrase}. The final score was ${scoreSummary}.`;
  } else {
    const dog = fav === ta ? tb : ta;
    const favScore = fav === ta ? sa : sb;
    const dogScore = fav === ta ? sb : sa;
    const line = Math.abs(spread);

    if (dogScore > favScore) {
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

    if (samePoolControllerEntering) {
      poolOwnerUserId = oa;
    }

    marginFromFavorite = fav === ta ? sa - sb : sb - sa;
    favoriteId = fav;
    dogId = dog;
    const opponentId = coveredTeamId === ta ? tb : ta;
    const coveredWonNcaa = coveredTeamId === ncaaWinnerId;
    const marginPhrase = coveredWonNcaa
      ? `${abbrev(coveredTeamId)} won by ${winMargin} ${winWord}`
      : `${abbrev(coveredTeamId)} lost by ${winMargin} ${winWord}`;
    const coverLead = `${abbrev(coveredTeamId)} covered the spread vs. ${abbrev(opponentId)}!`;
    message = `${coverLead} ${marginPhrase}. The final score was ${scoreSummary}.`;
  }

  const winAbbrev = abbrev(ncaaWinnerId);
  const ctrlLabel = poolOwnerUserId ? displayName(poolOwnerUserId) : "—";

  let bracketHeadline: string;
  if (noLine) {
    bracketHeadline = samePoolControllerEntering
      ? `${winAbbrev} advances!`
      : `${winAbbrev} won the game!`;
  } else {
    const other = coveredTeamId === ta ? tb : ta;
    bracketHeadline = `${abbrev(coveredTeamId)} covered the spread vs. ${abbrev(other)}!`;
  }

  const winnerCovered = coveredTeamId === ncaaWinnerId || noLine;
  const marginPart = winnerCovered
    ? `${winAbbrev} won by ${winMargin} ${winWord}`
    : `${winAbbrev} only won by ${winMargin} ${winWord}`;
  const controlPart = winnerCovered
    ? `${ctrlLabel} stays in control of ${winAbbrev}`
    : `${ctrlLabel} now controls ${winAbbrev}`;
  const bracketMarginLine = `${marginPart}. ${controlPart}.`;

  return {
    ncaaWinnerId,
    poolOwnerUserId,
    coveredTeamId,
    favoriteId,
    dogId,
    marginFromFavorite,
    message,
    bracketHeadline,
    bracketMarginLine,
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
