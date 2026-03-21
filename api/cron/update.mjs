import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { siteBaseUrl } from "../lib/siteBase.mjs";
import {
  OVERLAY_PATHNAME,
  RESULTS_PATHNAME,
  readLiveJson,
  writeLiveJson,
} from "../lib/blobLive.mjs";
import { blobReadWriteToken } from "../lib/blobToken.mjs";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

function assertCronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  return auth === `Bearer ${secret}`;
}

async function downloadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json();
}

async function downloadToFile(url, filePath) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  await fs.writeFile(filePath, Buffer.from(await r.arrayBuffer()));
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (!assertCronAuth(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const token = blobReadWriteToken();
  if (!token) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error:
          "Missing Blob token — set BLOB_READ_WRITE_TOKEN (link Blob store) or SPREAD_MADNESS_READ_WRITE_TOKEN in project env.",
      })
    );
    return;
  }

  const site = siteBaseUrl();
  const tmp = path.join("/tmp", "mm-espn");
  await fs.mkdir(tmp, { recursive: true });

  const gamesFile = path.join(tmp, "games.json");
  const teamsFile = path.join(tmp, "teams.json");
  const resultsFile = path.join(tmp, "results.json");
  const overlayFile = path.join(tmp, "overlay.json");

  try {
    await downloadToFile(
      `${site}/data/games_2026_march_madness.json`,
      gamesFile
    );
    await downloadToFile(
      `${site}/data/teams_2026_march_madness.json`,
      teamsFile
    );

    let resultsObj =
      (await readLiveJson(token, RESULTS_PATHNAME)) ??
      (await downloadJson(`${site}/data/results.json`).catch(() => ({})));
    if (!resultsObj || typeof resultsObj !== "object" || Array.isArray(resultsObj))
      resultsObj = {};

    let overlayObj =
      (await readLiveJson(token, OVERLAY_PATHNAME)) ??
      (await downloadJson(`${site}/data/game_schedule_and_lines.json`).catch(
        () => ({})
      ));
    if (!overlayObj || typeof overlayObj !== "object" || Array.isArray(overlayObj))
      overlayObj = {};

    await fs.writeFile(resultsFile, JSON.stringify(resultsObj, null, 2) + "\n");
    await fs.writeFile(overlayFile, JSON.stringify(overlayObj, null, 2) + "\n");

    const node = process.execPath;
    const dates = process.env.ESPN_DATES || "auto";
    const aliases = path.join(ROOT, "scripts", "espn-abbrev-aliases.json");

    await execFileAsync(
      node,
      [
        path.join(ROOT, "scripts", "fetch-espn-results.mjs"),
        "--dates",
        dates,
        "--games",
        gamesFile,
        "--teams",
        teamsFile,
        "--results",
        resultsFile,
        "--aliases",
        aliases,
      ],
      { cwd: ROOT, env: process.env, maxBuffer: 10 * 1024 * 1024 }
    );

    await execFileAsync(
      node,
      [
        path.join(ROOT, "scripts", "fetch-espn-spreads.mjs"),
        "--dates",
        dates,
        "--games",
        gamesFile,
        "--teams",
        teamsFile,
        "--results",
        resultsFile,
        "--overlay",
        overlayFile,
        "--aliases",
        aliases,
      ],
      { cwd: ROOT, env: process.env, maxBuffer: 10 * 1024 * 1024 }
    );

    const nextResults = JSON.parse(await fs.readFile(resultsFile, "utf8"));
    const nextOverlay = JSON.parse(await fs.readFile(overlayFile, "utf8"));

    await writeLiveJson(token, RESULTS_PATHNAME, nextResults);
    await writeLiveJson(token, OVERLAY_PATHNAME, nextOverlay);

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        site,
        resultKeys: Object.keys(nextResults).length,
        overlayKeys: Object.keys(nextOverlay).length,
      })
    );
  } catch (e) {
    console.error("cron update failed:", e);
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: String(e?.message ?? e),
      })
    );
  }
}
