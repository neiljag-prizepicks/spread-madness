import type { GameResult } from "../types";

/** Any game in the loaded results has tipped or finished (locks prize-round setting with assignments). */
export function anyBracketGameStarted(
  results: Map<string, GameResult>
): boolean {
  for (const r of results.values()) {
    if (r.status === "in_progress" || r.status === "final") return true;
  }
  return false;
}
