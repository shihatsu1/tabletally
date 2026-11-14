export interface Slot {
  x: number;
  y: number;
}

const FIXED: Record<number, Slot[]> = {
  1: [{ x: 50, y: 86 }],
  2: [{ x: 50, y: 86 }, { x: 50, y: 14 }],
  3: [{ x: 50, y: 86 }, { x: 14, y: 30 }, { x: 86, y: 30 }],
  4: [{ x: 50, y: 86 }, { x: 11, y: 52 }, { x: 50, y: 14 }, { x: 89, y: 52 }],
};

/**
 * Where each seat sits on the oval table, as percentages. You are always the first seat, at the bottom; the others
 * follow around the ellipse. Works for any number of players (poker allows up to 10), so no seat is ever undefined.
 */
export function seatSlots(n: number): Slot[] {
  const fixed = FIXED[n];
  if (fixed) return fixed;
  return Array.from({ length: Math.max(0, n) }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { x: Math.round((50 + 39 * Math.sin(a)) * 10) / 10, y: Math.round((50 + 36 * Math.cos(a)) * 10) / 10 };
  });
}
