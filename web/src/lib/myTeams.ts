import type { BracketGame, GameResult, Team, User } from "../types";
import { computePoolOutcome, getPoolOwnerForSide } from "./ats";
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
  nextTipLabel: string;
  nextSpreadLabel: string;
  lastOutcomeMessage: string | null;
  /** Lost Control section: round label only, e.g. "Round of 64" */
  lostControlRoundLabel?: string;
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

function isAlive(frontier: TeamFrontierState): boolean {
  return frontier.kind !== "eliminated";
}

function currentPoolController(
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

function tipSortKey(frontier: TeamFrontierState): number {
  if (frontier.kind === "upcoming") {
    const t = Date.parse(frontier.game.scheduled_tip_utc ?? "");
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }
  if (frontier.kind === "champion") return Number.POSITIVE_INFINITY - 1;
  return Number.POSITIVE_INFINITY;
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
  let nextTipLabel = "—";
  let nextSpreadLabel = "—";

  if (frontier.kind === "upcoming") {
    nextOpponentLabel = opponentLabel(
      frontier.game,
      frontier.side,
      gm,
      results,
      teamsById
    );
    nextTipLabel = formatTip(frontier.game.scheduled_tip_utc);
    nextSpreadLabel = spreadLineLabel(frontier.game, teamsById);
  } else if (frontier.kind === "champion") {
    roundLabel = "National champion";
    nextOpponentLabel = "Tournament complete";
    nextTipLabel = "—";
    nextSpreadLabel = "—";
    focusGameId = frontier.game.id;
  } else {
    roundLabel = `${ROUND_LABELS[frontier.game.round] ?? frontier.game.round} — out`;
    nextOpponentLabel = "Eliminated";
    nextTipLabel = formatTip(frontier.game.scheduled_tip_utc);
    nextSpreadLabel = spreadLineLabel(frontier.game, teamsById);
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
    nextTipLabel,
    nextSpreadLabel,
    lastOutcomeMessage,
  };
}

export function buildMyTeamsSections(
  viewerUserId: string,
  games: BracketGame[],
  results: Map<string, GameResult>,
  ownershipRows: OwnershipRow[],
  teamsById: Map<string, Team>,
  usersById: Map<string, User>
): { active: MyTeamRow[]; lost: MyTeamRow[] } {
  const draftedByViewer = new Set(
    ownershipRows.filter((r) => r.user_id === viewerUserId).map((r) => r.team_id)
  );

  const candidateIds = new Set<string>([
    ...draftedByViewer,
    ...teamsById.keys(),
  ]);

  const active: MyTeamRow[] = [];
  const lost: MyTeamRow[] = [];

  for (const teamId of candidateIds) {
    const frontier = findTeamFrontierState(teamId, games, results);
    if (!frontier) continue;

    const alive = isAlive(frontier);
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
      lost.push({
        ...row,
        lostControlRoundLabel,
        focusGameId: anchorGame?.id ?? row.focusGameId,
        nextTipLabel: anchorGame
          ? formatTip(anchorGame.scheduled_tip_utc)
          : row.nextTipLabel,
      });
    }
  }

  active.sort((a, b) => {
    const fa = findTeamFrontierState(a.teamId, games, results);
    const fb = findTeamFrontierState(b.teamId, games, results);
    const ka = fa ? tipSortKey(fa) : 0;
    const kb = fb ? tipSortKey(fb) : 0;
    if (ka !== kb) return ka - kb;
    return a.school.localeCompare(b.school);
  });

  lost.sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.seed !== b.seed) return a.seed - b.seed;
    return a.school.localeCompare(b.school);
  });

  return { active, lost };
}
