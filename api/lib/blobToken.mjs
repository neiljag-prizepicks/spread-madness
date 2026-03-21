/** Vercel Blob read-write token (linked store uses BLOB_READ_WRITE_TOKEN). */
export function blobReadWriteToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.SPREAD_MADNESS_READ_WRITE_TOKEN ||
    null
  );
}
