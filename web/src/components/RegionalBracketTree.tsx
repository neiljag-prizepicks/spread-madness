import type { MutableRefObject } from "react";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import type { RegionTreeRound } from "../lib/regionBracketNavigation";
import { Matchup } from "./Matchup";
import { BracketFork } from "./BracketFork";

export type RegionalTreeProps = {
  games: BracketGame[];
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  roundAnchorRefs?: MutableRefObject<
    Partial<Record<RegionTreeRound, HTMLElement | null>>
  >;
};

function sortByOrder(gs: BracketGame[]) {
  return [...gs].sort((a, b) => a.bracket_order - b.bracket_order);
}

export function feedersOf(
  allGames: BracketGame[],
  childId: string,
  feederRound: BracketGame["round"]
): BracketGame[] {
  return sortByOrder(
    allGames.filter(
      (g) => g.feeds_into?.game_id === childId && g.round === feederRound
    )
  );
}

type MProps = RegionalTreeProps;

function MatchupCol(props: { game: BracketGame } & MProps) {
  return (
    <Matchup
      game={props.game}
      allGames={props.allGames}
      teamsById={props.teamsById}
      usersById={props.usersById}
      ownershipRows={props.ownershipRows}
      results={props.results}
    />
  );
}

function R64ToR32Block({
  r32Game,
  registerColumnAnchors,
  ...rest
}: { r32Game: BracketGame; registerColumnAnchors?: boolean } & MProps) {
  const { roundAnchorRefs } = rest;
  const r64 = feedersOf(rest.allGames, r32Game.id, "round_of_64");
  const feedersRef =
    registerColumnAnchors && roundAnchorRefs
      ? (el: HTMLElement | null) => {
          roundAnchorRefs.current.round_of_64 = el;
        }
      : undefined;
  const r32Ref =
    registerColumnAnchors && roundAnchorRefs
      ? (el: HTMLElement | null) => {
          roundAnchorRefs.current.round_of_32 = el;
        }
      : undefined;

  if (r64.length < 2) {
    return (
      <div className="bracket-r64-r32">
        <div className="bracket-feeders" ref={feedersRef}>
          {r64.map((g) => (
            <MatchupCol key={g.id} game={g} {...rest} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="bracket-r64-r32">
      <div className="bracket-feeders" ref={feedersRef}>
        <div className="bracket-feeder-cell">
          <MatchupCol game={r64[0]} {...rest} />
        </div>
        <div className="bracket-feeder-cell">
          <MatchupCol game={r64[1]} {...rest} />
        </div>
      </div>
      <BracketFork />
      <div className="bracket-parent-slot" ref={r32Ref}>
        <MatchupCol game={r32Game} {...rest} />
      </div>
    </div>
  );
}

function S16Block({
  s16Game,
  registerColumnAnchors,
  ...rest
}: { s16Game: BracketGame; registerColumnAnchors?: boolean } & MProps) {
  const { roundAnchorRefs } = rest;
  const r32Games = feedersOf(rest.allGames, s16Game.id, "round_of_32");
  const s16Ref =
    registerColumnAnchors && roundAnchorRefs
      ? (el: HTMLElement | null) => {
          roundAnchorRefs.current.sweet_16 = el;
        }
      : undefined;
  return (
    <div className="bracket-s16-block">
      <div className="bracket-r32-stack">
        {r32Games.map((r32, ri) => (
          <R64ToR32Block
            key={r32.id}
            r32Game={r32}
            registerColumnAnchors={Boolean(
              registerColumnAnchors && ri === 0
            )}
            {...rest}
          />
        ))}
      </div>
      <BracketFork tall />
      <div className="bracket-s16-slot" ref={s16Ref}>
        <MatchupCol game={s16Game} {...rest} />
      </div>
    </div>
  );
}

type TreeProps = MProps & {
  /** `rtl` mirrors forks so Elite 8 sits on the Kalshi “inside” edge (toward center hub). */
  orientation?: "ltr" | "rtl";
};

/**
 * Staggered R64 → R32 → S16 → E8 tree (fork connectors).
 */
export function RegionalBracketTree({
  games,
  orientation = "ltr",
  ...mprops
}: TreeProps) {
  const { roundAnchorRefs } = mprops;
  const s16 = sortByOrder(games.filter((g) => g.round === "sweet_16"));
  const e8 = sortByOrder(games.filter((g) => g.round === "elite_8"));

  if (s16.length < 2 || !e8[0]) {
    return (
      <p className="bracket-fallback">
        Bracket tree needs Sweet 16 + Elite 8 games in data.
      </p>
    );
  }

  const e8Ref = roundAnchorRefs
    ? (el: HTMLElement | null) => {
        roundAnchorRefs.current.elite_8 = el;
      }
    : undefined;

  return (
    <div className={`regional-tree regional-tree--${orientation}`}>
      <div className="bracket-e8-row">
        <div className="bracket-s16-stack">
          {s16.map((s, si) => (
            <S16Block
              key={s.id}
              s16Game={s}
              registerColumnAnchors={Boolean(roundAnchorRefs && si === 0)}
              roundAnchorRefs={roundAnchorRefs}
              {...mprops}
            />
          ))}
        </div>
        <BracketFork tall />
        <div className="bracket-e8-slot" ref={e8Ref}>
          <MatchupCol game={e8[0]} {...mprops} />
        </div>
      </div>
    </div>
  );
}
