const STORAGE_KEY = "sm_new_group_ids";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota / private mode */
  }
}

/** Call after a successful invite deeplink join (not when user was already a member). */
export function markGroupAsNewOnInvite(groupId: string): void {
  const ids = readIds();
  if (ids.includes(groupId)) return;
  writeIds([...ids, groupId]);
}

export function isGroupNewBadgeActive(groupId: string): boolean {
  return readIds().includes(groupId);
}

/** Clear when user visits any in-group route for this id. */
export function clearNewGroupBadge(groupId: string): void {
  writeIds(readIds().filter((id) => id !== groupId));
}
