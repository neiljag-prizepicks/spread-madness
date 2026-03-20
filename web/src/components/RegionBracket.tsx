import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { withoutFirstFour } from "../lib/bracketFilters";
import { Matchup } from "./Matchup";
import { RegionalBracketTree } from "./RegionalBracketTree";

type Props = {
  title: string;
  games: BracketGame[];
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  onOpenScore: (gameId: string) => void;
};

function sortByOrder(gs: BracketGame[]) {
  return [...gs].sort((a, b) => a.bracket_order - b.bracket_order);
}

type MProps = Omit<Props, "title" | "games">;

export function RegionBracket({
  title,
  games,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
  onOpenScore,
}: Props) {
  const mprops: MProps = {
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    onOpenScore,
  };

  const treeGames = withoutFirstFour(games);
  const ff = sortByOrder(games.filter((g) => g.round === "first_four"));

  return (
    <>
      <section className="region-bracket" data-region={title}>
        <h2 className="region-title">{title}</h2>
        <div
          className="region-bracket-scroll"
          role="region"
          aria-label={`${title} region bracket`}
          tabIndex={0}
        >
          <div className="region-bracket-shell">
            <RegionalBracketTree games={treeGames} {...mprops} />
          </div>
        </div>
      </section>
      {ff.length > 0 && (
        <section
          className="first-four-section region-first-four"
          aria-label={`${title} First Four`}
        >
          <h3 className="first-four-section-title">{title} — First Four</h3>
          <div className="first-four-grid">
            {ff.map((g) => (
              <Matchup key={g.id} game={g} {...mprops} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
