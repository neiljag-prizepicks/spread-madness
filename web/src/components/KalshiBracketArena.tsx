import { useLayoutEffect } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { scrollHorizontallyToElement } from "../lib/regionBracketNavigation";
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
  viewerUserId?: string | null;
};

/** Bracket shell + optional deep-link focus from My Teams (mock `viewerUserId` for overview picks). */
export type KalshiBracketArenaProps = MProps & {
  games: BracketGame[];
  focusGameId?: string | null;
  onFocusGameConsumed?: () => void;
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
  viewerUserId = null,
  focusGameId = null,
  onFocusGameConsumed,
}: KalshiBracketArenaProps) {
  const isMobile = useMediaQuery("(max-width: 699px)");

  useLayoutEffect(() => {
    if (isMobile || !focusGameId || !onFocusGameConsumed) return;
    const g = allGames.find((x) => x.id === focusGameId);
    if (!g) {
      onFocusGameConsumed();
      return;
    }

    const finish = () => {
      if (g.round === "first_four") {
        const sec = document.querySelector(".first-four-section");
        const el = sec?.querySelector(
          `[data-game-id="${CSS.escape(g.id)}"]`
        );
        sec?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        onFocusGameConsumed();
        return;
      }
      if (g.round === "final_four" || g.round === "championship") {
        const hub = document.querySelector(".kalshi-cell--center");
        const el = hub?.querySelector(
          `[data-game-id="${CSS.escape(g.id)}"]`
        );
        hub?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        onFocusGameConsumed();
        return;
      }
      const reg = g.region;
      if (
        reg === "East" ||
        reg === "South" ||
        reg === "West" ||
        reg === "Midwest"
      ) {
        const section = document.querySelector(
          `section[data-kalshi-region="${CSS.escape(reg)}"]`
        );
        const scrollEl = section?.querySelector(
          ".kalshi-quadrant-scroll"
        ) as HTMLElement | null;
        const target = scrollEl?.querySelector(
          `[data-game-id="${CSS.escape(g.id)}"]`
        ) as HTMLElement | null;
        section?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (scrollEl && target) {
          scrollHorizontallyToElement(scrollEl, target, {
            behavior: "smooth",
            align: "center",
          });
        }
        onFocusGameConsumed();
        return;
      }
      onFocusGameConsumed();
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  }, [isMobile, focusGameId, onFocusGameConsumed, allGames]);

  if (isMobile) {
    return (
      <MobileBracketExperience
        games={games}
        allGames={allGames}
        teamsById={teamsById}
        usersById={usersById}
        ownershipRows={ownershipRows}
        results={results}
        viewerUserId={viewerUserId}
        focusGameId={focusGameId}
        onFocusGameConsumed={onFocusGameConsumed}
      />
    );
  }

  const mprops: MProps = {
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    viewerUserId,
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
                viewerUserId={viewerUserId}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
