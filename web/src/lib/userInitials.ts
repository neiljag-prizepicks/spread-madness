import type { User } from "../types";

/**
 * First two characters of the string (trimmed), uppercased.
 * Single character is duplicated (e.g. "A" → "AA").
 */
export function twoLettersFromText(text: string): string {
  const t = text.trim();
  if (!t) return "";
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  return `${t[0]!}${t[0]!}`.toUpperCase();
}

/**
 * Canonical user “initials” for UI (header circle, bracket overview, etc.):
 * - Both first and last name set → first letter of each (uppercase).
 * - Exactly one set → first two letters of that field ({@link twoLettersFromText}).
 * - Neither set → first two letters of display name (user profile or fallback string).
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
  if (f && !l) {
    return twoLettersFromText(f);
  }
  if (!f && l) {
    return twoLettersFromText(l);
  }
  const dn = user?.display_name?.trim() || displayNameFallback.trim();
  if (!dn) return "";
  return twoLettersFromText(dn);
}
