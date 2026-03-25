import type { BracketGame, GameResult, Team, User } from "../types";
import { isPoolSettledForGame } from "./gameResult";
import {
  buildMyTeamsSections,
  findTeamFrontierState,
  lastSettledGameForTeam,
} from "./myTeams";
import type { OwnershipRow } from "./ownershipMap";
import { gameMap, ncaaWinner, resolveTeamId } from "./resolveTeams";
import { teamAbbrev, teamSchool } from "./teamLabels";

export const GROUP_HUB_BADGE_FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;

export type GroupHubTeamBadgeStatus =
  | "live"
  | "scheduled"
  | "recent_win"
  | "recent_loss"
  | "neutral";

export type GroupHubTeamBadge = {
  teamId: string;
  abbrev: string;
  status: GroupHubTeamBadgeStatus;
};

function parseScoresUpdatedAtMs(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function tipIsSet(iso: string | null): boolean {
  if (iso == null || String(iso).trim() === "") return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t);
}

function bothSlotsAreConcreteTeams(
  game: BracketGame,
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>
): boolean {
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  return ta != null && tb != null;
}

function statusForActiveTeam(
  teamId: string,
  nextGameLive: boolean,
  games: BracketGame[],
  results: Map<string, GameResult>,
  nowMs: number
): GroupHubTeamBadgeStatus {
  const frontier = findTeamFrontierState(teamId, games, results);
  if (!frontier) return "neutral";

  if (nextGameLive && frontier.kind === "upcoming") {
    const r = results.get(frontier.game.id);
    if (r?.status === "in_progress") return "live";
  }

  if (frontier.kind === "champion") return "neutral";

  if (frontier.kind !== "upcoming") return "neutral";

  const g = frontier.game;
  const gm = gameMap(games);
  const r = results.get(g.id);
  if (r?.status === "in_progress") return "live";

  if (tipIsSet(g.scheduled_tip_utc) && bothSlotsAreConcreteTeams(g, gm, results)) {
    return "scheduled";
  }

  if (!tipIsSet(g.scheduled_tip_utc)) {
    const last = lastSettledGameForTeam(teamId, games, results);
    if (last) {
      const ta = resolveTeamId(last, "side_a", gm, results, new Set());
      const tb = resolveTeamId(last, "side_b", gm, results, new Set());
      const lr = results.get(last.id);
      if (
        isPoolSettledForGame(lr, ta, tb) &&
        ncaaWinner(last, gm, results) === teamId
      ) {
        const at = parseScoresUpdatedAtMs(lr?.scores_updated_at);
        if (at != null && nowMs - at <= GROUP_HUB_BADGE_FORTY_EIGHT_H_MS) {
          return "recent_win";
        }
      }
    }
  }

  return "neutral";
}

function lossEventMsForRow(
  focusGameId: string,
  results: Map<string, GameResult>
): number | null {
  return parseScoresUpdatedAtMs(results.get(focusGameId)?.scores_updated_at);
}

const BADGE_PRIORITY: Record<GroupHubTeamBadgeStatus, number> = {
  live: 0,
  scheduled: 1,
  recent_win: 2,
  recent_loss: 3,
  neutral: 4,
};

const MAX_VISIBLE_BADGES = 6;
const MAX_TEAM_NAMES_ON_CARD = 6;

/**
 * Team abbrev badges + name line for one group's hub card, using the same pool
 * semantics as My Teams (`buildMyTeamsSections`).
 */
export function buildGroupHubTeamBadges(
  viewerUserId: string,
  ownershipRows: OwnershipRow[],
  games: BracketGame[],
  results: Map<string, GameResult>,
  teamsById: Map<string, Team>,
  usersById: Map<string, User>,
  nowMs: number
): {
  badges: GroupHubTeamBadge[];
  overflow: number;
  teamNamesLine: string;
  teamsInControlCount: number;
} {
  if (games.length === 0) {
    return {
      badges: [],
      overflow: 0,
      teamNamesLine: "",
      teamsInControlCount: 0,
    };
  }

  const sections = buildMyTeamsSections(
    viewerUserId,
    games,
    results,
    ownershipRows,
    teamsById,
    usersById
  );

  const raw: GroupHubTeamBadge[] = [];

  for (const row of sections.active) {
    const status = statusForActiveTeam(
      row.teamId,
      row.nextGameLive,
      games,
      results,
      nowMs
    );
    raw.push({
      teamId: row.teamId,
      abbrev: teamAbbrev(row.teamId, teamsById),
      status,
    });
  }

  for (const row of [...sections.lost, ...sections.changedControl]) {
    const at = lossEventMsForRow(row.focusGameId, results);
    if (at == null || nowMs - at > GROUP_HUB_BADGE_FORTY_EIGHT_H_MS) continue;
    raw.push({
      teamId: row.teamId,
      abbrev: teamAbbrev(row.teamId, teamsById),
      status: "recent_loss",
    });
  }

  const seen = new Set<string>();
  const deduped: GroupHubTeamBadge[] = [];
  for (const b of raw) {
    if (seen.has(b.teamId)) continue;
    seen.add(b.teamId);
    deduped.push(b);
  }

  deduped.sort((a, b) => {
    const pa = BADGE_PRIORITY[a.status];
    const pb = BADGE_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    return a.abbrev.localeCompare(b.abbrev);
  });

  const overflow = Math.max(0, deduped.length - MAX_VISIBLE_BADGES);
  const visible = deduped.slice(0, MAX_VISIBLE_BADGES);

  const schoolNames = deduped
    .map((b) => teamSchool(b.teamId, teamsById))
    .filter((s) => s && s !== "TBD");

  let teamNamesLine = "";
  if (schoolNames.length > 0) {
    if (schoolNames.length <= MAX_TEAM_NAMES_ON_CARD) {
      teamNamesLine = schoolNames.join(", ");
    } else {
      const shown = schoolNames.slice(0, MAX_TEAM_NAMES_ON_CARD);
      const rest = schoolNames.length - MAX_TEAM_NAMES_ON_CARD;
      teamNamesLine = `${shown.join(", ")}, +${rest}`;
    }
  }

  return {
    badges: visible,
    overflow,
    teamNamesLine,
    teamsInControlCount: deduped.length,
  };
}
