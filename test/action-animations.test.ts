import { describe, expect, it } from 'vitest';
import { movements } from '../src/web/lib/action-animations';

describe('visible action movements', () => {
  it('shows a stock draw to the acting player without exposing their card', () => {
    const before = { you: 'a', players: ['a', 'b'], turn: 'b', stockCount: 20, discards: [1], counts: { a: 12, b: 12 }, hand: [2], melds: [], done: false };
    const after = { ...before, stockCount: 19, counts: { a: 12, b: 13 } };
    expect(movements('tong-its', before, after)).toContainEqual({ from: 'stock', to: 'seat:b', card: null });
  });
  it('animates public discards and melds', () => {
    const before = { you: 'a', players: ['a', 'b'], turn: 'b', stockCount: 20, discards: [1], counts: { a: 12, b: 13 }, hand: [2], melds: [], done: false };
    const after = { ...before, turn: 'a', discards: [1, 9], counts: { a: 12, b: 12 } };
    expect(movements('tong-its', before, after)).toContainEqual({ from: 'seat:b', to: 'discard', card: 9 });
  });
  it('shows a poker bet even when the betting street advances', () => {
    const before = { you: 'a', players: ['a'], board: [], seat: { a: { bet: 5, stack: 90, folded: false } }, pot: 10, done: false };
    const after = { ...before, board: [3, 4, 5], seat: { a: { bet: 0, stack: 85, folded: false } }, pot: 15 };
    expect(movements('poker', before, after)).toContainEqual({ from: 'seat:a', to: 'pot', coin: 5 });
  });
  it('identifies poker checks, calls, raises and folds from public transitions', () => {
    const before = { you: 'a', players: ['a', 'b'], toAct: 'a', board: [], seat: { a: { bet: 5, stack: 95, folded: false }, b: { bet: 10, stack: 90, folded: false } }, done: false };
    const after = (seat: object) => ({ ...before, toAct: 'b', seat: { ...before.seat, a: seat } });
    expect(movements('poker', before, after({ bet: 10, stack: 90, folded: false }))).toContainEqual({ from: 'seat:a', to: 'seat:a', action: 'call' });
    expect(movements('poker', before, after({ bet: 20, stack: 80, folded: false }))).toContainEqual({ from: 'seat:a', to: 'seat:a', action: 'raise' });
    expect(movements('poker', before, after({ bet: 5, stack: 95, folded: true }))).toContainEqual({ from: 'seat:a', to: 'seat:a', action: 'fold' });
    const check = { ...before, seat: { ...before.seat, a: { bet: 10, stack: 90, folded: false } } };
    expect(movements('poker', check, { ...check, toAct: 'b' })).toContainEqual({ from: 'seat:a', to: 'seat:a', action: 'check' });
  });
  it('animates poker board cards and split payouts', () => {
    const before = { you: 'a', players: ['a', 'b'], board: [], seat: {}, pot: 20, done: false };
    const after = { ...before, board: [3, 4, 5], done: true, wins: [{ id: 'a', amount: 10 }, { id: 'b', amount: 10 }] };
    const out = movements('poker', before, after);
    expect(out.filter(x => x.to === 'board')).toHaveLength(3);
    expect(out).toContainEqual({ from: 'pot', to: 'seat:a', coin: 10 });
    expect(out).toContainEqual({ from: 'pot', to: 'seat:b', coin: 10 });
  });
});
