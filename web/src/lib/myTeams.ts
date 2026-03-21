import type { BracketGame, GameResult, Team, User } from "../types";
import {
  computePoolOutcome,
  getOwnerDisplayForSide,
  getPoolOwnerForSide,
} from "./ats";
import { isPoolSettledForGame } from "./gameResult";
import type { OwnershipRow } from "./ownershipMap";
import { buildTeamToUserId } from "./ownershipMap";
import {
  feederSourceGameIdForSide,
  gameMap,
  ncaaWinner,
  resolveTeamId,
} from "./resolveTeams";
import { teamAbbrev, teamSchool } from "./teamLabels";

const ROUND_LABELS: Record<BracketGame["round"], string> = {
  first_four: "First Four",
  round_of_64: "Round of 64",
  round_of_32: "Round of 32",
  sweet_16: "Sweet 16",
  elite_8: "Elite 8",
  final_four: "Final Four",
  championship: "Championship",
};

const ROUND_ORDER: BracketGame["round"][] = [
  "first_four",
  "round_of_64",
  "round_of_32",
  "sweet_16",
  "elite_8",
  "final_four",
  "championship",
];

function roundRank(r: BracketGame["round"]): number {
  const i = ROUND_ORDER.indexOf(r);
  return i >= 0 ? i : 0;
}

export type TeamFrontierState =
  | {
      kind: "upcoming";
      game: BracketGame;
      side: "side_a" | "side_b";
    }
  | {
      kind: "eliminated";
      game: BracketGame;
      side: "side_a" | "side_b";
    }
  | {
      kind: "champion";
      game: BracketGame;
      side: "side_a" | "side_b";
    };

export type MyTeamRow = {
  teamId: string;
  /** Game to open in the bracket when the row is tapped */
  focusGameId: string;
  school: string;
  mascot: string;
  region: string;
  seed: number;
  roundLabel: string;
  nextOpponentLabel: string;
  /** Pool owner line for the next opponent (same logic as bracket matchup rows). */
  nextOpponentOwnerLabel: string;
  nextTipLabel: string;
  nextSpreadLabel: string;
  lastOutcomeMessage: string | null;
  /** Lost Control section: round label only, e.g. "Round of 64" */
  lostControlRoundLabel?: string;
  /** Lost Control: display name of pool owner for the advancing slot after the deciding game. */
  lostSlotOwnerLabel?: string;
  /** Changed Control: NCAA winner that now holds the advancing slot (viewer covered but lost). */
  changedToTeamLabel?: string;
  /** Changed Control: viewer display name (pool controller for this pick before control changed). */
  previousOwnerLabel?: string;
  /** True when this row's current bracket game (frontier) is in progress. */
  nextGameLive: boolean;
  /** When live: game clock (e.g. 1st Half 10:39). */
  liveGameClock: string | null;
  /** When live: scoreboard line with abbrevs, e.g. "DUKE 42 · UNC 39". */
  liveGameScoreLabel: string | null;
  /** `Date.parse` of game time used for sorting (matches Game time column); missing → end. */
  nextTipSortKey: number;
};

function spreadLineLabel(
  game: BracketGame,
  teamsById: Map<string, Team>
): string {
  const fav = game.favorite_team_id;
  const sp = game.spread_from_favorite_perspective;
  if (!fav || sp == null) return "—";
  const abbr = teamAbbrev(fav, teamsById);
  return `${abbr} ${sp.toFixed(1)}`;
}

function formatTip(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function tipMsFromIso(iso: string | null | undefined): number {
  if (iso == null || iso === "") return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function opponentLabel(
  game: BracketGame,
  side: "side_a" | "side_b",
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>,
  teamsById: Map<string, Team>
): string {
  const other: "side_a" | "side_b" = side === "side_a" ? "side_b" : "side_a";
  const tid = resolveTeamId(game, other, gm, results, new Set());
  if (tid) {
    const t = teamsById.get(tid);
    const school = t?.school ?? teamSchool(tid, teamsById);
    const mascot = t?.mascot ? ` ${t.mascot}` : "";
    return `${school}${mascot}`.trim();
  }
  const pending = feederSourceGameIdForSide(game, other, gm);
  if (pending) return `Winner of ${pending}`;
  return "TBD";
}

function findEarliestGameWithTeam(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>
): BracketGame | null {
  const gm = gameMap(games);
  let best: BracketGame | null = null;
  let bestR = 999;
  let bestOrder = 999;
  for (const g of games) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    if (ta !== teamId && tb !== teamId) continue;
    const r = roundRank(g.round);
    if (r < bestR || (r === bestR && g.bracket_order < bestOrder)) {
      best = g;
      bestR = r;
      bestOrder = g.bracket_order;
    }
  }
  return best;
}

function findMostAdvancedGameWithTeam(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>
): BracketGame | null {
  const gm = gameMap(games);
  let best: BracketGame | null = null;
  let bestR = -1;
  let bestOrder = -1;
  for (const g of games) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    if (ta !== teamId && tb !== teamId) continue;
    const r = roundRank(g.round);
    if (r > bestR || (r === bestR && g.bracket_order > bestOrder)) {
      best = g;
      bestR = r;
      bestOrder = g.bracket_order;
    }
  }
  return best;
}

/** Walk from the team's most advanced slot along wins until upcoming, elimination, or title. */
export function findTeamFrontierState(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>
): TeamFrontierState | null {
  const gm = gameMap(games);
  let g = findMostAdvancedGameWithTeam(teamId, games, results);
  if (!g) return null;

  let side: "side_a" | "side_b" | null = null;
  const ta0 = resolveTeamId(g, "side_a", gm, results, new Set());
  const tb0 = resolveTeamId(g, "side_b", gm, results, new Set());
  if (ta0 === teamId) side = "side_a";
  else if (tb0 === teamId) side = "side_b";
  else return null;

  for (;;) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    const r = results.get(g.id);
    if (!isPoolSettledForGame(r, ta, tb)) {
      return { kind: "upcoming", game: g, side: side! };
    }

    const w = ncaaWinner(g, gm, results);
    if (w !== teamId) {
      return { kind: "eliminated", game: g, side: side! };
    }

    const fi = g.feeds_into;
    if (!fi?.game_id) {
      return { kind: "champion", game: g, side: side! };
    }

    const child = gm.get(fi.game_id);
    if (!child) {
      return { kind: "champion", game: g, side: side! };
    }

    g = child;
    side = fi.winner_slot;
  }
}

/** Current pool controller for a team slot and whether that team is still alive in the NCAA bracket. */
export function getTeamPoolControlSnapshot(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[]
): { alive: boolean; controllerUserId: string | null } | null {
  const frontier = findTeamFrontierState(teamId, games, results);
  if (!frontier) return null;
  return {
    alive: isAliveFrontier(frontier),
    controllerUserId: currentPoolController(
      teamId,
      frontier,
      games,
      results,
      ownershipRows
    ),
  };
}

export function isAliveFrontier(frontier: TeamFrontierState): boolean {
  return frontier.kind !== "eliminated";
}

export function currentPoolController(
  teamId: string,
  frontier: TeamFrontierState,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[]
): string | null {
  const teamToUser = buildTeamToUserId(ownershipRows);
  const c = getPoolOwnerForSide(
    frontier.game,
    frontier.side,
    games,
    results,
    ownershipRows
  );
  if (c != null) return c;
  return teamToUser.get(teamId) ?? null;
}

/** Eliminated on the scoreboard but that team is who covered ATS (underdog moral cover). */
function coveredSpreadButLostNcaa(
  teamId: string,
  eliminationGame: BracketGame,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): boolean {
  const dn = (uid: string) => uid;
  const out = computePoolOutcome(
    eliminationGame,
    games,
    results,
    ownershipRows,
    teamsById,
    dn
  );
  if (!out) return false;
  return (
    out.coveredTeamId === teamId &&
    out.ncaaWinnerId !== teamId
  );
}

function lastSettledGameForTeam(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>
): BracketGame | null {
  const gm = gameMap(games);
  let best: BracketGame | null = null;
  let bestR = -1;
  let bestOrder = -1;
  for (const g of games) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    if (ta !== teamId && tb !== teamId) continue;
    const r = results.get(g.id);
    if (!isPoolSettledForGame(r, ta, tb)) continue;
    const rr = roundRank(g.round);
    if (rr > bestR || (rr === bestR && g.bracket_order > bestOrder)) {
      best = g;
      bestR = rr;
      bestOrder = g.bracket_order;
    }
  }
  return best;
}

/**
 * First settled game on this team's path where the viewer loses pool control:
 * NCAA elimination, or team wins but ATS assigns another owner.
 */
function findFirstLostControlGame(
  teamId: string,
  viewerId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>
): BracketGame | null {
  const gm = gameMap(games);
  let g = findEarliestGameWithTeam(teamId, games, results);
  if (!g) return null;

  const ta0 = resolveTeamId(g, "side_a", gm, results, new Set());
  const tb0 = resolveTeamId(g, "side_b", gm, results, new Set());
  if (ta0 !== teamId && tb0 !== teamId) return null;

  const dn = (uid: string) => uid;

  for (;;) {
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    const r = results.get(g.id);
    if (!isPoolSettledForGame(r, ta, tb)) {
      return null;
    }

    const w = ncaaWinner(g, gm, results);
    if (w == null) return null;

    const out = computePoolOutcome(
      g,
      games,
      results,
      ownershipRows,
      teamsById,
      dn
    );
    if (!out) return g;

    if (w !== teamId) {
      return g;
    }

    if (out.poolOwnerUserId !== viewerId) {
      return g;
    }

    const fi = g.feeds_into;
    if (!fi?.game_id) return null;
    const child = gm.get(fi.game_id);
    if (!child) return null;
    g = child;
  }
}

function lastOutcomeMessageForTeam(
  teamId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>
): string | null {
  const g = lastSettledGameForTeam(teamId, games, results);
  if (!g) return null;
  const dn = (uid: string) => usersById.get(uid)?.display_name ?? uid;
  const out = computePoolOutcome(g, games, results, ownershipRows, teamsById, dn);
  return out?.message ?? null;
}

function buildRow(
  teamId: string,
  frontier: TeamFrontierState,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>
): MyTeamRow {
  const gm = gameMap(games);
  const t = teamsById.get(teamId);
  const school = t?.school ?? teamId;
  const mascot = t?.mascot ?? "";
  const region = t?.region ?? "—";
  const seed = t?.seed ?? 0;

  const lastOutcomeMessage = lastOutcomeMessageForTeam(
    teamId,
    games,
    results,
    ownershipRows,
    teamsById,
    usersById
  );

  let focusGameId = frontier.game.id;
  let roundLabel = ROUND_LABELS[frontier.game.round] ?? frontier.game.round;
  let nextOpponentLabel = "—";
  let nextOpponentOwnerLabel = "—";
  let nextTipLabel = "—";
  let nextSpreadLabel = "—";

  const dn = (uid: string) => usersById.get(uid)?.display_name ?? uid;

  if (frontier.kind === "upcoming") {
    nextOpponentLabel = opponentLabel(
      frontier.game,
      frontier.side,
      gm,
      results,
      teamsById
    );
    const opponentSide: "side_a" | "side_b" =
      frontier.side === "side_a" ? "side_b" : "side_a";
    nextOpponentOwnerLabel = getOwnerDisplayForSide(
      frontier.game,
      opponentSide,
      games,
      results,
      ownershipRows,
      dn
    );
    nextTipLabel = formatTip(frontier.game.scheduled_tip_utc);
    nextSpreadLabel = spreadLineLabel(frontier.game, teamsById);
  } else if (frontier.kind === "champion") {
    roundLabel = "National champion";
    nextOpponentLabel = "Tournament complete";
    nextOpponentOwnerLabel = "—";
    nextTipLabel = "—";
    nextSpreadLabel = "—";
    focusGameId = frontier.game.id;
  } else {
    roundLabel = `${ROUND_LABELS[frontier.game.round] ?? frontier.game.round} — out`;
    nextOpponentLabel = "Eliminated";
    nextOpponentOwnerLabel = "—";
    nextTipLabel = formatTip(frontier.game.scheduled_tip_utc);
    nextSpreadLabel = spreadLineLabel(frontier.game, teamsById);
  }

  const nextGameLive =
    frontier.kind === "upcoming" &&
    results.get(frontier.game.id)?.status === "in_progress";

  let liveGameClock: string | null = null;
  let liveGameScoreLabel: string | null = null;
  if (nextGameLive && frontier.kind === "upcoming") {
    const g = frontier.game;
    const r = results.get(g.id);
    const ck = r?.clock;
    if (ck != null && String(ck).trim() !== "") {
      liveGameClock = String(ck);
    }
    const ta = resolveTeamId(g, "side_a", gm, results, new Set());
    const tb = resolveTeamId(g, "side_b", gm, results, new Set());
    const sa =
      ta != null && r?.scores?.[ta] != null ? r.scores[ta] : null;
    const sb =
      tb != null && r?.scores?.[tb] != null ? r.scores[tb] : null;
    const parts: string[] = [];
    if (ta != null && sa != null) {
      parts.push(`${teamAbbrev(ta, teamsById)} ${sa}`);
    }
    if (tb != null && sb != null) {
      parts.push(`${teamAbbrev(tb, teamsById)} ${sb}`);
    }
    if (parts.length > 0) {
      liveGameScoreLabel = parts.join(" · ");
    }
  }

  return {
    teamId,
    focusGameId,
    school,
    mascot,
    region,
    seed,
    roundLabel,
    nextOpponentLabel,
    nextOpponentOwnerLabel,
    nextTipLabel,
    nextSpreadLabel,
    lastOutcomeMessage,
    nextGameLive,
    liveGameClock,
    liveGameScoreLabel,
    nextTipSortKey: tipMsFromIso(frontier.game.scheduled_tip_utc),
  };
}

export function buildMyTeamsSections(
  viewerUserId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>
): {
  active: MyTeamRow[];
  changedControl: MyTeamRow[];
  lost: MyTeamRow[];
} {
  const draftedByViewer = new Set(
    ownershipRows.filter((r) => r.user_id === viewerUserId).map((r) => r.team_id)
  );

  const candidateIds = new Set<string>([
    ...draftedByViewer,
    ...teamsById.keys(),
  ]);

  const active: MyTeamRow[] = [];
  const changedControl: MyTeamRow[] = [];
  const lost: MyTeamRow[] = [];

  for (const teamId of candidateIds) {
    const frontier = findTeamFrontierState(teamId, games, results);
    if (!frontier) continue;

    const alive = isAliveFrontier(frontier);
    const controller = currentPoolController(
      teamId,
      frontier,
      games,
      results,
      ownershipRows
    );

    const inActive = alive && controller === viewerUserId;
    const inLost =
      draftedByViewer.has(teamId) && (!alive || controller !== viewerUserId);

    if (!inActive && !inLost) continue;

    const row = buildRow(
      teamId,
      frontier,
      games,
      results,
      ownershipRows,
      teamsById,
      usersById
    );

    if (inActive) active.push(row);
    if (inLost) {
      const lostGame = findFirstLostControlGame(
        teamId,
        viewerUserId,
        games,
        results,
        ownershipRows,
        teamsById
      );
      const fallbackRoundGame =
        lostGame ?? lastSettledGameForTeam(teamId, games, results);
      const lostControlRoundLabel = fallbackRoundGame
        ? (ROUND_LABELS[fallbackRoundGame.round] ?? fallbackRoundGame.round)
        : (ROUND_LABELS[frontier.game.round] ?? frontier.game.round);
      const anchorGame = lostGame ?? fallbackRoundGame;
      const augmented = {
        ...row,
        lostControlRoundLabel,
        focusGameId: anchorGame?.id ?? row.focusGameId,
        nextTipLabel: anchorGame
          ? formatTip(anchorGame.scheduled_tip_utc)
          : row.nextTipLabel,
        nextTipSortKey: anchorGame
          ? tipMsFromIso(anchorGame.scheduled_tip_utc)
          : row.nextTipSortKey,
      };

      const isChangedControl =
        frontier.kind === "eliminated" &&
        coveredSpreadButLostNcaa(
          teamId,
          frontier.game,
          games,
          results,
          ownershipRows,
          teamsById
        );

      if (isChangedControl) {
        const dnView = (uid: string) =>
          usersById.get(uid)?.display_name ?? uid;
        const previousOwnerLabel = dnView(viewerUserId);
        let changedToTeamLabel = "—";
        if (frontier.kind === "eliminated") {
          const out = computePoolOutcome(
            frontier.game,
            games,
            results,
            ownershipRows,
            teamsById,
            (uid) => uid
          );
          if (out) {
            const tw = teamsById.get(out.ncaaWinnerId);
            const sch = tw?.school ?? teamSchool(out.ncaaWinnerId, teamsById);
            const masc = tw?.mascot ? ` ${tw.mascot}` : "";
            changedToTeamLabel = `${sch}${masc}`.trim();
          }
        }
        changedControl.push({
          ...augmented,
          changedToTeamLabel,
          previousOwnerLabel,
        });
      }
      else {
        const dnOwner = (uid: string) =>
          usersById.get(uid)?.display_name ?? uid;
        let lostSlotOwnerLabel = "—";
        if (anchorGame) {
          const out = computePoolOutcome(
            anchorGame,
            games,
            results,
            ownershipRows,
            teamsById,
            dnOwner
          );
          if (out?.poolOwnerUserId) {
            lostSlotOwnerLabel = dnOwner(out.poolOwnerUserId);
          }
        }
        lost.push({ ...augmented, lostSlotOwnerLabel });
      }
    }
  }

  const byGameTimeThenSchool = (a: MyTeamRow, b: MyTeamRow) => {
    if (a.nextTipSortKey !== b.nextTipSortKey) {
      return a.nextTipSortKey - b.nextTipSortKey;
    }
    return a.school.localeCompare(b.school);
  };

  active.sort(byGameTimeThenSchool);
  changedControl.sort(byGameTimeThenSchool);
  lost.sort(byGameTimeThenSchool);

  return { active, changedControl, lost };
}
