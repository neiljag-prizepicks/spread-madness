import { get, put } from "@vercel/blob";

export const RESULTS_PATHNAME = "mm-live/results.json";
export const OVERLAY_PATHNAME = "mm-live/overlay.json";

/**
 * Must match the Blob store: "public" (default, matches README) or "private".
 * Set BLOB_ACCESS=private in Vercel when the linked store is private.
 */
function blobAccess() {
  const v = process.env.BLOB_ACCESS;
  if (v === "private" || v === "public") return v;
  return "public";
}

export async function readLiveJson(token, pathname) {
  if (!token) return null;
  try {
    const access = blobAccess();
    const result = await get(pathname, { access, token });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    const j = JSON.parse(text);
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

export async function writeLiveJson(token, pathname, obj) {
  const body = JSON.stringify(obj, null, 2) + "\n";
  const access = blobAccess();
  await put(pathname, body, {
    access,
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
