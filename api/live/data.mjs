import { siteBaseUrl } from "../lib/siteBase.mjs";
import {
  OVERLAY_PATHNAME,
  RESULTS_PATHNAME,
  readLiveJson,
} from "../lib/blobLive.mjs";
import { blobReadWriteToken } from "../lib/blobToken.mjs";

/** Prefer incoming request host so serverless fetch hits the same deployment / alias as the client. */
function originFromReq(req) {
  const host =
    req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const proto =
    (Array.isArray(req.headers["x-forwarded-proto"])
      ? req.headers["x-forwarded-proto"][0]
      : req.headers["x-forwarded-proto"]) || "https";
  if (host && !host.includes("localhost")) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  return siteBaseUrl();
}

async function fetchStaticJson(site, pathname, fallback) {
  try {
    const r = await fetch(`${site}${pathname}`);
    if (!r.ok) return fallback;
    const j = await r.json();
    return j && typeof j === "object" && !Array.isArray(j) ? j : fallback;
  } catch {
    return fallback;
  }
}

function isEmptyRecord(v) {
  return (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length === 0
  );
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const token = blobReadWriteToken();
  const site = originFromReq(req);

  let results =
    token ? await readLiveJson(token, RESULTS_PATHNAME) : null;
  let overlay =
    token ? await readLiveJson(token, OVERLAY_PATHNAME) : null;

  // Empty `{}` from Blob is truthy — still fall back to static deploy data.
  if (isEmptyRecord(results)) {
    results = await fetchStaticJson(site, "/data/results.json", {});
  }
  if (isEmptyRecord(overlay)) {
    overlay = await fetchStaticJson(
      site,
      "/data/game_schedule_and_lines.json",
      {}
    );
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ results, overlay }));
}
