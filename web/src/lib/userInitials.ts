import type { User } from "../types";

/** Two-letter initials from a display name (e.g. "Neil Jag" → "NJ"). */
export function userInitialsFromDisplayName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const w = parts[0];
    if (w.length >= 2) return w.slice(0, 2).toUpperCase();
    return `${w[0] ?? ""}${w[0] ?? ""}`.toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Prefer first + last initial when both are set; otherwise derive from display name
 * (see {@link userInitialsFromDisplayName}).
 */
export function userInitialsFromUser(
  user: Pick<User, "display_name" | "first_name" | "last_name"> | undefined,
  displayNameFallback: string
): string {
  const f = user?.first_name?.trim() ?? "";
  const l = user?.last_name?.trim() ?? "";
  if (f && l) {
    return `${f[0]!}${l[0]!}`.toUpperCase();
  }
  const dn = user?.display_name?.trim() || displayNameFallback.trim();
  if (!dn) return "";
  return (
    userInitialsFromDisplayName(dn) || dn.slice(0, 2).toUpperCase()
  );
}
