import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { Matchup } from "./Matchup";

type Props = {
  games: BracketGame[];
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
};

export function FinalRounds({
  games,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
}: Props) {
  const ff = games
    .filter((g) => g.round === "final_four")
    .sort((a, b) => a.bracket_order - b.bracket_order);
  const ncg = games.filter((g) => g.round === "championship");

  return (
    <section className="final-rounds">
      <h2 className="region-title">Final Four & Championship</h2>
      <p className="region-scroll-hint" aria-hidden="true">
        Scroll horizontally for full bracket
      </p>
      <div
        className="final-rounds-scroll"
        role="region"
        aria-label="Final Four and championship"
        tabIndex={0}
      >
        <div className="final-columns">
          <div className="final-round-column">
            <div className="round-label">Final Four</div>
            <div className="round-matchups">
              {ff.map((g) => (
                <Matchup
                  key={g.id}
                  game={g}
                  allGames={allGames}
                  teamsById={teamsById}
                  usersById={usersById}
                  ownershipRows={ownershipRows}
                  results={results}
                />
              ))}
            </div>
          </div>
          <div className="final-round-column">
            <div className="round-label">National Championship</div>
            <div className="round-matchups">
              {ncg.map((g) => (
                <Matchup
                  key={g.id}
                  game={g}
                  allGames={allGames}
                  teamsById={teamsById}
                  usersById={usersById}
                  ownershipRows={ownershipRows}
                  results={results}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
