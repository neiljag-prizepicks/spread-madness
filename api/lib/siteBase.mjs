/**
 * Canonical site URL for server-side fetches (static JSON under /data).
 */
function withHttps(hostOrUrl) {
  const s = String(hostOrUrl).replace(/\/$/, "");
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

/**
 * Canonical site URL for server-side fetches (static JSON under /data).
 * Prefer SITE_URL; else Vercel's production hostname (not deployment VERCEL_URL — can 401 with protection).
 */
export function siteBaseUrl() {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  }
  if (process.env.VERCEL_URL) {
    return withHttps(process.env.VERCEL_URL);
  }
  return "http://localhost:5173";
}
