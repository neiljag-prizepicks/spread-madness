import { useCallback, useEffect, useMemo, useState } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { BracketBirdseye, type BracketPane } from "./BracketBirdseye";
import { BracketCenterHub } from "./BracketCenterHub";
import { Matchup } from "./Matchup";
import { RegionQuadrant } from "./RegionQuadrant";

type MProps = {
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  onOpenScore: (gameId: string) => void;
};

type TabKey = Exclude<BracketPane, "overview">;

const TABS: { key: TabKey; label: string }[] = [
  { key: "East", label: "East" },
  { key: "South", label: "South" },
  { key: "West", label: "West" },
  { key: "Midwest", label: "Midwest" },
  { key: "final-four", label: "Final Four" },
  { key: "first-four", label: "First Four" },
];

function sortByOrder(gs: BracketGame[]) {
  return [...gs].sort((a, b) => a.bracket_order - b.bracket_order);
}

type Props = MProps & {
  games: BracketGame[];
  viewerUserId: string | null;
};

export function MobileBracketExperience({
  games,
  allGames,
  teamsById,
  usersById,
  ownershipRows,
  results,
  onOpenScore,
  viewerUserId,
}: Props) {
  const [pane, setPane] = useState<BracketPane>("overview");

  const east = games.filter((g) => g.region === "East");
  const west = games.filter((g) => g.region === "West");
  const south = games.filter((g) => g.region === "South");
  const midwest = games.filter((g) => g.region === "Midwest");

  const firstFourGames = sortByOrder(
    games.filter((g) => g.round === "first_four")
  );

  const detailTabs = useMemo(
    () =>
      firstFourGames.length > 0
        ? TABS
        : TABS.filter((t) => t.key !== "first-four"),
    [firstFourGames.length]
  );

  useEffect(() => {
    if (pane === "first-four" && firstFourGames.length === 0) {
      setPane("final-four");
    }
  }, [pane, firstFourGames.length]);

  const ff1 = games.find((g) => g.id === "FF-1");
  const ff2 = games.find((g) => g.id === "FF-2");
  const ncg = games.filter((g) => g.round === "championship");

  const mprops: MProps = {
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    onOpenScore,
  };

  const openZone = useCallback((z: TabKey) => {
    setPane(z);
  }, []);

  const ctx = {
    games,
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    viewerUserId,
    onOpenZone: openZone,
  };

  if (pane === "overview") {
    return (
      <div className="mobile-bracket-root mobile-bracket-root--overview">
        <BracketBirdseye {...ctx} />
      </div>
    );
  }

  return (
    <div className="mobile-bracket-root mobile-bracket-root--detail">
      <div className="mobile-bracket-tabs-scroll" role="tablist" aria-label="Bracket sections">
        <button
          type="button"
          role="tab"
          className="mobile-bracket-tab mobile-bracket-tab--back"
          aria-selected={false}
          onClick={() => setPane("overview")}
        >
          ← Overview
        </button>
        {detailTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={pane === t.key}
            className={`mobile-bracket-tab${pane === t.key ? " mobile-bracket-tab--active" : ""}`}
            onClick={() => setPane(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mobile-bracket-detail" role="tabpanel">
        {pane === "East" && (
          <RegionQuadrant title="East" games={east} flow="ltr" {...mprops} />
        )}
        {pane === "South" && (
          <RegionQuadrant title="South" games={south} flow="ltr" {...mprops} />
        )}
        {pane === "West" && (
          <RegionQuadrant title="West" games={west} flow="rtl" {...mprops} />
        )}
        {pane === "Midwest" && (
          <RegionQuadrant
            title="Midwest"
            games={midwest}
            flow="rtl"
            {...mprops}
          />
        )}
        {pane === "first-four" && firstFourGames.length > 0 && (
          <section
            className="first-four-section mobile-first-four-tab"
            aria-label="First Four play-in games"
          >
            <h2 className="first-four-section-title">First Four</h2>
            <p className="first-four-section-hint">
              Play-in games — winners join the Round of 64 in the main bracket.
            </p>
            <div className="first-four-grid">
              {firstFourGames.map((g) => (
                <Matchup key={g.id} game={g} {...mprops} />
              ))}
            </div>
          </section>
        )}
        {pane === "final-four" && (
          <div className="mobile-final-four-detail">
            <section className="kalshi-cell--center mobile-hub-section">
              <BracketCenterHub
                ff1={ff1}
                ff2={ff2}
                ncg={ncg}
                className="mobile-center-hub-inner"
                {...mprops}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
