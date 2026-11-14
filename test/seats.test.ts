import { describe, expect, it } from 'vitest';
import { seatSlots } from '../src/web/lib/seats';

describe('seatSlots', () => {
  it('gives every seat a position for any table size (a 5-10 player poker table used to crash)', () => {
    for (let n = 0; n <= 12; n++) {
      const slots = seatSlots(n);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(100);
      }
      expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(n); // no two seats on top of each other
      if (n > 0) expect(slots[0]).toEqual({ x: 50, y: 86 }); // you, at the bottom
    }
  });
});
