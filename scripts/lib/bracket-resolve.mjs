/**
 * Mirrors web/src/lib/resolveTeams.ts so Node scripts can resolve TBD slots from results.
 */

export function buildGameMap(games) {
  return new Map(games.map((g) => [g.id, g]));
}

export function findFeeder(games, childId, slot) {
  return games.find(
    (g) => g.feeds_into?.game_id === childId && g.feeds_into.winner_slot === slot
  );
}

export function ncaaWinner(game, gm, results) {
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

export function resolveTeamId(game, side, gm, results, visiting) {
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
