import type { BracketGame } from "../types";

/** Play-in games only — exclude from regional trees so R64 columns align. */
export function withoutFirstFour(gs: BracketGame[]): BracketGame[] {
  return gs.filter((g) => g.round !== "first_four");
}
