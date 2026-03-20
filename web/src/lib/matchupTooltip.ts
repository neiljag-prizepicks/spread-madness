import type { BracketGame } from "../types";
import { gameMap } from "./resolveTeams";

export type MatchupTooltipRegion = {
  /** Row label in the (ⓘ) panel */
  regionLabel: string;
  /** Primary value: NCAA region name or national round label */
  regionValue: string;
  /** First Four / play-in: Round of 64 (or other) game the winner enters */
  advancesToGameId?: string;
};

/**
 * Region / bracket context for the matchup info tooltip.
 * First Four winners slot into a regional R64+ game — surface that target’s region.
 */
export function getMatchupTooltipRegion(
  game: BracketGame,
  allGames: BracketGame[]
): MatchupTooltipRegion {
  const gm = gameMap(allGames);
  if (game.round === "first_four" && game.feeds_into) {
    const next = gm.get(game.feeds_into.game_id);
    const region = next?.region ?? game.region;
    return {
      regionLabel: "Joins regional bracket",
      regionValue: region,
      advancesToGameId: game.feeds_into.game_id,
    };
  }
  return {
    regionLabel: "Region",
    regionValue: game.region,
  };
}
