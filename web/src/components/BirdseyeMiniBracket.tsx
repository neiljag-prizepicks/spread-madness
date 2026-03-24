import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { BracketGame } from "../types";
import {
  isPrizePayoutRoundOverview,
  prizeDollarBelowAriaLabel,
} from "../lib/overviewPickStatus";
import {
  DEFAULT_PRIZE_START_ROUND,
  type PrizeStartRound,
} from "../lib/prizeStartRound";
import {
  BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO,
  BIRDSEYE_DESKTOP_PAD_X,
  computeOverviewSlotMetrics,
  type BirdseyeNaturalDimensions,
  type BirdseyeOverviewMetrics,
} from "../lib/birdseyeOverviewLayout";

const MIN_TREE_HEIGHT = 196;

function slotCenterY(n: number, i: number, height: number): number {
  return ((2 * i + 1) / (2 * n)) * height;
}

function BracketConnectorBridge({
  nFrom,
  height,
  width,
}: {
  nFrom: number;
  height: number;
  width: number;
}) {
  if (nFrom < 2) return null;
  const nTo = nFrom / 2;
  if (!Number.isInteger(nTo) || nTo < 1) return null;

  const stub = Math.max(3, width * 0.38);
  const d: string[] = [];
  for (let i = 0; i < nTo; i++) {
    const y1 = slotCenterY(nFrom, 2 * i, height);
    const y2 = slotCenterY(nFrom, 2 * i + 1, height);
    const yMid = (y1 + y2) / 2;
    d.push(`M 0 ${y1} L ${stub} ${y1}`);
    d.push(`M 0 ${y2} L ${stub} ${y2}`);
    d.push(`M ${stub} ${y1} L ${stub} ${y2}`);
    d.push(`M ${stub} ${yMid} L ${width} ${yMid}`);
  }

  return (
    <svg
      className="birdseye-mini-bridge-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d={d.join(" ")}
        stroke="rgba(255, 255, 255, 0.34)"
        strokeWidth={1.15}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}


function MiniColumn({
  games,
  heightPx,
  slotWidthPx,
  slotHeightPx,
  renderSlot,
  prizeStartRound,
}: {
  games: BracketGame[];
  heightPx: number;
  slotWidthPx: number;
  slotHeightPx: number;
  renderSlot: (game: BracketGame) => ReactNode;
  prizeStartRound: PrizeStartRound;
}) {
  const n = games.length;
  if (n === 0) {
    return (
      <div
        className="birdseye-mini-col birdseye-mini-col--bracket"
        style={{
          height: heightPx,
          width: slotWidthPx,
          minWidth: slotWidthPx,
        }}
      />
    );
  }
  return (
    <div
      className="birdseye-mini-col birdseye-mini-col--bracket"
      style={{ height: heightPx, width: slotWidthPx, minWidth: slotWidthPx }}
    >
      {games.map((g, i) => {
        // Band midpoints match BracketConnectorBridge slotCenterY; anchor by frame center
        // (not stack center) so optional prize "$" below does not pull lines off the cell.
        const bandCenterY = ((2 * i + 1) / (2 * n)) * heightPx;
        return (
        <div
          key={g.id}
          className="birdseye-mini-slot-anchor birdseye-mini-slot-anchor--frame-centered"
          style={{
            top: `${bandCenterY - slotHeightPx / 2}px`,
          }}
        >
          <div className="birdseye-mini-slot-stack">
            <div
              className={`birdseye-mini-slot-frame${slotWidthPx > slotHeightPx ? " birdseye-mini-slot-frame--desktop-landscape" : ""}`}
              style={{ width: slotWidthPx, height: slotHeightPx }}
            >
              {renderSlot(g)}
            </div>
            {isPrizePayoutRoundOverview(g, prizeStartRound) ? (
              <span
                className="birdseye-prize-dollar-below"
                aria-label={prizeDollarBelowAriaLabel(g, prizeStartRound)}
              >
                $
              </span>
            ) : null}
          </div>
        </div>
        );
      })}
    </div>
  );
}

type Props = {
  columns: BracketGame[][];
  renderSlot: (game: BracketGame) => ReactNode;
  prizeStartRound?: PrizeStartRound;
  /** West/Midwest: outer round on the right, finishes toward center (Final Four). */
  progressDirection?: "ltr" | "rtl";
  /** When set (e.g. East region), reports slot size so Final Four can match. */
  onLayoutMetrics?: (m: BirdseyeOverviewMetrics) => void;
  /** Larger slot/bridge bases (desktop overview). */
  naturalDimensions?: BirdseyeNaturalDimensions;
  minTreeHeightPx?: number;
  /** Keeps stacked squares from overlapping when height is tight. */
  verticalGapPx?: number;
};

/**
 * Regional overview: fills the region card; layout scale grows or shrinks so the
 * tree uses available width (and height) without bleeding past the zone.
 */
export function BirdseyeMiniBracket({
  columns,
  renderSlot,
  prizeStartRound = DEFAULT_PRIZE_START_ROUND,
  progressDirection = "ltr",
  onLayoutMetrics,
  naturalDimensions,
  minTreeHeightPx,
  verticalGapPx = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const lastSentMetricsKey = useRef<string>("");
  const minH = minTreeHeightPx ?? MIN_TREE_HEIGHT;
  const [box, setBox] = useState({ w: 0, h: minH });

  const maxColumnGames = useMemo(
    () => Math.max(1, ...columns.map((c) => c.length)),
    [columns]
  );

  const metrics = useMemo(
    () =>
      computeOverviewSlotMetrics(
        box.w,
        naturalDimensions,
        naturalDimensions && box.h > 0
          ? {
              availableHostHeight: box.h,
              maxColumnGames: maxColumnGames,
              verticalGapPx,
              slotVerticalFactor: BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO,
            }
          : null,
        naturalDimensions
          ? { horizontalPadPx: BIRDSEYE_DESKTOP_PAD_X }
          : undefined
      ),
    [box.w, box.h, naturalDimensions, maxColumnGames, verticalGapPx]
  );

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = cr.width;
      const h = Math.max(minH, cr.height);
      setBox((prev) => {
        if (
          Math.abs(prev.w - w) < 0.5 &&
          Math.abs(prev.h - h) < 0.5
        ) {
          return prev;
        }
        return { w, h };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minH]);

  const hasAny = columns.some((c) => c.length > 0);
  const { layoutScale, slotPx, bridgeW } = metrics;
  const heightPx = box.h;

  const maxSlotH =
    box.h > 0 && maxColumnGames > 0
      ? box.h / maxColumnGames - verticalGapPx
      : Number.POSITIVE_INFINITY;
  const slotWidthPx = slotPx;
  const slotHeightPx = naturalDimensions
    ? Math.min(slotPx * BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO, maxSlotH)
    : slotPx;

  useLayoutEffect(() => {
    if (!onLayoutMetrics || box.w <= 0) return;
    const m: BirdseyeOverviewMetrics = { ...metrics, slotHeightPx };
    const key = `${m.layoutScale.toFixed(5)}:${m.slotPx.toFixed(3)}:${m.bridgeW.toFixed(3)}:${slotHeightPx.toFixed(3)}`;
    if (key === lastSentMetricsKey.current) return;
    lastSentMetricsKey.current = key;
    onLayoutMetrics(m);
  }, [onLayoutMetrics, metrics, box.w, slotHeightPx]);

  const treeStyle = {
    "--birdseye-tree-h": `${heightPx}px`,
    "--birdseye-slot": `${slotPx}px`,
    "--birdseye-bridge": `${bridgeW}px`,
    "--birdseye-layout-scale": String(layoutScale),
  } as CSSProperties;

  if (!hasAny) {
    return (
      <div ref={hostRef} className="birdseye-zone-bracket-host">
        <div
          className={`birdseye-mini-tree birdseye-mini-tree--bracket birdseye-mini-tree--bracket-empty${progressDirection === "rtl" ? " birdseye-mini-tree--progress-rtl" : ""}`}
          style={{ ...treeStyle, minHeight: minH }}
        />
      </div>
    );
  }

  return (
    <div ref={hostRef} className="birdseye-zone-bracket-host">
      <div
        className={`birdseye-mini-tree birdseye-mini-tree--bracket${progressDirection === "rtl" ? " birdseye-mini-tree--progress-rtl" : ""}`}
        style={{
          ...treeStyle,
          height: heightPx,
          minHeight: heightPx,
        }}
      >
        {columns.map((col, ci) => {
          const next = columns[ci + 1];
          const showBridge = Boolean(
            next && next.length > 0 && col.length > 0
          );
          return (
            <div key={ci} className="birdseye-mini-tree-segment">
              <MiniColumn
                games={col}
                heightPx={heightPx}
                slotWidthPx={slotWidthPx}
                slotHeightPx={slotHeightPx}
                renderSlot={renderSlot}
                prizeStartRound={prizeStartRound}
              />
              {showBridge ? (
                <div
                  className="birdseye-mini-bridge"
                  style={{
                    height: heightPx,
                    flexBasis: bridgeW,
                    width: bridgeW,
                    minWidth: bridgeW,
                  }}
                >
                  <BracketConnectorBridge
                    nFrom={col.length}
                    height={heightPx}
                    width={bridgeW}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
