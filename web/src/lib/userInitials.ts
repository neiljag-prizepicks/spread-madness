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
