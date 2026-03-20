import type { GameResult, GameStatus } from "../types";

const RESERVED = new Set(["status", "clock", "scores", "scores_updated_at"]);

function parseStatus(s: unknown): GameStatus | null {
  if (s == null || s === "") return null;
  const v = String(s).toLowerCase().replace(/\s+/g, "_");
  if (v === "not_started" || v === "notstarted") return "not_started";
  if (v === "in_progress" || v === "inprogress" || v === "live")
    return "in_progress";
  if (v === "final") return "final";
  return null;
}

function coerceScores(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) out[k] = n;
    }
  }
  return out;
}

/**
 * When `status` is omitted: two scores + non-empty clock → treat as live (avoids
 * marking in-progress ESPN rows as final). Two scores, no clock → final.
 */
function inferStatusWhenMissing(
  scores: Record<string, number>,
  raw: Record<string, unknown>
): GameStatus {
  const keys = Object.keys(scores).filter((k) => scores[k] != null);
  if (keys.length === 0) return "not_started";
  if (keys.length >= 2) {
    const ck = raw.clock;
    if (ck != null && String(ck).trim() !== "") return "in_progress";
    return "final";
  }
  return "in_progress";
}

/**
 * Normalize one per-game value from results.json (structured or legacy flat scores).
 */
export function normalizeRawGameResultEntry(raw: unknown): GameResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "not_started", clock: null, scores: {} };
  }
  const o = raw as Record<string, unknown>;

  if (
    "scores" in o &&
    o.scores != null &&
    typeof o.scores === "object" &&
    !Array.isArray(o.scores)
  ) {
    const scores = coerceScores(o.scores as Record<string, unknown>);
    const parsed = parseStatus(o.status);
    const status = parsed ?? inferStatusWhenMissing(scores, o);
    const clock =
      o.clock === undefined || o.clock === null ? null : String(o.clock);
    const out: GameResult = { status, clock, scores };
    if (
      o.scores_updated_at != null &&
      String(o.scores_updated_at).trim() !== ""
    ) {
      out.scores_updated_at = String(o.scores_updated_at);
    }
    return out;
  }

  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (RESERVED.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) scores[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) scores[k] = n;
    }
  }
  if (Object.keys(scores).length === 0) {
    return { status: "not_started", clock: null, scores: {} };
  }
  const parsed = parseStatus(o.status);
  const status = parsed ?? inferStatusWhenMissing(scores, o);
  const clock =
    o.clock === undefined || o.clock === null ? null : String(o.clock);
  return { status, clock, scores };
}

export function normalizeResultsFileObject(res: unknown): Map<string, GameResult> {
  const m = new Map<string, GameResult>();
  if (!res || typeof res !== "object" || Array.isArray(res)) return m;
  for (const [gid, raw] of Object.entries(res as Record<string, unknown>)) {
    m.set(gid, normalizeRawGameResultEntry(raw));
  }
  return m;
}

/** Pool / bracket settlement: only when game is marked final and both sides have scores. */
export function isPoolSettledForGame(
  r: GameResult | undefined,
  ta: string | null,
  tb: string | null
): boolean {
  if (!r || !ta || !tb) return false;
  if (r.status !== "final") return false;
  return r.scores[ta] != null && r.scores[tb] != null;
}

function scoresPayloadChanged(
  prev: GameResult,
  next: Pick<GameResult, "status" | "clock" | "scores">
): boolean {
  if (prev.status !== next.status) return true;
  if ((prev.clock ?? null) !== (next.clock ?? null)) return true;
  const ps = prev.scores;
  const ns = next.scores;
  const keys = new Set([...Object.keys(ps), ...Object.keys(ns)]);
  for (const k of keys) if (ps[k] !== ns[k]) return true;
  return false;
}

/** Merge score update; bump scores_updated_at only when status/clock/scores change. */
export function mergeGameResultWithScoresTime(
  previous: GameResult | undefined,
  update: GameResult
): GameResult {
  const base =
    previous ?? ({ status: "not_started", clock: null, scores: {} } as GameResult);
  if (scoresPayloadChanged(base, update)) {
    return { ...update, scores_updated_at: new Date().toISOString() };
  }
  return {
    ...update,
    scores_updated_at: base.scores_updated_at,
  };
}

export function finalGameResult(scores: Record<string, number>): GameResult {
  return { status: "final", clock: null, scores };
}
