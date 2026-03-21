import { useState } from "react";
import { Link } from "react-router-dom";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { regionGamesByColumn } from "../lib/regionRoundColumns";
import {
  overviewSlotVisual,
  type OverviewSlotVisual,
} from "../lib/overviewPickStatus";

export type BracketPane =
  | "overview"
  | "East"
  | "South"
  | "West"
  | "Midwest"
  | "first-four"
  | "final-four";

export type GroupTeamsUnassignedHintProps = {
  joined: number;
  max: number;
  isAdmin: boolean;
  assignPath: string;
  /** Private group, not full: show join code/password under the player count. */
  privateInvite?: { joinCode: string; password: string } | null;
};

function CopyableInviteValue({
  value,
  name,
}: {
  value: string;
  name: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be unavailable */
    }
  };
  return (
    <button
      type="button"
      className={`birdseye-copyable-value${copied ? " birdseye-copyable-value--copied" : ""}`}
      onClick={() => void copy()}
      title={copied ? "Copied" : `Copy ${name}`}
      aria-label={`Copy ${name}: ${value}`}
    >
      {value}
    </button>
  );
}

export function BracketPrivateInviteLines({
  joinCode,
  password,
}: {
  joinCode: string;
  password: string;
}) {
  return (
    <p className="birdseye-hint birdseye-hint--private-invite">
      <span className="birdseye-private-invite-line">
        Join Code: <CopyableInviteValue value={joinCode} name="join code" />
        {" "}
        - Group Password:{" "}
        <CopyableInviteValue value={password} name="group password" />
      </span>
    </p>
  );
}

export function GroupTeamsUnassignedHint({
  joined,
  max,
  isAdmin,
  assignPath,
  privateInvite = null,
}: GroupTeamsUnassignedHintProps) {
  return (
    <p className="birdseye-hint birdseye-hint--unassigned">
      <span className="birdseye-unassigned-line1">
        <strong>{joined}</strong> / <strong>{max}</strong> players joined.
        {privateInvite ? (
          <>
            {" "}
            Join Code:{" "}
            <CopyableInviteValue
              value={privateInvite.joinCode}
              name="join code"
            />
            {" "}
            - Group Password:{" "}
            <CopyableInviteValue
              value={privateInvite.password}
              name="group password"
            />
          </>
        ) : null}
      </span>
      <br />
      {isAdmin ? (
        <>
          <Link to={assignPath} className="birdseye-hint-assign-link">
            Assign teams
          </Link>{" "}
          once the group is full.
        </>
      ) : (
        <>Teams will be assigned once group is full.</>
      )}
    </p>
  );
}

type Base = {
  games: BracketGame[];
  allGames: BracketGame[];
  teamsById: Map<string, Team>;
  usersById: Map<string, User>;
  ownershipRows: OwnershipRow[];
  results: Map<string, GameResult>;
  viewerUserId: string | null;
  onOpenZone: (pane: Exclude<BracketPane, "overview">) => void;
  /** When set, replaces the overview color key (teams not saved for this group yet). */
  groupTeamsUnassigned?: GroupTeamsUnassignedHintProps | null;
};

function OverviewSlot({
  game,
  visual,
}: {
  game: BracketGame;
  visual: OverviewSlotVisual;
}) {
  const { status, initials } = visual;
  const label =
    initials !== ""
      ? `${game.id}: ${initials}${status === "live" ? " (live)" : ""}`
      : `${game.id}${status === "pending" ? " (pending)" : ""}`;
  return (
    <div
      className={`overview-slot overview-slot--${status}${initials ? " overview-slot--has-initials" : ""}`}
      title={label}
      aria-label={label}
    >
      {initials !== "" && (
        <span className="overview-slot-initials" aria-hidden>
          {initials}
        </span>
      )}
    </div>
  );
}

function MiniRegionTree({
  region,
  mirrored,
  ...ctx
}: { region: string; mirrored: boolean } & Omit<Base, "onOpenZone">) {
  const columns = regionGamesByColumn(region, ctx.allGames);
  const ordered = mirrored ? [...columns].reverse() : columns;
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;

  return (
    <div
      className={`birdseye-mini-tree${mirrored ? " birdseye-mini-tree--rtl" : ""}`}
    >
      {ordered.map((col, ci) => (
        <div key={ci} className="birdseye-mini-col">
          {col.map((g) => (
            <OverviewSlot
              key={g.id}
              game={g}
              visual={overviewSlotVisual(
                g,
                ctx.viewerUserId,
                ctx.allGames,
                ctx.results,
                ctx.ownershipRows,
                ctx.teamsById,
                ctx.usersById,
                dn
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CenterMini({
  ff1,
  ff2,
  ncg,
  ...ctx
}: {
  ff1: BracketGame | undefined;
  ff2: BracketGame | undefined;
  ncg: BracketGame[];
} & Omit<Base, "onOpenZone">) {
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;
  const champ = ncg[0];
  const cells: { key: string; game: BracketGame | undefined; aria: string }[] =
    [
      { key: "ff1", game: ff1, aria: "Final Four game 1" },
      { key: "ncg", game: champ, aria: "National championship" },
      { key: "ff2", game: ff2, aria: "Final Four game 2" },
    ];

  return (
    <div className="birdseye-center-mini">
      {cells.map(({ key, game, aria }) =>
        game ? (
          <OverviewSlot
            key={game.id}
            game={game}
            visual={overviewSlotVisual(
              game,
              ctx.viewerUserId,
              ctx.allGames,
              ctx.results,
              ctx.ownershipRows,
              ctx.teamsById,
              ctx.usersById,
              dn
            )}
          />
        ) : (
          <div
            key={key}
            className="overview-slot overview-slot--pending"
            aria-label={`${aria} (not in data)`}
          />
        )
      )}
    </div>
  );
}

export function BracketBirdseye({
  onOpenZone,
  groupTeamsUnassigned = null,
  ...ctx
}: Base) {
  const { allGames } = ctx;
  const ff1 = allGames.find((g) => g.id === "FF-1");
  const ff2 = allGames.find((g) => g.id === "FF-2");
  const ncg = allGames.filter((g) => g.round === "championship");

  return (
    <div className="birdseye-wrap">
      {groupTeamsUnassigned ? (
        <GroupTeamsUnassignedHint {...groupTeamsUnassigned} />
      ) : (
        <p className="birdseye-hint">
          <strong className="birdseye-legend-live">Yellow</strong> = game is
          actively in progress. When final:{" "}
          <strong className="birdseye-legend-hit">green</strong> = you won
          control,{" "}
          <strong className="birdseye-legend-miss">red</strong> = you lost
          control,{" "}
          <strong className="birdseye-legend-neutral">purple</strong> = winner
          didn’t involve you.
        </p>
      )}
      <div className="birdseye-arena" role="presentation">
        <button
          type="button"
          className="birdseye-zone birdseye-zone--east"
          onClick={() => onOpenZone("East")}
        >
          <span className="birdseye-zone-label">East</span>
          <MiniRegionTree region="East" mirrored={false} {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--west"
          onClick={() => onOpenZone("West")}
        >
          <span className="birdseye-zone-label">West</span>
          <MiniRegionTree region="West" mirrored {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--center"
          onClick={() => onOpenZone("final-four")}
        >
          <span className="birdseye-zone-label">Final Four</span>
          <CenterMini ff1={ff1} ff2={ff2} ncg={ncg} {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--south"
          onClick={() => onOpenZone("South")}
        >
          <span className="birdseye-zone-label">South</span>
          <MiniRegionTree region="South" mirrored={false} {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--midwest"
          onClick={() => onOpenZone("Midwest")}
        >
          <span className="birdseye-zone-label">Midwest</span>
          <MiniRegionTree region="Midwest" mirrored {...ctx} />
        </button>
      </div>
    </div>
  );
}
