/**
 * Request limits for the public routes. Pure helpers so they are unit-tested without a server.
 *
 * The rate limiter is a fixed window per key held in memory. Public routes use it inside one Limiter
 * Durable Object per address so counts are shared across Worker isolates. Counts reset if the object
 * restarts; nothing is written to storage.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { start: number; n: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Most keys kept at once; the oldest windows are dropped first. */
    private readonly maxKeys = 5000,
  ) {}

  /** Count one request for `key`; false when it is over the limit for the current window. */
  allow(key: string, now: number): boolean {
    const w = this.hits.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      this.hits.set(key, { start: now, n: 1 });
      return true;
    }
    w.n += 1;
    return w.n <= this.limit;
  }

  private prune(now: number): void {
    for (const [k, w] of this.hits) if (now - w.start >= this.windowMs) this.hits.delete(k);
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const k of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/**
 * Read a request body as text, refusing it as soon as it passes `maxBytes` (the whole body is never buffered).
 * Returns null when it is too large.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** True when an Origin header is absent, or names exactly `host`. Opaque or malformed origins are refused. */
export function originAllowed(origin: string | null, host: string): boolean {
  if (origin === null) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null" (sandboxed pages, file://) and anything unparsable
  }
}

/** An unbiased random room code: bytes that would favour the first letters are redrawn. */
export function randomCode(alphabet: string, length: number, bytes: (n: number) => Uint8Array): string {
  const cut = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const b of bytes(length * 2)) {
      if (b < cut) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}
