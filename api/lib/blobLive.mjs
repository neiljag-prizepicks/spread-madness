import { list, put } from "@vercel/blob";

export const RESULTS_PATHNAME = "mm-live/results.json";
export const OVERLAY_PATHNAME = "mm-live/overlay.json";

export async function readLiveJson(token, pathname) {
  if (!token) return null;
  try {
    const { blobs } = await list({
      token,
      prefix: "mm-live/",
    });
    const hit = blobs.find((b) => b.pathname === pathname);
    const readUrl = hit?.downloadUrl ?? hit?.url;
    if (!readUrl) return null;
    const r = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function writeLiveJson(token, pathname, obj) {
  const body = JSON.stringify(obj, null, 2) + "\n";
  await put(pathname, body, {
    access: "private",
    token,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}
