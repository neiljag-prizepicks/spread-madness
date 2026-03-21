export const ACTIVE_GROUP_STORAGE_KEY = "sm_active_group_id";

export function readStoredActiveGroupId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredActiveGroupId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_GROUP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
