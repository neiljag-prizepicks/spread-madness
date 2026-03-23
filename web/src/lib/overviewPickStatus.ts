import type { BracketGame, GameResult, Team, User } from "../types";
import {
  computePoolOutcome,
  getOwnerUserIdForSide,
} from "./ats";
import { isPoolSettledForGame } from "./gameResult";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";
import { teamAbbrev } from "./teamLabels";
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
  /** Two-letter initials; empty when pending or unknown. For live games, compact "IA·IB" for aria/title. */
  initials: string;
  /** Live games only: stack side_a / side_b initials vertically in the cell. */
  livePair?: { a: string; b: string };
  /** In-progress game where the viewer owns one of the two sides (e.g. bolder initials in overview). */
  liveViewerInvolved?: boolean;
  /** Pending prize-path cell (see prizeMilestoneMarker); $ renders below the cell in overview. */
  prizeMarker?: boolean;
};

const PRIZE_MILESTONE_ROUNDS: ReadonlySet<BracketGame["round"]> = new Set([
  "sweet_16",
  "elite_8",
  "final_four",
  "championship",
]);

/** Sweet 16 through championship — games on the prize-payout path in overview. */
export function isPrizePayoutRoundOverview(game: BracketGame): boolean {
  return PRIZE_MILESTONE_ROUNDS.has(game.round);
}

/** aria-label for the $ rendered below prize-round overview cells. */
export function prizeDollarBelowAriaLabel(game: BracketGame): string {
  if (game.round === "sweet_16") {
    return `${game.id}: Sweet 16 — winner advances to Elite 8 (prize payouts)`;
  }
  if (game.round === "elite_8") {
    return `${game.id}: Elite Eight — prize payout round`;
  }
  if (game.round === "final_four") {
    return `${game.id}: Final Four — prize payout round`;
  }
  return `${game.id}: National championship — prize payout round`;
}

/** Accessible name when the grey $ is shown on a pending overview cell. */
export function overviewPrizeMarkerLabel(game: BracketGame): string {
  if (game.round === "sweet_16") {
    return `${game.id}: Sweet 16 winner advances to Elite 8 — prize rounds (not started)`;
  }
  return `${game.id}: Prize payouts start here (not started)`;
}

/**
 * True when this overview cell is on the path to prize rounds (Sweet 16 feeds Elite 8)
 * or is a direct prize milestone, and the game has not started (or teams not yet resolved).
 * Used for a grey "$" hint in birdseye.
 */
export function prizeMilestoneMarker(
  game: BracketGame,
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>
): boolean {
  if (!PRIZE_MILESTONE_ROUNDS.has(game.round)) return false;
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  if (!ta || !tb) return true;
  const r = results.get(game.id);
  if (isOverviewLiveResult(r, ta, tb)) return false;
  if (isGameFinal(game, gm, results)) return false;
  return true;
}

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
  if (!ta || !tb) {
    return {
      status: "pending",
      initials: "",
      prizeMarker: prizeMilestoneMarker(game, gm, results),
    };
  }

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
    const liveViewerInvolved = Boolean(
      viewerId && (uidA === viewerId || uidB === viewerId)
    );
    return {
      status: "live",
      initials: `${ia}·${ib}`,
      livePair: { a: ia, b: ib },
      liveViewerInvolved,
    };
  }

  const sides = isGameFinal(game, gm, results);
  if (!sides) {
    return {
      status: "pending",
      initials: "",
      prizeMarker: prizeMilestoneMarker(game, gm, results),
    };
  }

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

/** Desktop overview: "First L." style for pool owner / viewer. */
export function firstNameLastInitialFromUser(
  user: User | undefined,
  displayNameFallback: string
): string {
  const f = user?.first_name?.trim();
  const l = user?.last_name?.trim();
  if (f && l) {
    return `${f} ${l[0]}.`;
  }
  const dn = user?.display_name?.trim() || displayNameFallback.trim();
  if (!dn) return "";
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].length > 14 ? `${parts[0].slice(0, 11)}…` : parts[0];
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last[0]}.`;
}

/** Figma desktop: one line like "SIENA +28.5 vs. DUKE" (dog +points vs favorite). */
function matchupSpreadLine(
  game: BracketGame,
  ta: string,
  tb: string,
  teamsById: Map<string, Team>
): string {
  const fav = game.favorite_team_id;
  const sp = game.spread_from_favorite_perspective;
  const a = teamAbbrev(ta, teamsById);
  const b = teamAbbrev(tb, teamsById);
  if (fav == null || sp == null) {
    return `${a} vs. ${b}`;
  }
  const dog = fav === ta ? tb : ta;
  const dogAbbr = teamAbbrev(dog, teamsById);
  const favAbbr = teamAbbrev(fav, teamsById);
  const pts = Math.abs(sp).toFixed(1);
  return `${dogAbbr} +${pts} vs. ${favAbbr}`;
}

function teamSpreadTail(
  teamId: string,
  favId: string | null,
  sp: number | null,
  teamsById: Map<string, Team>
): string {
  const abbr = teamAbbrev(teamId, teamsById);
  if (!favId || sp == null) return abbr;
  if (teamId === favId) {
    return `${abbr} ${sp.toFixed(1)}`;
  }
  return `${abbr} +${Math.abs(sp).toFixed(1)}`;
}

export type OverviewDesktopCellCopy = {
  /** Colored name row (final / won / lost / neutral). */
  primaryLine?: string;
  /** White caps line: matchup + spread (Figma). */
  detailLine?: string;
  /** Live: two columns — name + team/spread line per side. */
  liveLeft?: { name: string; tail: string };
  liveRight?: { name: string; tail: string };
};

/**
 * Desktop overview (Figma): owner name + single matchup/spread line; live = two columns.
 * No final scores, clocks, or separate “Spread …” line.
 */
export function overviewDesktopCellCopy(
  game: BracketGame,
  viewerId: string | null,
  allGames: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>,
  displayName: (userId: string) => string
): OverviewDesktopCellCopy | null {
  const gm = gameMap(allGames);
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  const r = results.get(game.id);
  const fav = game.favorite_team_id;
  const sp = game.spread_from_favorite_perspective;

  if (!ta || !tb) {
    return null;
  }

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
    const nameA = firstNameLastInitialFromUser(
      uidA ? usersById.get(uidA) : undefined,
      uidA ? displayName(uidA) : "—"
    );
    const nameB = firstNameLastInitialFromUser(
      uidB ? usersById.get(uidB) : undefined,
      uidB ? displayName(uidB) : "—"
    );
    return {
      liveLeft: {
        name: nameA,
        tail: teamSpreadTail(ta, fav, sp, teamsById),
      },
      liveRight: {
        name: nameB,
        tail: teamSpreadTail(tb, fav, sp, teamsById),
      },
    };
  }

  const sides = isGameFinal(game, gm, results);
  if (sides) {
    const { ta: fa, tb: fb } = sides;
    const detailLine = matchupSpreadLine(game, fa, fb, teamsById);

    const outcome = computePoolOutcome(
      game,
      allGames,
      results,
      ownershipRows,
      teamsById,
      displayName
    );
    let primaryLine = "";
    if (outcome) {
      const tone = viewerPoolOutcomeTone(
        viewerId,
        outcome.poolOwnerUserId,
        fa,
        fb,
        ownershipRows
      );
      if (tone === "hit" && viewerId) {
        primaryLine = firstNameLastInitialFromUser(
          usersById.get(viewerId),
          displayName(viewerId)
        );
      } else {
        primaryLine = firstNameLastInitialFromUser(
          usersById.get(outcome.poolOwnerUserId),
          displayName(outcome.poolOwnerUserId)
        );
      }
    }

    return {
      primaryLine,
      detailLine,
    };
  }

  return {
    detailLine: matchupSpreadLine(game, ta, tb, teamsById),
  };
}
