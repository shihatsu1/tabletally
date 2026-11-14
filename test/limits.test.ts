import { describe, expect, it } from 'vitest';
import { RateLimiter, originAllowed, randomCode, readBodyLimited } from '../src/worker/limits';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '../src/shared/protocol';

describe('rate limiter (audit S01)', () => {
  it('allows up to the limit per window, per key, then resets', () => {
    const r = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => r.allow('a', 0))).toEqual([true, true, true, false]);
    expect(r.allow('b', 10)).toBe(true); // another address is separate
    expect(r.allow('a', 999)).toBe(false);
    expect(r.allow('a', 1000)).toBe(true); // a new window
  });

  it('never keeps more than maxKeys addresses', () => {
    const r = new RateLimiter(1, 1000, 10);
    for (let i = 0; i < 100; i++) expect(r.allow(`k${i}`, 0)).toBe(true);
    expect((r as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(10);
  });

  it('keeps independent counters for the same key and resets at the minute boundary', () => {
    const create = new RateLimiter(10, 60_000);
    const status = new RateLimiter(60, 60_000);
    const socket = new RateLimiter(60, 60_000);
    for (let i = 0; i < 10; i++) expect(create.allow('address', 0)).toBe(true);
    expect(create.allow('address', 59_999)).toBe(false);
    for (const counter of [status, socket]) {
      for (let i = 0; i < 60; i++) expect(counter.allow('address', 0)).toBe(true);
      expect(counter.allow('address', 59_999)).toBe(false);
    }
    for (const counter of [create, status, socket]) expect(counter.allow('address', 60_000)).toBe(true);
  });
});

describe('request parsing (audit S03/S04)', () => {
  it('reads a small body and refuses a large one without buffering it all', async () => {
    expect(await readBodyLimited(new Request('http://x/', { method: 'POST', body: '{"a":1}' }), 2048)).toBe('{"a":1}');
    expect(await readBodyLimited(new Request('http://x/', { method: 'POST', body: 'x'.repeat(5000) }), 2048)).toBeNull();
    // a stream with no length header is cut off once it passes the limit
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sent += 1024;
        if (sent > 1024 * 1024) c.close();
        else c.enqueue(new Uint8Array(1024));
      },
    });
    const req = new Request('http://x/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readBodyLimited(req, 2048)).toBeNull();
    expect(sent).toBeLessThan(1024 * 16);
  });

  it('refuses opaque and malformed origins instead of throwing', () => {
    expect(originAllowed(null, 'a.dev')).toBe(true);
    expect(originAllowed('https://a.dev', 'a.dev')).toBe(true);
    expect(originAllowed('https://evil.dev', 'a.dev')).toBe(false);
    expect(originAllowed('null', 'a.dev')).toBe(false);
    expect(originAllowed('::not a url', 'a.dev')).toBe(false);
  });
});

describe('room codes (audit S06)', () => {
  it('are the right length and only use the alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      expect(ROOM_CODE_PATTERN.test(randomCode(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, (n) => crypto.getRandomValues(new Uint8Array(n))))).toBe(true);
    }
  });

  it('redraws the byte values that would favour the first letters', () => {
    // 256 = 8 x 31 + 8, so bytes 248 to 255 would map to the first eight letters a ninth time; they are skipped.
    let call = 0;
    const bytes = (n: number) => new Uint8Array(n).fill(call++ === 0 ? 250 : 32);
    expect(randomCode(ROOM_CODE_ALPHABET, 6, bytes)).toBe(ROOM_CODE_ALPHABET[1]!.repeat(6));
  });
});
