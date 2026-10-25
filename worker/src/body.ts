// Request bodies (PR 2c item 4a, gap G05). The body is read as a byte stream and the read stops as soon as it passes the
// limit, so an oversized or multibyte body is refused before anything parses it (req.text() counted characters and read
// everything first). A declared Content-Length above the limit is refused without reading at all.

/** Every POST route's limit, in bytes. /profile keeps its own, smaller one (src/profile.ts). */
export const MAX_BODY = 8 * 1024;

export async function readBody(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = (req.headers.get('content-length') ?? '').trim();
  if (/^\d+$/.test(declared) && Number(declared) > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

export const utf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
