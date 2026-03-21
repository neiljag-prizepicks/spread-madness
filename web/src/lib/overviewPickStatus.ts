import type { BracketGame, GameResult, Team, User } from "../types";
import { computePoolOutcome, getOwnerDisplayForSide } from "./ats";
import { isPoolSettledForGame } from "./gameResult";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";
import { userInitialsFromDisplayName } from "./userInitials";
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

function initialsFromOwnerLabel(label: string): string {
  if (!label || label === "—") return "—";
  return (
    userInitialsFromDisplayName(label) || label.slice(0, 2).toUpperCase()
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
    const nameA = getOwnerDisplayForSide(
      game,
      "side_a",
      allGames,
      results,
      ownershipRows,
      displayName
    );
    const nameB = getOwnerDisplayForSide(
      game,
      "side_b",
      allGames,
      results,
      ownershipRows,
      displayName
    );
    const ia = initialsFromOwnerLabel(nameA);
    const ib = initialsFromOwnerLabel(nameB);
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
    userInitialsFromDisplayName(poolOwnerName) ||
    outcome.poolOwnerUserId.slice(0, 2).toUpperCase();

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
      userInitialsFromDisplayName(selfName) ||
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
