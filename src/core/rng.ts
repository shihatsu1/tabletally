/**
 * Small seeded random source (mulberry32). Integer only: it yields unsigned 32-bit integers, and the
 * helpers turn them into whole-number choices. Used for shuffling and bot choices in digital play, never
 * for scoring. The Worker draws the seed from crypto.getRandomValues; tests pass fixed seeds, so every
 * game can be replayed exactly.
 */
export type Rng = () => number;

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

/** A whole number from 0 to n - 1. */
export const randInt = (rng: Rng, n: number): number => rng() % n;

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
