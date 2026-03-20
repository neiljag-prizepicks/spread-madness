import type { BracketGame } from "../types";
import { withoutFirstFour } from "./bracketFilters";

const REGION_ROUNDS: BracketGame["round"][] = [
  "round_of_64",
  "round_of_32",
  "sweet_16",
  "elite_8",
];

/** Column-major games for mini bracket (R64 → … → E8), each inner array is one vertical column. */
export function regionGamesByColumn(
  regionName: string,
  allGames: BracketGame[]
): BracketGame[][] {
  const g = withoutFirstFour(
    allGames.filter((x) => x.region === regionName)
  );
  const sort = (round: BracketGame["round"]) =>
    [...g.filter((x) => x.round === round)].sort(
      (a, b) => a.bracket_order - b.bracket_order
    );
  return REGION_ROUNDS.map((round) => sort(round));
}
