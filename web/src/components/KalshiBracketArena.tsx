import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { scrollHorizontallyToElement } from "../lib/regionBracketNavigation";
import {
  DEFAULT_PRIZE_START_ROUND,
  type PrizeStartRound,
} from "../lib/prizeStartRound";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  BracketBirdseye,
  BracketInviteActions,
  BracketPrivateInviteLines,
  type BracketPane,
  type BracketInviteSlot,
  type GroupTeamsUnassignedHintProps,
} from "./BracketBirdseye";
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
  /** Firestore group: show setup message instead of overview color key until all teams are assigned. */
  groupTeamsUnassigned?: GroupTeamsUnassignedHintProps | null;
  /** Private group not full: show invite lines when teams are already assigned (no unassigned hint). */
  bracketPrivateInvite?: { joinCode: string; password: string } | null;
  bracketInviteSlot?: BracketInviteSlot | null;
  onBracketInviteClick?: () => boolean | Promise<boolean>;
  /** Private pool: where overview prize ($) hints start; mock/public default Elite 8. */
  prizeStartRound?: PrizeStartRound;
};

function sortByOrder(gs: BracketGame[]) {
  return [...gs].sort((a, b) => a.bracket_order - b.bracket_order);
}

type RegionalTabKey = Exclude<BracketPane, "overview">;

const REGIONAL_TABS: { key: RegionalTabKey; label: string }[] = [
  { key: "East", label: "East" },
  { key: "South", label: "South" },
  { key: "West", label: "West" },
  { key: "Midwest", label: "Midwest" },
  { key: "final-four", label: "Final Four" },
  { key: "first-four", label: "First Four" },
];

function desktopPaneForFocusedGame(
  game: BracketGame,
  hasFirstFourTab: boolean
): BracketPane {
  if (game.round === "first_four") {
    if (hasFirstFourTab) return "first-four";
    const r = game.region;
    if (r === "East" || r === "South" || r === "West" || r === "Midwest")
      return r;
    return "East";
  }
  if (game.round === "final_four" || game.round === "championship") {
    return "final-four";
  }
  const r = game.region;
  if (r === "East" || r === "South" || r === "West" || r === "Midwest")
    return r;
  return "East";
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
  groupTeamsUnassigned = null,
  bracketPrivateInvite = null,
  bracketInviteSlot = null,
  onBracketInviteClick,
  prizeStartRound = DEFAULT_PRIZE_START_ROUND,
}: KalshiBracketArenaProps) {
  const isMobile = useMediaQuery("(max-width: 699px)");
  const [desktopPane, setDesktopPane] = useState<BracketPane>("overview");

  const firstFourGames = useMemo(
    () => sortByOrder(games.filter((g) => g.round === "first_four")),
    [games]
  );

  const regionalTabs = useMemo(
    () =>
      firstFourGames.length > 0
        ? REGIONAL_TABS
        : REGIONAL_TABS.filter((t) => t.key !== "first-four"),
    [firstFourGames.length]
  );

  const openZoneFromOverview = useCallback(
    (pane: Exclude<BracketPane, "overview">) => {
      setDesktopPane(pane);
    },
    []
  );

  useEffect(() => {
    if (isMobile) return;
    if (desktopPane === "first-four" && firstFourGames.length === 0) {
      setDesktopPane("final-four");
    }
  }, [isMobile, desktopPane, firstFourGames.length]);

  useLayoutEffect(() => {
    if (isMobile || !focusGameId || !onFocusGameConsumed) return;
    const g = allGames.find((x) => x.id === focusGameId);
    if (!g) {
      onFocusGameConsumed();
      return;
    }

    setDesktopPane(
      desktopPaneForFocusedGame(g, firstFourGames.length > 0)
    );

    const finish = () => {
      if (g.round === "first_four") {
        const sec = document.querySelector(
          ".desktop-regional-detail-pane[data-desktop-pane=\"first-four\"]"
        );
        const el = sec?.querySelector(
          `[data-game-id="${CSS.escape(g.id)}"]`
        );
        sec?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        onFocusGameConsumed();
        return;
      }
      if (g.round === "final_four" || g.round === "championship") {
        const hub = document.querySelector(
          ".desktop-regional-detail-pane[data-desktop-pane=\"final-four\"]"
        );
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
  }, [
    isMobile,
    focusGameId,
    onFocusGameConsumed,
    allGames,
    firstFourGames.length,
  ]);

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
        groupTeamsUnassigned={groupTeamsUnassigned}
        bracketPrivateInvite={bracketPrivateInvite}
        bracketInviteSlot={bracketInviteSlot}
        onBracketInviteClick={onBracketInviteClick}
        prizeStartRound={prizeStartRound}
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

  const ff1 = games.find((g) => g.id === "FF-1");
  const ff2 = games.find((g) => g.id === "FF-2");
  const ncg = games.filter((g) => g.round === "championship");

  const birdseyeProps = {
    games,
    allGames,
    teamsById,
    usersById,
    ownershipRows,
    results,
    viewerUserId: viewerUserId ?? null,
    onOpenZone: openZoneFromOverview,
    groupTeamsUnassigned,
    bracketPrivateInvite,
    bracketInviteSlot,
    onBracketInviteClick,
    prizeStartRound,
    variant: "desktop" as const,
  };

  return (
    <>
      <div className="desktop-bracket-shell">
        <div
          className="desktop-bracket-tabs desktop-bracket-tabs--scroll"
          role="tablist"
          aria-label="Bracket sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={desktopPane === "overview"}
            className={`desktop-bracket-tab${desktopPane === "overview" ? " desktop-bracket-tab--active" : ""}`}
            onClick={() => setDesktopPane("overview")}
          >
            Overview
          </button>
          {regionalTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={desktopPane === t.key}
              className={`desktop-bracket-tab${desktopPane === t.key ? " desktop-bracket-tab--active" : ""}`}
              onClick={() => setDesktopPane(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {desktopPane === "overview" ? (
          <div className="desktop-bracket-overview-root">
            <BracketBirdseye {...birdseyeProps} />
          </div>
        ) : (
          <div
            className="desktop-bracket-regional-detail"
            role="tabpanel"
          >
            {bracketInviteSlot && onBracketInviteClick ? (
              <div className="desktop-bracket-private-invite">
                <BracketInviteActions
                  slot={bracketInviteSlot}
                  onInviteClick={onBracketInviteClick}
                />
              </div>
            ) : bracketPrivateInvite ? (
              <div className="desktop-bracket-private-invite">
                <BracketPrivateInviteLines {...bracketPrivateInvite} />
              </div>
            ) : null}
            {desktopPane === "East" && (
              <div className="desktop-regional-detail-pane" data-desktop-pane="East">
                <RegionQuadrant title="East" games={east} flow="ltr" {...mprops} />
              </div>
            )}
            {desktopPane === "South" && (
              <div className="desktop-regional-detail-pane" data-desktop-pane="South">
                <RegionQuadrant
                  title="South"
                  games={south}
                  flow="ltr"
                  {...mprops}
                />
              </div>
            )}
            {desktopPane === "West" && (
              <div className="desktop-regional-detail-pane" data-desktop-pane="West">
                <RegionQuadrant title="West" games={west} flow="rtl" {...mprops} />
              </div>
            )}
            {desktopPane === "Midwest" && (
              <div
                className="desktop-regional-detail-pane"
                data-desktop-pane="Midwest"
              >
                <RegionQuadrant
                  title="Midwest"
                  games={midwest}
                  flow="rtl"
                  {...mprops}
                />
              </div>
            )}
            {desktopPane === "first-four" && firstFourGames.length > 0 && (
              <section
                className="first-four-section desktop-regional-detail-pane"
                data-desktop-pane="first-four"
                aria-label="First Four play-in games"
              >
                <h2 className="first-four-section-title">First Four</h2>
                <p className="first-four-section-hint">
                  Play-in games — winners join the Round of 64 in the main
                  bracket.
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
            {desktopPane === "final-four" && (
              <div
                className="desktop-regional-detail-pane desktop-final-four-pane"
                data-desktop-pane="final-four"
              >
                <section
                  className="kalshi-final-band"
                  aria-label="Final Four and National Championship"
                >
                  <h2 className="first-four-section-title">
                    Final Four & Championship
                  </h2>
                  <BracketCenterHub
                    ff1={ff1}
                    ff2={ff2}
                    ncg={ncg}
                    {...mprops}
                  />
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
