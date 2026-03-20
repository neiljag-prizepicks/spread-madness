import { normalizeGameResultEntry } from "./results-normalize.mjs";

export function scoresPayloadChanged(prevNorm, nextFlat) {
  if ((prevNorm.status ?? null) !== (nextFlat.status ?? null)) return true;
  if ((prevNorm.clock ?? null) !== (nextFlat.clock ?? null)) return true;
  const ps = prevNorm.scores ?? {};
  const ns = nextFlat.scores ?? {};
  const keys = new Set([...Object.keys(ps), ...Object.keys(ns)]);
  for (const k of keys) if (ps[k] !== ns[k]) return true;
  return false;
}

/** Merge new result row; bump scores_updated_at when score/status/clock changes. */
export function mergeGameResultWithScoresTimestamp(baseRaw, nextResult) {
  const prev = normalizeGameResultEntry(baseRaw ?? {});
  const merged = { ...nextResult };
  if (scoresPayloadChanged(prev, merged)) {
    merged.scores_updated_at = new Date().toISOString();
  } else {
    const raw = baseRaw && typeof baseRaw === "object" ? baseRaw : {};
    if (typeof raw.scores_updated_at === "string" && raw.scores_updated_at.trim())
      merged.scores_updated_at = raw.scores_updated_at;
  }
  return merged;
}

export function spreadLineChanged(prevOverlay, favoriteId, spreadVal) {
  const pf = prevOverlay?.favorite_team_id ?? null;
  const ps = prevOverlay?.spread_from_favorite_perspective;
  return pf !== favoriteId || ps !== spreadVal;
}
