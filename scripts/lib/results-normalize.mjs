/** Shared with import-results / ESPN fetch — keep in sync with web/src/lib/gameResult.ts */

const RESERVED = new Set(["status", "clock", "scores", "scores_updated_at"]);

export function parseStatus(s) {
  if (s == null || String(s).trim() === "") return null;
  const v = String(s).toLowerCase().replace(/\s+/g, "_");
  if (v === "not_started" || v === "notstarted") return "not_started";
  if (v === "in_progress" || v === "inprogress" || v === "live")
    return "in_progress";
  if (v === "final") return "final";
  return null;
}

function coerceScores(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.trim() !== "") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) out[k] = n;
    }
  }
  return out;
}

/** Two scores + non-empty clock → in_progress when status omitted (live game). */
function inferStatusWhenMissing(scores, raw) {
  const keys = Object.keys(scores).filter((k) => scores[k] != null);
  if (keys.length === 0) return "not_started";
  if (keys.length >= 2) {
    const ck = raw.clock;
    if (ck != null && String(ck).trim() !== "") return "in_progress";
    return "final";
  }
  return "in_progress";
}

export function normalizeGameResultEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "not_started", clock: null, scores: {} };
  }
  const o = raw;

  if (
    "scores" in o &&
    o.scores != null &&
    typeof o.scores === "object" &&
    !Array.isArray(o.scores)
  ) {
    const scores = coerceScores(o.scores);
    const parsed = parseStatus(o.status);
    const status = parsed ?? inferStatusWhenMissing(scores, o);
    const clock =
      o.clock === undefined || o.clock === null ? null : String(o.clock);
    const out = { status, clock, scores };
    if (
      o.scores_updated_at != null &&
      String(o.scores_updated_at).trim() !== ""
    ) {
      out.scores_updated_at = String(o.scores_updated_at);
    }
    return out;
  }

  const scores = {};
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

export function resultsMapFromFileObject(raw) {
  const m = new Map();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return m;
  for (const [gid, v] of Object.entries(raw)) {
    m.set(gid, normalizeGameResultEntry(v));
  }
  return m;
}
