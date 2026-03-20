import type { BracketGame, GameResult, Team, User } from "../types";
import { computePoolOutcome } from "./ats";
import { isPoolSettledForGame } from "./gameResult";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";
import { userInitialsFromDisplayName } from "./userInitials";
import { gameMap, resolveTeamId } from "./resolveTeams";

export type OverviewSlotStatus = "pending" | "hit" | "miss" | "neutral";

export type OverviewSlotVisual = {
  status: OverviewSlotStatus;
  /** Two-letter initials; empty when pending or unknown */
  initials: string;
};

function isGameFinal(
  game: BracketGame,
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>
): { ta: string; tb: string } | null {
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  const r = results.get(game.id);
  if (!ta || !tb || !isPoolSettledForGame(r, ta, tb)) return null;
  return { ta, tb };
}

/**
 * Overview birdseye cell: green you / red beat you / purple other winner / empty pending.
 */
export function overviewSlotVisual(
  game: BracketGame,
  viewerId: string | null,
  allGames: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>,
  displayName: (userId: string) => string
): OverviewSlotVisual {
  const gm = gameMap(allGames);
  const sides = isGameFinal(game, gm, results);
  if (!sides) return { status: "pending", initials: "" };

  const { ta, tb } = sides;
  const outcome = computePoolOutcome(
    game,
    allGames,
    results,
    ownershipRows,
    teamsById,
    displayName
  );
  if (!outcome) return { status: "neutral", initials: "" };

  const poolOwnerName =
    usersById.get(outcome.poolOwnerUserId)?.display_name ??
    displayName(outcome.poolOwnerUserId);
  const poolOwnerInitials =
    userInitialsFromDisplayName(poolOwnerName) ||
    outcome.poolOwnerUserId.slice(0, 2).toUpperCase();

  const teamToUser = buildTeamToUserId(ownershipRows);
  const userSides = [ta, tb];
  const userInGame = viewerId
    ? userSides.some((tid) => teamToUser.get(tid) === viewerId)
    : false;

  if (viewerId && outcome.poolOwnerUserId === viewerId) {
    const selfName =
      usersById.get(viewerId)?.display_name ?? displayName(viewerId);
    const ini =
      userInitialsFromDisplayName(selfName) ||
      viewerId.slice(0, 2).toUpperCase();
    return {
      status: "hit",
      initials: ini,
    };
  }

  if (viewerId && userInGame) {
    return { status: "miss", initials: poolOwnerInitials };
  }

  return { status: "neutral", initials: poolOwnerInitials };
}
