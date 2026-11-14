/**
 * Random sources for digital play. Integer only: each yields unsigned 32-bit integers, and the helpers turn
 * them into whole-number choices. Never used for scoring.
 *
 * - The server deals with `cryptoRng()` (crypto.getRandomValues), so a deal cannot be worked out from the
 *   cards a player can see.
 * - Tests, and the computer players' choices, use `makeRng(seed)` (mulberry32), so a game can be replayed.
 */
export type Rng = () => number;

/** A cryptographically strong source: 32 random bits per call, drawn in batches. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] as number;
  };
}

/** Engines accept either a seed (replayable) or a ready source (the server's crypto one). */
export const rngFrom = (seed: number | Rng): Rng => (typeof seed === 'function' ? seed : makeRng(seed));

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const TWO_32 = 0x1_0000_0000;

/** A whole number from 0 to n - 1, without modulo bias (draws that would favour small numbers are redrawn). */
export function randInt(rng: Rng, n: number): number {
  const limit = TWO_32 - (TWO_32 % n);
  for (;;) {
    const x = rng();
    if (x < limit) return x % n;
  }
}

/** Fisher-Yates. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Mix two integers into a new seed (for per-move bot seeds). */
export const mixSeed = (a: number, b: number): number => Math.imul((a >>> 0) ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35) >>> 0;
