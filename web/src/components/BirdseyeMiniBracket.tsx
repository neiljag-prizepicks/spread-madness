import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { BracketGame } from "../types";
import {
  BIRDSEYE_BRIDGE_NATURAL as BRIDGE_NATURAL,
  BIRDSEYE_SLOT_NATURAL as SLOT_NATURAL,
  computeOverviewSlotMetrics,
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
  slotPx,
  renderSlot,
}: {
  games: BracketGame[];
  heightPx: number;
  slotPx: number;
  renderSlot: (game: BracketGame) => ReactNode;
}) {
  const n = games.length;
  if (n === 0) {
    return (
      <div
        className="birdseye-mini-col birdseye-mini-col--bracket"
        style={{ height: heightPx, width: slotPx, minWidth: slotPx }}
      />
    );
  }
  return (
    <div
      className="birdseye-mini-col birdseye-mini-col--bracket"
      style={{ height: heightPx, width: slotPx, minWidth: slotPx }}
    >
      {games.map((g, i) => (
        <div
          key={g.id}
          className="birdseye-mini-slot-anchor"
          style={{
            top: `${(100 * (2 * i + 1)) / (2 * n)}%`,
          }}
        >
          <div
            className="birdseye-mini-slot-frame"
            style={{ width: slotPx, height: slotPx }}
          >
            {renderSlot(g)}
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  columns: BracketGame[][];
  renderSlot: (game: BracketGame) => ReactNode;
  /** West/Midwest: outer round on the right, finishes toward center (Final Four). */
  progressDirection?: "ltr" | "rtl";
  /** When set (e.g. East region), reports slot size so Final Four can match. */
  onLayoutMetrics?: (m: BirdseyeOverviewMetrics) => void;
};

/**
 * Regional overview: fills the region card vertically; scales down horizontally
 * so the bracket stays inside rounded borders (no bleed).
 */
export function BirdseyeMiniBracket({
  columns,
  renderSlot,
  progressDirection = "ltr",
  onLayoutMetrics,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: MIN_TREE_HEIGHT });

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = cr.width;
      const h = Math.max(MIN_TREE_HEIGHT, cr.height);
      setBox({ w, h });
      if (onLayoutMetrics && w > 0) {
        onLayoutMetrics(computeOverviewSlotMetrics(w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onLayoutMetrics]);

  const hasAny = columns.some((c) => c.length > 0);
  const { layoutScale, slotPx, bridgeW } = computeOverviewSlotMetrics(box.w);
  const heightPx = box.h;

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
          style={{ ...treeStyle, minHeight: MIN_TREE_HEIGHT }}
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
                slotPx={slotPx}
                renderSlot={renderSlot}
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
