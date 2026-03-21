/** Firestore group id in URL segments (encode for safety). */
function seg(groupId: string): string {
  return encodeURIComponent(groupId);
}

export function groupBracketPath(groupId: string): string {
  return `/group/${seg(groupId)}/bracket`;
}

export function groupMyTeamsPath(groupId: string): string {
  return `/group/${seg(groupId)}/my-teams`;
}

export function groupMyTeamsUserPath(groupId: string, userId: string): string {
  return `/group/${seg(groupId)}/my-teams/user/${encodeURIComponent(userId)}`;
}

export function groupLeaderboardPath(groupId: string): string {
  return `/group/${seg(groupId)}/leaderboard`;
}

export function groupAssignPath(groupId: string): string {
  return `/group/${seg(groupId)}/settings/assign`;
}

export function groupSettingsPath(groupId: string): string {
  return `/group/${seg(groupId)}/settings`;
}
