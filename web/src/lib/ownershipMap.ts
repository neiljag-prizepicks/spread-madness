import type { User } from "../types";

export type OwnershipRow = {
  team_id: string;
  user_id: string;
  /** ISO time when this team was last assigned to `user_id` (Firestore `assignedAt`). Omitted for legacy rows. */
  assigned_at?: string | null;
};

export function buildTeamToUserId(rows: OwnershipRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(r.team_id, r.user_id);
  }
  return m;
}

export function userById(users: User[]): Map<string, User> {
  const m = new Map<string, User>();
  for (const u of users) m.set(u.id, u);
  return m;
}
