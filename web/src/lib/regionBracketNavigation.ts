import type { BracketGame, GameResult } from "../types";
import { withoutFirstFour } from "./bracketFilters";

/** Rounds rendered in each regional quadrant tree (horizontal scroll). */
export const REGION_TREE_ROUNDS: BracketGame["round"][] = [
  "round_of_64",
  "round_of_32",
  "sweet_16",
  "elite_8",
];

export type RegionTreeRound = (typeof REGION_TREE_ROUNDS)[number];

/** Tab order: LTR regions match bracket read; RTL (West/Midwest) list inner→outer. */
export function regionRoundTabOrder(flow: "ltr" | "rtl"): RegionTreeRound[] {
  return flow === "rtl" ? [...REGION_TREE_ROUNDS].reverse() : [...REGION_TREE_ROUNDS];
}

export const REGION_ROUND_LABELS: Record<RegionTreeRound, string> = {
  round_of_64: "Round of 64",
  round_of_32: "Round of 32",
  sweet_16: "Sweet 16",
  elite_8: "Elite 8",
};

function roundOrderIndex(round: BracketGame["round"]): number {
  const i = REGION_TREE_ROUNDS.indexOf(round as RegionTreeRound);
  return i >= 0 ? i : -1;
}

/** Parse scheduled tip for sorting; missing/invalid sorts as oldest. */
function scheduledTipMs(iso: string | null): number {
  if (iso == null || iso === "") return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Pick which column to show by default:
 * - Earliest round that has a live (`in_progress`) game.
 * - Else, if any game in the region is final, the round that contains the
 *   **most recently tipped** final (by `scheduled_tip_utc`), so e.g. after
 *   Thursday R64 wraps and Friday R32 hasn’t started, we stay on Round of 64.
 * - Else first round with a `not_started` game.
 * - Else Elite 8 (region fully final with no schedule hints).
 */
export function activeRegionRound(
  regionGames: BracketGame[],
  results: Map<string, GameResult>
): RegionTreeRound {
  const treeGames = withoutFirstFour(regionGames);

  const gamesIn = (round: RegionTreeRound) =>
    treeGames.filter((g) => g.round === round);

  const live = REGION_TREE_ROUNDS.find((round) =>
    gamesIn(round).some((g) => results.get(g.id)?.status === "in_progress")
  );
  if (live) return live;

  const finals = treeGames.filter(
    (g) => results.get(g.id)?.status === "final"
  );

  if (finals.length > 0) {
    const sorted = [...finals].sort((a, b) => {
      const tipDiff = scheduledTipMs(b.scheduled_tip_utc) - scheduledTipMs(a.scheduled_tip_utc);
      if (tipDiff !== 0) return tipDiff;
      const ra = roundOrderIndex(a.round);
      const rb = roundOrderIndex(b.round);
      if (rb !== ra) return rb - ra;
      return b.bracket_order - a.bracket_order;
    });
    const top = sorted[0];
    const idx = roundOrderIndex(top.round);
    if (idx >= 0) return REGION_TREE_ROUNDS[idx]!;
  }

  const upcoming = REGION_TREE_ROUNDS.find((round) =>
    gamesIn(round).some((g) => results.get(g.id)?.status === "not_started")
  );
  if (upcoming) return upcoming;

  return "elite_8";
}

export function scrollHorizontallyToElement(
  scrollEl: HTMLElement,
  targetEl: HTMLElement,
  options?: {
    align?: "start" | "center";
    margin?: number;
    behavior?: ScrollBehavior;
  }
) {
  const margin = options?.margin ?? 8;
  const align = options?.align ?? "start";
  const behavior = options?.behavior ?? "auto";
  const scrollRect = scrollEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  let next = scrollEl.scrollLeft + (targetRect.left - scrollRect.left) - margin;
  if (align === "center") {
    next -= (scrollRect.width - targetRect.width) / 2;
  }
  const maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
  scrollEl.scrollTo({
    left: Math.max(0, Math.min(maxScroll, next)),
    behavior,
  });
}
