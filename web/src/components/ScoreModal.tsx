import { useState, useEffect } from "react";
import type { BracketGame, GameResult, Team } from "../types";
import { gameMap, resolveTeamId } from "../lib/resolveTeams";
import { teamAbbrev, teamSchool } from "../lib/teamLabels";

type Props = {
  game: BracketGame | null;
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  results: Map<string, GameResult>;
  onSave: (gameId: string, scores: Record<string, number>) => void;
  onClose: () => void;
};

export function ScoreModal({
  game,
  allGames,
  teamsById,
  results,
  onSave,
  onClose,
}: Props) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const gm = gameMap(allGames);
  const ta = game
    ? resolveTeamId(game, "side_a", gm, results, new Set())
    : null;
  const tb = game
    ? resolveTeamId(game, "side_b", gm, results, new Set())
    : null;

  useEffect(() => {
    if (!game || !ta || !tb) return;
    const r = results.get(game.id);
    setA(r?.scores?.[ta] != null ? String(r.scores[ta]) : "");
    setB(r?.scores?.[tb] != null ? String(r.scores[tb]) : "");
  }, [game?.id, ta, tb, results]);

  if (!game || !ta || !tb) return null;

  const labelA = `${teamAbbrev(ta, teamsById)} — ${teamSchool(ta, teamsById)}`;
  const labelB = `${teamAbbrev(tb, teamsById)} — ${teamSchool(tb, teamsById)}`;

  const submit = () => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return;
    onSave(game.id, { [ta]: na, [tb]: nb });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Enter final score — {game.id}</h3>
        <p className="modal-hint">POC only. Script refresh can replace this later.</p>
        <label>
          Side A ({labelA})
          <input
            type="number"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="modal-input"
          />
        </label>
        <label>
          Side B ({labelB})
          <input
            type="number"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="modal-input"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
