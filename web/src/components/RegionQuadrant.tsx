import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { withoutFirstFour } from "../lib/bracketFilters";
import {
  REGION_ROUND_LABELS,
  activeRegionRound,
  regionRoundTabOrder,
  scrollHorizontallyToElement,
  type RegionTreeRound,
} from "../lib/regionBracketNavigation";
import { RegionalBracketTree } from "./RegionalBracketTree";

type Flow = "ltr" | "rtl";

type MProps = {
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  viewerUserId?: string | null;
};

export function RegionQuadrant({
  title,
  games,
  flow,
  ...mprops
}: {
  title: string;
  games: BracketGame[];
  flow: Flow;
} & MProps) {
  const treeGames = withoutFirstFour(games);
  const scrollRef = useRef<HTMLDivElement>(null);
  const roundAnchorsRef = useRef<
    Partial<Record<RegionTreeRound, HTMLElement | null>>
  >({});

  const liveRound = useMemo(
    () => activeRegionRound(games, mprops.results),
    [games, mprops.results]
  );

  const prevLiveRound = useRef<RegionTreeRound | null>(null);

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const target = roundAnchorsRef.current[liveRound];
    if (!sc || !target) return;
    const shouldScroll =
      prevLiveRound.current === null || prevLiveRound.current !== liveRound;
    if (shouldScroll) {
      requestAnimationFrame(() => {
        scrollHorizontallyToElement(sc, target, {
          align: "start",
          behavior: "auto",
        });
      });
    }
    prevLiveRound.current = liveRound;
  }, [liveRound, games]);

  const scrollToRound = useCallback((round: RegionTreeRound) => {
    const sc = scrollRef.current;
    const target = roundAnchorsRef.current[round];
    if (sc && target) {
      scrollHorizontallyToElement(sc, target, {
        align: "start",
        behavior: "smooth",
      });
    }
  }, []);

  const roundTabs = useMemo(() => regionRoundTabOrder(flow), [flow]);

  return (
    <section
      className={`kalshi-quadrant kalshi-quadrant--${flow}`}
      data-region={title}
      data-kalshi-region={title}
    >
      <h2 className="kalshi-quadrant-title">{title}</h2>
      <nav
        className={`region-round-nav region-round-nav--${flow}`}
        aria-label={`${title} bracket rounds`}
      >
        {roundTabs.map((round) => (
          <button
            key={round}
            type="button"
            className={`region-round-nav-btn${
              liveRound === round ? " region-round-nav-btn--active" : ""
            }`}
            onClick={() => scrollToRound(round)}
          >
            {REGION_ROUND_LABELS[round]}
          </button>
        ))}
      </nav>
      <div
        ref={scrollRef}
        className="kalshi-quadrant-scroll"
        role="region"
        aria-label={`${title} region`}
        tabIndex={0}
      >
        <div
          className={`kalshi-quadrant-shell region-bracket-shell kalshi-quadrant-shell--${flow}`}
        >
          <RegionalBracketTree
            games={treeGames}
            orientation={flow}
            roundAnchorRefs={roundAnchorsRef}
            {...mprops}
          />
        </div>
      </div>
    </section>
  );
}
