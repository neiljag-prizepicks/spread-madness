import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { BracketCenterHub } from "./BracketCenterHub";
import { Matchup } from "./Matchup";
import { MobileBracketExperience } from "./MobileBracketExperience";
import { RegionQuadrant } from "./RegionQuadrant";

type MProps = {
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  onOpenScore: (gameId: string) => void;
};

type Props = MProps & {
  games: BracketGame[];
  /** Mock users contribute ✓/✕ on the mobile overview; Google sessions may omit. */
  viewerUserId?: string | null;
};

function sortByOrder(gs: BracketGame[]) {
  return [...gs].sort((a, b) => a.bracket_order - b.bracket_order);
}

export function KalshiBracketArena({
  games,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
  onOpenScore,
  viewerUserId = null,
}: Props) {
  const isMobile = useMediaQuery("(max-width: 699px)");

  if (isMobile) {
    return (
      <MobileBracketExperience
        games={games}
        allGames={allGames}
        teamsById={teamsById}
        usersById={usersById}
        ownershipRows={ownershipRows}
        results={results}
        onOpenScore={onOpenScore}
        viewerUserId={viewerUserId}
      />
    );
  }

  const mprops: MProps = {
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    onOpenScore,
  };

  const east = games.filter((g) => g.region === "East");
  const west = games.filter((g) => g.region === "West");
  const south = games.filter((g) => g.region === "South");
  const midwest = games.filter((g) => g.region === "Midwest");

  const firstFourGames = sortByOrder(
    games.filter((g) => g.round === "first_four")
  );

  const ff1 = games.find((g) => g.id === "FF-1");
  const ff2 = games.find((g) => g.id === "FF-2");
  const ncg = games.filter((g) => g.round === "championship");

  return (
    <>
      <div className="kalshi-arena" data-layout="kalshi">
        <div className="kalshi-cell kalshi-cell--east">
          <RegionQuadrant title="East" games={east} flow="ltr" {...mprops} />
        </div>
        <div className="kalshi-cell kalshi-cell--west">
          <RegionQuadrant title="West" games={west} flow="rtl" {...mprops} />
        </div>
        <div className="kalshi-cell kalshi-cell--south">
          <RegionQuadrant title="South" games={south} flow="ltr" {...mprops} />
        </div>
        <div className="kalshi-cell kalshi-cell--midwest">
          <RegionQuadrant
            title="Midwest"
            games={midwest}
            flow="rtl"
            {...mprops}
          />
        </div>
        <div className="kalshi-cell kalshi-cell--center">
          <BracketCenterHub
            ff1={ff1}
            ff2={ff2}
            ncg={ncg}
            {...mprops}
          />
        </div>
      </div>

      {firstFourGames.length > 0 && (
        <section className="first-four-section" aria-label="First Four play-in games">
          <h2 className="first-four-section-title">First Four</h2>
          <p className="first-four-section-hint">
            Play-in games — winners join the Round of 64 in the bracket above.
          </p>
          <div className="first-four-grid">
            {firstFourGames.map((g) => (
              <Matchup
                key={g.id}
                game={g}
                allGames={allGames}
                teamsById={teamsById}
                usersById={usersById}
                ownershipRows={ownershipRows}
                results={results}
                onOpenScore={onOpenScore}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
