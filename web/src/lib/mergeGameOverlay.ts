import type { BracketGame, GameScheduleLineOverlayPatch } from "../types";

/**
 * Apply commissioner / ops overrides for tip time and lines without editing the main games JSON.
 * Only keys present on the patch object override the base game (`in` check — omit key to keep template value).
 */
export function mergeGameWithScheduleLineOverlay(
  game: BracketGame,
  patch: GameScheduleLineOverlayPatch | undefined | null
): BracketGame {
  if (!patch || typeof patch !== "object") return game;
  return {
    ...game,
    scheduled_tip_utc:
      "scheduled_tip_utc" in patch
        ? patch.scheduled_tip_utc ?? null
        : game.scheduled_tip_utc,
    favorite_team_id:
      "favorite_team_id" in patch
        ? patch.favorite_team_id ?? null
        : game.favorite_team_id,
    spread_from_favorite_perspective:
      "spread_from_favorite_perspective" in patch
        ? patch.spread_from_favorite_perspective ?? null
        : game.spread_from_favorite_perspective,
    spread_updated_at:
      "spread_updated_at" in patch
        ? patch.spread_updated_at ?? null
        : game.spread_updated_at,
  };
}

export function applyScheduleLineOverlayToGames(
  games: BracketGame[],
  overlay: Record<string, GameScheduleLineOverlayPatch> | null | undefined
): BracketGame[] {
  if (!overlay || typeof overlay !== "object") return games;
  return games.map((g) =>
    mergeGameWithScheduleLineOverlay(g, overlay[g.id])
  );
}
