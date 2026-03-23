import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { regionGamesByColumn } from "../lib/regionRoundColumns";
import {
  overviewSlotVisual,
  type OverviewSlotVisual,
} from "../lib/overviewPickStatus";
import { BirdseyeMiniBracket } from "./BirdseyeMiniBracket";
import {
  BIRDSEYE_CHAMPION_SLOT_FACTOR,
  BIRDSEYE_SLOT_NATURAL,
  computeOverviewSlotMetrics,
  type BirdseyeOverviewMetrics,
} from "../lib/birdseyeOverviewLayout";

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
  const { status, initials, livePair, liveViewerInvolved } = visual;
  const label =
    initials !== ""
      ? `${game.id}: ${initials}${status === "live" ? " (live)" : ""}`
      : `${game.id}${status === "pending" ? " (pending)" : ""}`;
  const showLiveStack = status === "live" && livePair != null;
  return (
    <div
      className={`overview-slot overview-slot--${status}${initials ? " overview-slot--has-initials" : ""}${liveViewerInvolved ? " overview-slot--live-involved" : ""}`}
      title={label}
      aria-label={label}
    >
      {showLiveStack ? (
        <span
          className="overview-slot-initials overview-slot-initials--live-stack"
          aria-hidden
        >
          <span className="overview-slot-initials-line">{livePair.a}</span>
          <span className="overview-slot-initials-line">{livePair.b}</span>
        </span>
      ) : (
        initials !== "" && (
          <span className="overview-slot-initials" aria-hidden>
            {initials}
          </span>
        )
      )}
    </div>
  );
}

function MiniRegionTree({
  region,
  onLayoutMetrics,
  ...ctx
}: {
  region: string;
  onLayoutMetrics?: (m: BirdseyeOverviewMetrics) => void;
} & Omit<Base, "onOpenZone">) {
  /** R64 → R32 → S16 → E8 for all regions so fork lines match real feeder rounds. */
  const columns = regionGamesByColumn(region, ctx.allGames);
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;
  const progressDirection =
    region === "West" || region === "Midwest" ? "rtl" : "ltr";

  return (
    <BirdseyeMiniBracket
      columns={columns}
      progressDirection={progressDirection}
      onLayoutMetrics={region === "East" ? onLayoutMetrics : undefined}
      renderSlot={(g) => (
        <OverviewSlot
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
      )}
    />
  );
}

function CenterMini({
  ff1,
  ff2,
  ncg,
  eastLayoutMetrics,
  ...ctx
}: {
  ff1: BracketGame | undefined;
  ff2: BracketGame | undefined;
  ncg: BracketGame[];
  eastLayoutMetrics: BirdseyeOverviewMetrics | null;
} & Omit<Base, "onOpenZone">) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(0);
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;
  const champ = ncg[0];
  const cells: { key: string; game: BracketGame | undefined; aria: string }[] =
    [
      { key: "ff1", game: ff1, aria: "Final Four game 1" },
      { key: "ncg", game: champ, aria: "National championship" },
      { key: "ff2", game: ff2, aria: "Final Four game 2" },
    ];

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHostW(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gapBase = 7;
  const padInner = 4;
  const fallback = hostW > 0 ? computeOverviewSlotMetrics(hostW) : null;
  const slotBase =
    eastLayoutMetrics?.slotPx ?? fallback?.slotPx ?? BIRDSEYE_SLOT_NATURAL;
  const champBase = slotBase * BIRDSEYE_CHAMPION_SLOT_FACTOR;
  const gapUnscaled = Math.max(4, gapBase * (slotBase / BIRDSEYE_SLOT_NATURAL));
  const stripNeed =
    slotBase + gapUnscaled + champBase + gapUnscaled + slotBase + 2 * padInner;
  const fit =
    hostW > 0 && stripNeed > hostW ? Math.min(1, hostW / stripNeed) : 1;
  const slotPx = slotBase * fit;
  const champPx = champBase * fit;
  const gapPx = gapUnscaled * fit;
  const layoutScaleSide = slotPx / BIRDSEYE_SLOT_NATURAL;
  const layoutScaleChamp = champPx / BIRDSEYE_SLOT_NATURAL;

  return (
    <div ref={hostRef} className="birdseye-zone-center-hub-host">
      <div className="birdseye-center-mini" style={{ gap: `${gapPx}px` }}>
        {cells.map(({ key, game, aria }) => {
          const isChamp = key === "ncg";
          const w = isChamp ? champPx : slotPx;
          const h = isChamp ? champPx : slotPx;
          const scale = isChamp ? layoutScaleChamp : layoutScaleSide;
          const frameStyle = {
            width: w,
            height: h,
            "--birdseye-layout-scale": String(scale),
          } as CSSProperties;
          return game ? (
            <div
              key={game.id}
              className={`birdseye-mini-slot-frame${isChamp ? " birdseye-mini-slot-frame--championship" : ""}`}
              style={frameStyle}
            >
              <OverviewSlot
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
            </div>
          ) : (
            <div
              key={key}
              className={`birdseye-mini-slot-frame${isChamp ? " birdseye-mini-slot-frame--championship" : ""}`}
              style={frameStyle}
            >
              <div
                className="overview-slot overview-slot--pending"
                aria-label={`${aria} (not in data)`}
              />
            </div>
          );
        })}
      </div>
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
  const [eastLayoutMetrics, setEastLayoutMetrics] =
    useState<BirdseyeOverviewMetrics | null>(null);

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
      <div className="birdseye-arena birdseye-arena--quad" role="presentation">
        <button
          type="button"
          className="birdseye-zone birdseye-zone--east"
          onClick={() => onOpenZone("East")}
        >
          <span className="birdseye-zone-label">East</span>
          <MiniRegionTree
            region="East"
            onLayoutMetrics={setEastLayoutMetrics}
            {...ctx}
          />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--west"
          onClick={() => onOpenZone("West")}
        >
          <span className="birdseye-zone-label">West</span>
          <MiniRegionTree region="West" {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--south birdseye-zone--label-bottom"
          onClick={() => onOpenZone("South")}
        >
          <span className="birdseye-zone-label">South</span>
          <MiniRegionTree region="South" {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--midwest birdseye-zone--label-bottom"
          onClick={() => onOpenZone("Midwest")}
        >
          <span className="birdseye-zone-label">Midwest</span>
          <MiniRegionTree region="Midwest" {...ctx} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--center"
          onClick={() => onOpenZone("final-four")}
        >
          <span className="birdseye-zone-label">Final Four</span>
          <CenterMini
            ff1={ff1}
            ff2={ff2}
            ncg={ncg}
            eastLayoutMetrics={eastLayoutMetrics}
            {...ctx}
          />
        </button>
      </div>
    </div>
  );
}
