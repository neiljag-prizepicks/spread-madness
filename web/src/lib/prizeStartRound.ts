import type { BracketGame } from "../types";

/** Stored on private group docs; controls where overview $ prize hints begin. */
export type PrizeStartRound =
  | "sweet_16"
  | "elite_8"
  | "final_four"
  | "championship"
  | "champion_winner_take_all";

export const DEFAULT_PRIZE_START_ROUND: PrizeStartRound = "elite_8";

/** Overview $ sits under this round; winners advance into the pool’s first prize milestone. */
const FEEDER_ROUND_FOR_PRIZE_START: Record<
  PrizeStartRound,
  Extract<
    BracketGame["round"],
    "round_of_32" | "sweet_16" | "elite_8" | "final_four"
  >
> = {
  sweet_16: "round_of_32",
  elite_8: "sweet_16",
  final_four: "elite_8",
  championship: "final_four",
  champion_winner_take_all: "final_four",
};

/** Ordering along the main bracket path (overview / center hub). */
const PATH_RANK: Record<
  | "round_of_64"
  | "round_of_32"
  | "sweet_16"
  | "elite_8"
  | "final_four"
  | "championship",
  number
> = {
  round_of_64: 0,
  round_of_32: 1,
  sweet_16: 2,
  elite_8: 3,
  final_four: 4,
  championship: 5,
};

/** Minimum PATH_RANK for a game to be on the pool’s prize path from the configured start. */
const PRIZE_START_MIN_RANK: Record<PrizeStartRound, number> = {
  sweet_16: PATH_RANK.sweet_16,
  elite_8: PATH_RANK.elite_8,
  final_four: PATH_RANK.final_four,
  championship: PATH_RANK.championship,
  champion_winner_take_all: PATH_RANK.championship,
};

function pathRankForPrizePath(round: BracketGame["round"]): number | null {
  if (round in PATH_RANK) {
    return PATH_RANK[round as keyof typeof PATH_RANK];
  }
  return null;
}

export const PRIZE_START_ROUND_OPTIONS: {
  value: PrizeStartRound;
  label: string;
}[] = [
  { value: "sweet_16", label: "Sweet 16" },
  { value: "elite_8", label: "Elite 8" },
  { value: "final_four", label: "Final Four" },
  { value: "championship", label: "Championship" },
  { value: "champion_winner_take_all", label: "Champion (Winner Take All)" },
];

export function prizeStartRoundLabel(value: PrizeStartRound): string {
  return (
    PRIZE_START_ROUND_OPTIONS.find((o) => o.value === value)?.label ??
    "Elite 8"
  );
}

export function parsePrizeStartRound(raw: unknown): PrizeStartRound {
  if (raw === "sweet_16") return "sweet_16";
  if (raw === "elite_8") return "elite_8";
  if (raw === "final_four") return "final_four";
  if (raw === "championship") return "championship";
  if (raw === "champion_winner_take_all") return "champion_winner_take_all";
  return DEFAULT_PRIZE_START_ROUND;
}

/** The round immediately before the pool’s first prize milestone (win → enter prize rounds). */
export function isPrizePathFeederRound(
  round: BracketGame["round"],
  start: PrizeStartRound
): boolean {
  return round === FEEDER_ROUND_FOR_PRIZE_START[start];
}

/**
 * True from the prize-start round through the championship (inclusive).
 * For winner-take-all, only the title game counts as this segment (Final Four still shown as feeder).
 */
export function isPrizeMilestoneFromStartRound(
  round: BracketGame["round"],
  start: PrizeStartRound
): boolean {
  if (start === "champion_winner_take_all") {
    return round === "championship";
  }
  const r = pathRankForPrizePath(round);
  if (r == null) return false;
  return r >= PRIZE_START_MIN_RANK[start];
}

/**
 * Overview $: **feeder** game (step into prize rounds) **or** any later prize-path round through the title game
 * (e.g. Elite 8 start → Sweet 16, Elite 8, Final Four, championship).
 */
export function isPrizePayoutRoundForStart(
  round: BracketGame["round"],
  start: PrizeStartRound
): boolean {
  return (
    isPrizePathFeederRound(round, start) ||
    isPrizeMilestoneFromStartRound(round, start)
  );
}

/** User-facing name for a bracket round (overview / aria). */
export function bracketRoundShortLabel(round: BracketGame["round"]): string {
  switch (round) {
    case "round_of_64":
      return "Round of 64";
    case "round_of_32":
      return "Round of 32";
    case "sweet_16":
      return "Sweet 16";
    case "elite_8":
      return "Elite 8";
    case "final_four":
      return "Final Four";
    case "championship":
      return "National championship";
    default:
      return round;
  }
}

/** Round you reach by winning the overview $ game (feeder) for this prize setting. */
export function advanceTargetPhrase(start: PrizeStartRound): string {
  if (start === "championship") return "the championship game";
  if (start === "champion_winner_take_all") {
    return "the national championship (winner take all)";
  }
  return prizeStartRoundLabel(start);
}
