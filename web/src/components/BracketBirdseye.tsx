import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import type { BracketGame, GameResult, Team, User } from "../types";
import type { OwnershipRow } from "../lib/ownershipMap";
import { regionGamesByColumn } from "../lib/regionRoundColumns";
import {
  isPrizePayoutRoundOverview,
  overviewDesktopCellCopy,
  overviewPrizeMarkerLabel,
  overviewSlotVisual,
  prizeDollarBelowAriaLabel,
  type OverviewDesktopCellCopy,
  type OverviewSlotVisual,
} from "../lib/overviewPickStatus";
import { BirdseyeMiniBracket } from "./BirdseyeMiniBracket";
import {
  BIRDSEYE_CHAMPION_SLOT_FACTOR,
  BIRDSEYE_DESKTOP_BRIDGE_NATURAL,
  BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO,
  BIRDSEYE_DESKTOP_PAD_X,
  BIRDSEYE_DESKTOP_SLOT_NATURAL,
  BIRDSEYE_SLOT_NATURAL,
  birdseyeMetricsEqual,
  computeOverviewSlotMetrics,
  type BirdseyeOverviewMetrics,
} from "../lib/birdseyeOverviewLayout";
import {
  DEFAULT_PRIZE_START_ROUND,
  type PrizeStartRound,
} from "../lib/prizeStartRound";

const DESKTOP_OVERVIEW_MIN_TREE_H = 560;
/** Matches `verticalGapPx` on East `MiniRegionTree` (used in regional slot-height fallback). */
const EAST_OVERVIEW_VERTICAL_GAP_PX = 4;
const EAST_OVERVIEW_MAX_COLUMN_GAMES = 8;

/** Center hub semifinals only — championship cell keeps champPx square. */
const DESKTOP_CENTER_SEMI_HEIGHT_LANDSCAPE_MULT = 1.22;
const DESKTOP_CENTER_SEMI_MAX_HOST_H_FRAC = 0.52;
const COMPACT_CENTER_SEMI_HEIGHT_MULT = 1.08;

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
};

export type BracketInviteSlot = {
  visibility: "public" | "private";
  joinCode: string;
  password: string;
  groupId: string;
};

export function BracketInviteActions({
  slot,
  onInviteClick,
}: {
  slot: BracketInviteSlot;
  onInviteClick: () => boolean | Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleInvite = async () => {
    const ok = await Promise.resolve(onInviteClick());
    if (!ok) return;
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopied(true);
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 3000);
  };

  return (
    <div className="birdseye-invite-actions">
      {slot.visibility === "private" ? (
        <BracketPrivateInviteLines
          joinCode={slot.joinCode}
          password={slot.password}
        />
      ) : null}
      <div className="birdseye-invite-actions-row">
        <span className="birdseye-invite-friends">Invite your friends</span>
        <button
          type="button"
          className={
            "btn-primary birdseye-invite-cta" +
            (copied ? " birdseye-invite-cta--copied" : "")
          }
          onClick={() => void handleInvite()}
          aria-label={copied ? "Invite link copied" : "Copy invite to clipboard"}
        >
          {copied ? (
            <svg
              className="birdseye-invite-cta-check"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M9 16.17L4.83 12l-1.42 1.41L9 19l12-12-1.41-1.41L9 16.17z"
              />
            </svg>
          ) : (
            <span className="birdseye-invite-cta-plus" aria-hidden>
              +
            </span>
          )}{" "}
          Invite
        </button>
      </div>
    </div>
  );
}

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
}: GroupTeamsUnassignedHintProps) {
  return (
    <p className="birdseye-hint birdseye-hint--unassigned">
      <span className="birdseye-unassigned-line1">
        <strong>{joined}</strong> / <strong>{max}</strong> players joined.
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
  /** Not full: invite row on overview (+ Invite). */
  bracketInviteSlot?: BracketInviteSlot | null;
  onBracketInviteClick?: () => boolean | Promise<boolean>;
  /** @deprecated Prefer bracketInviteSlot */
  bracketPrivateInvite?: { joinCode: string; password: string } | null;
  /** Desktop: larger cells + wider round spacing (same UI as mobile). */
  variant?: "compact" | "desktop";
  /** Private group setting: first round that counts for prize hints on overview (default Elite 8). */
  prizeStartRound?: PrizeStartRound;
};

function OverviewSlot({
  game,
  visual,
  desktopCopy = null,
  prizeStartRound = DEFAULT_PRIZE_START_ROUND,
}: {
  game: BracketGame;
  visual: OverviewSlotVisual;
  desktopCopy?: OverviewDesktopCellCopy | null;
  prizeStartRound?: PrizeStartRound;
}) {
  const { status, initials, livePair, liveViewerInvolved, prizeMarker } = visual;
  const hasDesktopRich = Boolean(
    desktopCopy &&
      (desktopCopy.liveLeft ||
        desktopCopy.liveRight ||
        desktopCopy.primaryLine ||
        desktopCopy.detailLine)
  );
  const ariaDesktop =
    hasDesktopRich && desktopCopy
      ? desktopCopy.liveLeft && desktopCopy.liveRight
        ? `${desktopCopy.liveLeft.name}, ${desktopCopy.liveLeft.tail}. ${desktopCopy.liveRight.name}, ${desktopCopy.liveRight.tail}`
        : [desktopCopy.primaryLine, desktopCopy.detailLine]
            .filter((s) => s && String(s).trim() !== "")
            .join(". ")
      : null;
  const label =
    prizeMarker && status === "pending" && !hasDesktopRich
      ? overviewPrizeMarkerLabel(game, prizeStartRound)
      : initials !== ""
        ? `${game.id}: ${initials}${status === "live" ? " (live)" : ""}`
        : `${game.id}${status === "pending" ? " (pending)" : ""}`;
  const showLiveStack =
    status === "live" && livePair != null && !hasDesktopRich;
  return (
    <div
      className={`overview-slot overview-slot--${status}${initials ? " overview-slot--has-initials" : ""}${liveViewerInvolved ? " overview-slot--live-involved" : ""}${prizeMarker ? " overview-slot--prize-milestone" : ""}${hasDesktopRich ? " overview-slot--desktop-rich" : ""}`}
      title={ariaDesktop ?? label}
      aria-label={ariaDesktop ?? label}
    >
      {hasDesktopRich && desktopCopy ? (
        <span className="overview-slot-desktop-stack" aria-hidden>
          {desktopCopy.liveLeft && desktopCopy.liveRight ? (
            <span className="overview-slot-desktop-live-split">
              <span className="overview-slot-desktop-live-col">
                <span className="overview-slot-desktop-name">
                  {desktopCopy.liveLeft.name}
                </span>
                <span className="overview-slot-desktop-meta overview-slot-desktop-meta--detail">
                  {desktopCopy.liveLeft.tail}
                </span>
              </span>
              <span className="overview-slot-desktop-live-col">
                <span className="overview-slot-desktop-name">
                  {desktopCopy.liveRight.name}
                </span>
                <span className="overview-slot-desktop-meta overview-slot-desktop-meta--detail">
                  {desktopCopy.liveRight.tail}
                </span>
              </span>
            </span>
          ) : (
            <>
              {desktopCopy.primaryLine ? (
                <span className="overview-slot-desktop-name overview-slot-desktop-name--primary">
                  {desktopCopy.primaryLine}
                </span>
              ) : null}
              {desktopCopy.detailLine ? (
                <span className="overview-slot-desktop-meta overview-slot-desktop-meta--detail">
                  {desktopCopy.detailLine}
                </span>
              ) : null}
            </>
          )}
        </span>
      ) : showLiveStack ? (
        <span
          className="overview-slot-initials overview-slot-initials--live-stack"
          aria-hidden
        >
          <span className="overview-slot-initials-line">{livePair!.a}</span>
          <span className="overview-slot-initials-line">{livePair!.b}</span>
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
  variant = "compact",
  ...ctx
}: {
  region: string;
  onLayoutMetrics?: (m: BirdseyeOverviewMetrics) => void;
  variant?: "compact" | "desktop";
} & Omit<Base, "onOpenZone">) {
  const prizeStartRound = ctx.prizeStartRound ?? DEFAULT_PRIZE_START_ROUND;
  /** R64 → R32 → S16 → E8 for all regions so fork lines match real feeder rounds. */
  const columns = regionGamesByColumn(region, ctx.allGames);
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;
  const progressDirection =
    region === "West" || region === "Midwest" ? "rtl" : "ltr";
  const isDesktop = variant === "desktop";
  const naturalDims = isDesktop
    ? {
        slot: BIRDSEYE_DESKTOP_SLOT_NATURAL,
        bridge: BIRDSEYE_DESKTOP_BRIDGE_NATURAL,
      }
    : undefined;

  return (
    <BirdseyeMiniBracket
      columns={columns}
      progressDirection={progressDirection}
      onLayoutMetrics={region === "East" ? onLayoutMetrics : undefined}
      naturalDimensions={naturalDims}
      minTreeHeightPx={isDesktop ? DESKTOP_OVERVIEW_MIN_TREE_H : undefined}
      verticalGapPx={isDesktop ? 4 : 0}
      prizeStartRound={prizeStartRound}
      renderSlot={(g) => (
        <OverviewSlot
          game={g}
          prizeStartRound={prizeStartRound}
          desktopCopy={
            isDesktop
              ? overviewDesktopCellCopy(
                  g,
                  ctx.viewerUserId,
                  ctx.allGames,
                  ctx.results,
                  ctx.ownershipRows,
                  ctx.teamsById,
                  ctx.usersById,
                  dn
                )
              : null
          }
          visual={overviewSlotVisual(
            g,
            ctx.viewerUserId,
            ctx.allGames,
            ctx.results,
            ctx.ownershipRows,
            ctx.teamsById,
            ctx.usersById,
            dn,
            prizeStartRound
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
  variant = "compact",
  ...ctx
}: {
  ff1: BracketGame | undefined;
  ff2: BracketGame | undefined;
  ncg: BracketGame[];
  eastLayoutMetrics: BirdseyeOverviewMetrics | null;
  variant?: "compact" | "desktop";
} & Omit<Base, "onOpenZone">) {
  const prizeStartRound = ctx.prizeStartRound ?? DEFAULT_PRIZE_START_ROUND;
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostW, setHostW] = useState(0);
  const [hostH, setHostH] = useState(0);
  const dn = (uid: string) => ctx.usersById.get(uid)?.display_name ?? uid;
  const isDesktop = variant === "desktop";
  const naturalDims = isDesktop
    ? {
        slot: BIRDSEYE_DESKTOP_SLOT_NATURAL,
        bridge: BIRDSEYE_DESKTOP_BRIDGE_NATURAL,
      }
    : undefined;
  const naturalSlot = isDesktop
    ? BIRDSEYE_DESKTOP_SLOT_NATURAL
    : BIRDSEYE_SLOT_NATURAL;
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
      const r = el.getBoundingClientRect();
      setHostW(r.width);
      setHostH(r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gapBase = 7;
  const padInner = 4;
  const fallback =
    hostW > 0
      ? computeOverviewSlotMetrics(
          hostW,
          naturalDims,
          isDesktop
            ? {
                availableHostHeight: hostH > 0 ? hostH : DESKTOP_OVERVIEW_MIN_TREE_H,
                maxColumnGames: 8,
                verticalGapPx: 4,
                slotVerticalFactor: BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO,
              }
            : null,
          isDesktop ? { horizontalPadPx: BIRDSEYE_DESKTOP_PAD_X } : undefined
        )
      : null;
  const slotBase =
    eastLayoutMetrics?.slotPx ?? fallback?.slotPx ?? naturalSlot;
  const champBase = slotBase * BIRDSEYE_CHAMPION_SLOT_FACTOR;
  const gapUnscaled = Math.max(4, gapBase * (slotBase / naturalSlot));
  const stripNeed =
    slotBase + gapUnscaled + champBase + gapUnscaled + slotBase + 2 * padInner;
  const fit =
    hostW > 0 && stripNeed > hostW ? Math.min(1, hostW / stripNeed) : 1;
  const slotPx = slotBase * fit;
  const champPx = champBase * fit;
  const gapPx = gapUnscaled * fit;
  const layoutScaleSide = slotPx / naturalSlot;
  const layoutScaleChamp = champPx / naturalSlot;

  /** Same pixel height as East regional overview cells (before center-hub horizontal `fit` shrink). */
  const regionalOverviewCellHeightPx =
    eastLayoutMetrics?.slotHeightPx ??
    (isDesktop
      ? Math.min(
          slotBase * BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO,
          DESKTOP_OVERVIEW_MIN_TREE_H / EAST_OVERVIEW_MAX_COLUMN_GAMES -
            EAST_OVERVIEW_VERTICAL_GAP_PX
        )
      : slotBase);

  return (
    <div ref={hostRef} className="birdseye-zone-center-hub-host">
      <div className="birdseye-center-mini" style={{ gap: `${gapPx}px` }}>
        {cells.map(({ key, game, aria }) => {
          const isChamp = key === "ncg";
          const w = isChamp ? champPx : slotPx;
          const h = isChamp
            ? champPx
            : isDesktop
              ? Math.max(
                  regionalOverviewCellHeightPx,
                  Math.min(
                    slotPx *
                      BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO *
                      DESKTOP_CENTER_SEMI_HEIGHT_LANDSCAPE_MULT,
                    hostH > 0
                      ? hostH * DESKTOP_CENTER_SEMI_MAX_HOST_H_FRAC
                      : slotPx
                  )
                )
              : Math.max(
                  regionalOverviewCellHeightPx,
                  slotPx * COMPACT_CENTER_SEMI_HEIGHT_MULT
                );
          const scale = isChamp ? layoutScaleChamp : layoutScaleSide;
          const frameStyle = {
            width: w,
            height: h,
            "--birdseye-layout-scale": String(scale),
          } as CSSProperties;
          return game ? (
            <div
              key={game.id}
              className="birdseye-mini-slot-stack birdseye-mini-slot-stack--center-hub"
              style={
                {
                  "--birdseye-layout-scale": String(scale),
                } as CSSProperties
              }
            >
              <div
                className={`birdseye-mini-slot-frame${isChamp ? " birdseye-mini-slot-frame--championship" : ""}${isDesktop && !isChamp ? " birdseye-mini-slot-frame--desktop-landscape" : ""}`}
                style={frameStyle}
              >
                <OverviewSlot
                  game={game}
                  prizeStartRound={prizeStartRound}
                  desktopCopy={
                    isDesktop
                      ? overviewDesktopCellCopy(
                          game,
                          ctx.viewerUserId,
                          ctx.allGames,
                          ctx.results,
                          ctx.ownershipRows,
                          ctx.teamsById,
                          ctx.usersById,
                          dn
                        )
                      : null
                  }
                  visual={overviewSlotVisual(
                    game,
                    ctx.viewerUserId,
                    ctx.allGames,
                    ctx.results,
                    ctx.ownershipRows,
                    ctx.teamsById,
                    ctx.usersById,
                    dn,
                    prizeStartRound
                  )}
                />
              </div>
              {isPrizePayoutRoundOverview(game, prizeStartRound) ? (
                <span
                  className="birdseye-prize-dollar-below"
                  aria-label={prizeDollarBelowAriaLabel(
                    game,
                    prizeStartRound
                  )}
                >
                  $
                </span>
              ) : null}
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
  bracketInviteSlot = null,
  onBracketInviteClick,
  bracketPrivateInvite = null,
  variant = "compact",
  prizeStartRound: prizeStartRoundProp,
  ...ctx
}: Base) {
  const prizeStartRound = prizeStartRoundProp ?? DEFAULT_PRIZE_START_ROUND;
  const ctxWithPrize = { ...ctx, prizeStartRound };
  const { allGames } = ctx;
  const ff1 = allGames.find((g) => g.id === "FF-1");
  const ff2 = allGames.find((g) => g.id === "FF-2");
  const ncg = allGames.filter((g) => g.round === "championship");
  const [eastLayoutMetrics, setEastLayoutMetrics] =
    useState<BirdseyeOverviewMetrics | null>(null);

  const commitEastLayoutMetrics = useCallback((m: BirdseyeOverviewMetrics) => {
    setEastLayoutMetrics((prev) => {
      if (prev && birdseyeMetricsEqual(prev, m)) return prev;
      return m;
    });
  }, []);

  return (
    <div
      className={`birdseye-wrap${variant === "desktop" ? " birdseye-wrap--desktop" : ""}`}
    >
      {groupTeamsUnassigned ? (
        <>
          <GroupTeamsUnassignedHint {...groupTeamsUnassigned} />
          {bracketInviteSlot && onBracketInviteClick ? (
            <BracketInviteActions
              slot={bracketInviteSlot}
              onInviteClick={onBracketInviteClick}
            />
          ) : null}
        </>
      ) : (
        <>
          {bracketInviteSlot && onBracketInviteClick ? (
            <BracketInviteActions
              slot={bracketInviteSlot}
              onInviteClick={onBracketInviteClick}
            />
          ) : bracketPrivateInvite ? (
            <BracketPrivateInviteLines {...bracketPrivateInvite} />
          ) : null}
          <p className="birdseye-hint">
            <span className="birdseye-prize-dollar-below">$</span> = winning this game
            qualifies you for a prize. Need a rules refresher?{" "}
            <Link to="/rules#game-rules-h" className="group-hub-rules-link">
              Check here
            </Link>
            .
          </p>
        </>
      )}
      <div
        className={`birdseye-arena birdseye-arena--quad${variant === "desktop" ? " birdseye-arena--quad-desktop" : ""}`}
        role="presentation"
      >
        <button
          type="button"
          className="birdseye-zone birdseye-zone--east"
          onClick={() => onOpenZone("East")}
        >
          <span className="birdseye-zone-label">East</span>
          <MiniRegionTree
            region="East"
            onLayoutMetrics={commitEastLayoutMetrics}
            variant={variant}
            {...ctxWithPrize}
          />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--west"
          onClick={() => onOpenZone("West")}
        >
          <span className="birdseye-zone-label">West</span>
          <MiniRegionTree region="West" variant={variant} {...ctxWithPrize} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--south birdseye-zone--label-bottom"
          onClick={() => onOpenZone("South")}
        >
          <span className="birdseye-zone-label">South</span>
          <MiniRegionTree region="South" variant={variant} {...ctxWithPrize} />
        </button>
        <button
          type="button"
          className="birdseye-zone birdseye-zone--midwest birdseye-zone--label-bottom"
          onClick={() => onOpenZone("Midwest")}
        >
          <span className="birdseye-zone-label">Midwest</span>
          <MiniRegionTree region="Midwest" variant={variant} {...ctxWithPrize} />
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
            variant={variant}
            {...ctxWithPrize}
          />
        </button>
      </div>
    </div>
  );
}
