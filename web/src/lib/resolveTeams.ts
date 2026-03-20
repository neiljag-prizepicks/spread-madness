import type { BracketGame, GameResult } from "../types";

export function gameMap(games: BracketGame[]): Map<string, BracketGame> {
  return new Map(games.map((g) => [g.id, g]));
}

/** Feeder whose winner lands on `slot` of `childId`. */
export function findFeeder(
  games: BracketGame[],
  childId: string,
  slot: "side_a" | "side_b"
): BracketGame | undefined {
  return games.find(
    (g) => g.feeds_into?.game_id === childId && g.feeds_into.winner_slot === slot
  );
}

/**
 * Bracket game id whose winner fills this slot (when `team_id` is not set).
 * Used for UI placeholders like "W of E-E8-1" before the feeder is final.
 */
export function feederSourceGameIdForSide(
  game: BracketGame,
  side: "side_a" | "side_b",
  gm: Map<string, BracketGame>
): string | null {
  const s = game[side];
  if (s.team_id) return null;
  if (s.source_game_id) return s.source_game_id;
  const feeder = findFeeder([...gm.values()], game.id, side);
  return feeder?.id ?? null;
}

export function ncaaWinner(
  game: BracketGame,
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>
): string | null {
  const r = results.get(game.id);
  const ta = resolveTeamId(game, "side_a", gm, results, new Set());
  const tb = resolveTeamId(game, "side_b", gm, results, new Set());
  if (!ta || !tb || !r?.scores || r.status !== "final") return null;
  const sa = r.scores[ta];
  const sb = r.scores[tb];
  if (sa == null || sb == null) return null;
  if (sa > sb) return ta;
  if (sb > sa) return tb;
  return null;
}

export function resolveTeamId(
  game: BracketGame,
  side: "side_a" | "side_b",
  gm: Map<string, BracketGame>,
  results: Map<string, GameResult>,
  visiting: Set<string>
): string | null {
  if (visiting.has(game.id)) return null;
  visiting.add(game.id);
  const s = game[side];
  if (s.team_id) {
    visiting.delete(game.id);
    return s.team_id;
  }
  if (s.source_game_id) {
    const src = gm.get(s.source_game_id);
    visiting.delete(game.id);
    if (!src) return null;
    return ncaaWinner(src, gm, results);
  }
  const feeder = findFeeder([...gm.values()], game.id, side);
  visiting.delete(game.id);
  if (!feeder) return null;
  return ncaaWinner(feeder, gm, results);
}
