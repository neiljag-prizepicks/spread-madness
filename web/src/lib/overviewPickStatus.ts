import type { BracketGame, GameResult, Team, User } from "../types";
import {
  computePoolOutcome,
  getOwnerUserIdForSide,
} from "./ats";
import { isPoolSettledForGame } from "./gameResult";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";
import { userInitialsFromUser } from "./userInitials";
import { gameMap, resolveTeamId } from "./resolveTeams";

export type OverviewSlotStatus =
  | "pending"
  | "live"
  | "hit"
  | "miss"
  | "neutral";

export type OverviewSlotVisual = {
  status: OverviewSlotStatus;
  /** Two-letter initials; empty when pending or unknown */
  initials: string;
};

/** Matches overview colors: green won pool / red lost ATS / purple not involved. */
export type ViewerPoolOutcomeTone = "hit" | "miss" | "neutral";

export function viewerPoolOutcomeTone(
  viewerId: string | null | undefined,
  poolOwnerUserId: string,
  ta: string,
  tb: string,
  ownershipRows: OwnershipRow[]
): ViewerPoolOutcomeTone {
  const teamToUser = buildTeamToUserId(ownershipRows);
  const userSides = [ta, tb];
  const userInGame = viewerId
    ? userSides.some((tid) => teamToUser.get(tid) === viewerId)
    : false;
  if (viewerId && poolOwnerUserId === viewerId) return "hit";
  if (viewerId && userInGame) return "miss";
  return "neutral";
}

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
 * True while the game is not pool-settled but the scoreboard has started
 * (or status is explicitly in progress). Catches partial JSON and clock+scores
 * rows that were previously mis-inferred as final.
 */
export function isOverviewLiveResult(
  r: GameResult | undefined,
  ta: string,
  tb: string
): boolean {
  if (!r) return false;
  if (r.status === "in_progress") return true;
  if (isPoolSettledForGame(r, ta, tb)) return false;
  const sa = r.scores[ta];
  const sb = r.scores[tb];
  return sa != null || sb != null;
}

function initialsForUserId(
  uid: string | null,
  usersById: Map<string, User>,
  displayName: (userId: string) => string
): string {
  if (!uid) return "—";
  const u = usersById.get(uid);
  const label = u?.display_name?.trim() || displayName(uid);
  if (!label || label === "—") return "—";
  return (
    userInitialsFromUser(u, displayName(uid)) ||
    label.slice(0, 2).toUpperCase()
  );
}

/**
 * Overview birdseye cell: yellow live / green you / red beat you / purple other / empty pending.
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
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  if (!ta || !tb) return { status: "pending", initials: "" };

  const r = results.get(game.id);

  if (isOverviewLiveResult(r, ta, tb)) {
    const uidA = getOwnerUserIdForSide(
      game,
      "side_a",
      allGames,
      results,
      ownershipRows
    );
    const uidB = getOwnerUserIdForSide(
      game,
      "side_b",
      allGames,
      results,
      ownershipRows
    );
    const ia = initialsForUserId(uidA, usersById, displayName);
    const ib = initialsForUserId(uidB, usersById, displayName);
    return { status: "live", initials: `${ia}·${ib}` };
  }

  const sides = isGameFinal(game, gm, results);
  if (!sides) return { status: "pending", initials: "" };

  const { ta: fa, tb: fb } = sides;
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
    userInitialsFromUser(
      usersById.get(outcome.poolOwnerUserId),
      poolOwnerName
    ) || outcome.poolOwnerUserId.slice(0, 2).toUpperCase();

  const tone = viewerPoolOutcomeTone(
    viewerId,
    outcome.poolOwnerUserId,
    fa,
    fb,
    ownershipRows
  );

  if (tone === "hit" && viewerId) {
    const selfName =
      usersById.get(viewerId)?.display_name ?? displayName(viewerId);
    const ini =
      userInitialsFromUser(usersById.get(viewerId), selfName) ||
      viewerId.slice(0, 2).toUpperCase();
    return {
      status: "hit",
      initials: ini,
    };
  }

  if (tone === "miss") {
    return { status: "miss", initials: poolOwnerInitials };
  }

  return { status: "neutral", initials: poolOwnerInitials };
}
