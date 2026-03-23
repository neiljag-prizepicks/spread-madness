/** Matches regional mini bracket: 4 columns + 3 bridge gaps at 1:1 scale */
export const BIRDSEYE_SLOT_NATURAL = 39;
export const BIRDSEYE_BRIDGE_NATURAL = 22;
/** Desktop overview: ~100px-wide cells at scale 1; scales with host (see computeOverviewSlotMetrics). */
export const BIRDSEYE_DESKTOP_SLOT_NATURAL = 100;
export const BIRDSEYE_DESKTOP_BRIDGE_NATURAL = 42;
/** Slot height = slot width × this (wide rectangle, matches Figma desktop game cells). */
export const BIRDSEYE_DESKTOP_LANDSCAPE_HEIGHT_RATIO = 0.74;
/** Tighter horizontal inset so more width goes to the tree on desktop. */
export const BIRDSEYE_DESKTOP_PAD_X = 1;

export const BIRDSEYE_TREE_NATURAL_W =
  4 * BIRDSEYE_SLOT_NATURAL + 3 * BIRDSEYE_BRIDGE_NATURAL;

/** Final Four: national championship (center) vs semifinal cells — row stays center-aligned */
export const BIRDSEYE_CHAMPION_SLOT_FACTOR = 1.16;

/** Horizontal inset inside bracket host before scaling (keep small so slots stay large). */
const PAD_X = 3;

export type BirdseyeNaturalDimensions = {
  slot: number;
  bridge: number;
};

export type BirdseyeVerticalFitOptions = {
  availableHostHeight: number;
  maxColumnGames: number;
  verticalGapPx?: number;
  /**
   * Effective slot height vs natural width (e.g. 0.62 = landscape cell shorter than wide).
   * Used when computing vertical scale limit.
   */
  slotVerticalFactor?: number;
};

export type BirdseyeOverviewMetrics = {
  layoutScale: number;
  slotPx: number;
  bridgeW: number;
  /** Actual rendered mini-bracket cell height (East); used to size center FF games. */
  slotHeightPx?: number;
};

/** Avoid feedback loops when subpixel layout oscillates (overview ↔ center hub). */
function slotHeightPxEqual(
  a: number | undefined,
  b: number | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.06;
}

export function birdseyeMetricsEqual(
  a: BirdseyeOverviewMetrics,
  b: BirdseyeOverviewMetrics
): boolean {
  return (
    slotHeightPxEqual(a.slotHeightPx, b.slotHeightPx) &&
    Math.abs(a.layoutScale - b.layoutScale) < 1e-5 &&
    Math.abs(a.slotPx - b.slotPx) < 0.06 &&
    Math.abs(a.bridgeW - b.bridgeW) < 0.06
  );
}

function treeNaturalWidth(natural: BirdseyeNaturalDimensions): number {
  return 4 * natural.slot + 3 * natural.bridge;
}

/**
 * Keeps 4 columns + 3 bridges inside availW (no column overlap) and grows bridges with slack
 * so connector SVGs span the full gap when scale rounds down.
 */
function fitTreePixelWidths(
  availW: number,
  nat: BirdseyeNaturalDimensions,
  layoutScale: number
): { layoutScale: number; slotPx: number; bridgeW: number } {
  let slotPx = nat.slot * layoutScale;
  let bridgeW = nat.bridge * layoutScale;
  if (availW <= 0 || nat.slot <= 0) {
    return { layoutScale, slotPx, bridgeW };
  }
  let total = 4 * slotPx + 3 * bridgeW;
  if (total > availW + 0.25) {
    const f = availW / total;
    slotPx *= f;
    bridgeW *= f;
  }
  total = 4 * slotPx + 3 * bridgeW;
  const slack = availW - total;
  if (slack > 0.25) {
    bridgeW += slack / 3;
  }
  return {
    layoutScale: slotPx / nat.slot,
    slotPx,
    bridgeW,
  };
}

const DEFAULT_NATURAL: BirdseyeNaturalDimensions = {
  slot: BIRDSEYE_SLOT_NATURAL,
  bridge: BIRDSEYE_BRIDGE_NATURAL,
};

export type OverviewSlotMetricsOptions = {
  horizontalPadPx?: number;
};

export function computeOverviewSlotMetrics(
  availableHostWidth: number,
  natural?: BirdseyeNaturalDimensions,
  verticalFit?: BirdseyeVerticalFitOptions | null,
  opts?: OverviewSlotMetricsOptions | null
): BirdseyeOverviewMetrics {
  const nat = natural ?? DEFAULT_NATURAL;
  const treeW = treeNaturalWidth(nat);
  const padX = opts?.horizontalPadPx ?? PAD_X;
  const availW = Math.max(0, availableHostWidth - padX * 2);
  /* Fill host width: scale can exceed 1 so the tree uses the full regional zone. */
  let layoutScale = availableHostWidth > 0 && treeW > 0 ? availW / treeW : 1;

  if (
    verticalFit &&
    verticalFit.availableHostHeight > 0 &&
    verticalFit.maxColumnGames > 0
  ) {
    const n = verticalFit.maxColumnGames;
    const gap = Math.max(0, verticalFit.verticalGapPx ?? 0);
    const maxSlotFromHeight = Math.max(
      0,
      verticalFit.availableHostHeight / n - gap
    );
    const vertFactor = verticalFit.slotVerticalFactor ?? 1;
    const denom = nat.slot * vertFactor;
    const scaleH = denom > 0 ? maxSlotFromHeight / denom : layoutScale;
    layoutScale = Math.min(layoutScale, scaleH);
  }

  const fitted = fitTreePixelWidths(availW, nat, layoutScale);
  return fitted;
}
