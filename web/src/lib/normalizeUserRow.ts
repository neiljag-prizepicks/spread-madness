import type { User } from "../types";

/** Maps JSON user rows to {@link User}, including legacy `name` → first/last. */
export function normalizeUserRow(raw: unknown): User {
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "");
  const display_name = String(r.display_name ?? "");
  let first_name = typeof r.first_name === "string" ? r.first_name : undefined;
  let last_name = typeof r.last_name === "string" ? r.last_name : undefined;
  if (
    (first_name === undefined || first_name === "") &&
    (last_name === undefined || last_name === "") &&
    typeof r.name === "string"
  ) {
    const parts = r.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first_name = first_name || parts[0];
      last_name = last_name || parts.slice(1).join(" ");
    } else if (parts.length === 1) {
      first_name = first_name || parts[0];
    }
  }
  return {
    id,
    display_name,
    first_name,
    last_name,
    email: typeof r.email === "string" ? r.email : undefined,
  };
}
