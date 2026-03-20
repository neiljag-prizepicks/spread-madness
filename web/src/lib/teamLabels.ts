import type { Team } from "../types";

/** Abbrev from teams JSON; avoid showing internal team_id in UI when possible. */
export function teamAbbrev(
  teamId: string | null,
  teamsById: Map<string, Team>
): string {
  if (!teamId) return "—";
  const a = teamsById.get(teamId)?.abbrev;
  if (a) return a;
  return teamId;
}

export function teamSchool(
  teamId: string | null,
  teamsById: Map<string, Team>
): string {
  if (!teamId) return "TBD";
  return teamsById.get(teamId)?.school ?? "TBD";
}
