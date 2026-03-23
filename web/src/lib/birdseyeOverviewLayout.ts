/** Matches regional mini bracket: 4 columns + 3 bridge gaps at 1:1 scale */
export const BIRDSEYE_SLOT_NATURAL = 39;
export const BIRDSEYE_BRIDGE_NATURAL = 22;
export const BIRDSEYE_TREE_NATURAL_W =
  4 * BIRDSEYE_SLOT_NATURAL + 3 * BIRDSEYE_BRIDGE_NATURAL;

/** Final Four: national championship (center) vs semifinal cells — row stays center-aligned */
export const BIRDSEYE_CHAMPION_SLOT_FACTOR = 1.16;

/** Horizontal inset inside bracket host before scaling (keep small so slots stay large). */
const PAD_X = 3;

export type BirdseyeOverviewMetrics = {
  layoutScale: number;
  slotPx: number;
  bridgeW: number;
};

export function computeOverviewSlotMetrics(
  availableHostWidth: number
): BirdseyeOverviewMetrics {
  const availW = Math.max(0, availableHostWidth - PAD_X * 2);
  const layoutScale =
    availableHostWidth > 0
      ? Math.min(1, availW / BIRDSEYE_TREE_NATURAL_W)
      : 1;
  return {
    layoutScale,
    slotPx: BIRDSEYE_SLOT_NATURAL * layoutScale,
    bridgeW: BIRDSEYE_BRIDGE_NATURAL * layoutScale,
  };
}
