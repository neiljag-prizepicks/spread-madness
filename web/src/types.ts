export type GameSide = {
  team_id: string | null;
  label: string;
  source_game_id?: string;
};

export type BracketGame = {
  id: string;
  round:
    | "first_four"
    | "round_of_64"
    | "round_of_32"
    | "sweet_16"
    | "elite_8"
    | "final_four"
    | "championship";
  region: string;
  bracket_order: number;
  scheduled_tip_utc: string | null;
  side_a: GameSide;
  side_b: GameSide;
  favorite_team_id: string | null;
  spread_from_favorite_perspective: number | null;
  /** Set when spread/favorite last changed (e.g. overlay); shown in game info tooltip. */
  spread_updated_at?: string | null;
  feeds_into?: { game_id: string; winner_slot: "side_a" | "side_b" };
};

export type Team = {
  id: string;
  region: string;
  seed: number;
  school: string;
  mascot: string;
  abbrev: string;
};

export type User = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
};

export type GameStatus = "not_started" | "in_progress" | "final";

export type GameResult = {
  status: GameStatus;
  /** Display-only when status is in_progress (e.g. "1st Half 10:39"). */
  clock: string | null;
  scores: Record<string, number>;
  /** ISO timestamp when scores/status/clock last changed (poll or import). */
  scores_updated_at?: string | null;
};

export type GamesFile = { games: BracketGame[] };

/** Per-game patch in game_schedule_and_lines.json (only set fields you want to override). */
export type GameScheduleLineOverlayPatch = {
  scheduled_tip_utc?: string | null;
  favorite_team_id?: string | null;
  spread_from_favorite_perspective?: number | null;
  spread_updated_at?: string | null;
};
