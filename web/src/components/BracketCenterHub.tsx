import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { Matchup } from "./Matchup";

/** Canonical region pairing per game id. */
const FINAL_FOUR_REGION_LABEL: Record<string, string> = {
  "FF-1": "East vs. South",
  "FF-2": "West vs. Midwest",
};

export function finalFourRegionalLabel(finalFourGameId: string): string {
  return FINAL_FOUR_REGION_LABEL[finalFourGameId] ?? "Final Four";
}

type HubProps = {
  ff1: BracketGame | undefined;
  ff2: BracketGame | undefined;
  ncg: BracketGame[];
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  /** Optional class on outer triptych wrapper (desktop vs mobile spacing). */
  className?: string;
};

export function BracketCenterHub({
  ff1,
  ff2,
  ncg,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
  className = "",
}: HubProps) {
  const m = {
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
  };

  return (
    <div className={`kalshi-center-hub kalshi-center-hub--triptych ${className}`.trim()}>
      {ff1 && (
        <div className="kalshi-ff-wing kalshi-ff-wing--left">
          <h3 className="kalshi-hub-heading">Final Four</h3>
          <p className="kalshi-ff-regions">
            {finalFourRegionalLabel("FF-1")}
          </p>
          <Matchup game={ff1} {...m} />
        </div>
      )}
      <div className="kalshi-champ-column">
        <div className="kalshi-hub-championship">
          <div className="kalshi-champ-glow" aria-hidden />
          <h3 className="kalshi-champ-title">Championship</h3>
          <div className="kalshi-hub-ncg-stack">
            {ncg.map((g) => (
              <Matchup key={g.id} game={g} {...m} />
            ))}
          </div>
        </div>
      </div>
      {ff2 && (
        <div className="kalshi-ff-wing kalshi-ff-wing--right">
          <h3 className="kalshi-hub-heading">Final Four</h3>
          <p className="kalshi-ff-regions">
            {finalFourRegionalLabel("FF-2")}
          </p>
          <Matchup game={ff2} {...m} />
        </div>
      )}
    </div>
  );
}
