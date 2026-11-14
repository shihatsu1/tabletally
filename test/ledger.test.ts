import { describe, expect, it } from 'vitest';
import type { GameModule } from '../src/core/game';
import { LedgerError, replay, type LedgerEvent } from '../src/core/ledger';
import { settle } from '../src/core/settlement';

interface Input {
  winner: string;
  stake: number;
}

/** Winner-take-all fixture: every loser pays `stake` to the winner. Mirrors docs/rules/pusoy-dos.md. */
const winnerTakeAll: GameModule<null, Input> = {
  id: 'fixture-winner-take-all',
  playerCounts: [2, 3, 4],
  defaultSetup: () => null,
  validateSetup: () => [],
  validate: (_s, players, i) => {
    const problems: string[] = [];
    if (!players.includes(i.winner)) problems.push('unknown winner');
    if (!Number.isSafeInteger(i.stake) || i.stake <= 0) problems.push('stake must be a positive integer');
    return problems;
  },
  score: (_s, players, i) =>
    Object.fromEntries(
      players.map((p) => [p, p === i.winner ? i.stake * (players.length - 1) : -i.stake]),
    ),
};

const players = ['A', 'B', 'C', 'D'];
const ev = (n: number, winner: string, stake: number): LedgerEvent<Input> => ({
  type: 'round.add',
  id: `r${n}`,
  at: n,
  by: 'host',
  input: { winner, stake },
});

const canonical = (): LedgerEvent<Input>[] => {
  const rounds: [string, number][] = [
    ...['A', 'B', 'B', 'D', 'C'].map((w): [string, number] => [w, 50]),
    ...['D', 'D', 'B', 'C', 'B', 'C', 'A', 'D'].map((w): [string, number] => [w, 200]),
    ...['A', 'C'].map((w): [string, number] => [w, 300]),
  ];
  return rounds.map(([w, s], i) => ev(i + 1, w, s));
};

describe('ledger replay', () => {
  it('reproduces the canonical 15-round Pusoy Dos totals and settlement', () => {
    const state = replay(winnerTakeAll, null, players, canonical());
    expect(state.rounds).toHaveLength(15);
    expect(state.totals).toEqual({ A: -250, B: -450, C: 550, D: 150 });
    expect(Object.values(state.totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(settle(state.totals)).toEqual([
      { from: 'B', to: 'C', amount: 450 },
      { from: 'A', to: 'D', amount: 150 },
      { from: 'A', to: 'C', amount: 100 },
    ]);
  });

  it('supports a stake change between rounds', () => {
    const state = replay(winnerTakeAll, null, players, [ev(1, 'A', 50), ev(2, 'B', 300)]);
    expect(state.totals).toEqual({ A: 150 - 300, B: -50 + 900, C: -50 - 300, D: -50 - 300 });
  });

  it('undo removes the last round and is recorded in history', () => {
    const events: LedgerEvent<Input>[] = [
      ev(1, 'A', 50),
      ev(2, 'B', 50),
      { type: 'round.undo', at: 3, by: 'host' },
    ];
    const state = replay(winnerTakeAll, null, players, events);
    expect(state.rounds.map((r) => r.id)).toEqual(['r1']);
    expect(state.totals.A).toBe(150);
    expect(state.history.map((h) => h.action)).toEqual(['add', 'add', 'undo']);
  });

  it('undo with nothing to undo is an error', () => {
    expect(() =>
      replay(winnerTakeAll, null, players, [{ type: 'round.undo', at: 1, by: 'host' }]),
    ).toThrow(LedgerError);
  });

  it('edit replaces a past round, needs a reason, and is kept in history', () => {
    const base = [ev(1, 'A', 50), ev(2, 'B', 50)];
    const edit: LedgerEvent<Input> = {
      type: 'round.edit',
      id: 'r1',
      at: 3,
      by: 'host',
      reason: 'wrong winner, it was C',
      input: { winner: 'C', stake: 50 },
    };
    const state = replay(winnerTakeAll, null, players, [...base, edit]);
    expect(state.totals).toEqual({ A: -100, B: 100, C: 100, D: -100 });
    expect(state.rounds[0]?.edited).toBe(true);
    expect(state.history.at(-1)).toMatchObject({ action: 'edit', reason: 'wrong winner, it was C' });

    expect(() =>
      replay(winnerTakeAll, null, players, [...base, { ...edit, reason: '   ' }]),
    ).toThrow(/reason/);
  });

  it('rejects invalid input, unknown rounds and duplicate ids', () => {
    expect(() => replay(winnerTakeAll, null, players, [ev(1, 'Z', 50)])).toThrow(/unknown winner/);
    expect(() => replay(winnerTakeAll, null, players, [ev(1, 'A', 0)])).toThrow(/stake/);
    expect(() => replay(winnerTakeAll, null, players, [ev(1, 'A', 5), ev(1, 'B', 5)])).toThrow(
      /duplicate/,
    );
    expect(() =>
      replay(winnerTakeAll, null, players, [
        { type: 'round.edit', id: 'nope', at: 1, by: 'h', reason: 'x', input: { winner: 'A', stake: 5 } },
      ]),
    ).toThrow(/unknown round/);
  });

  it('refuses a buggy game module whose score does not sum to zero', () => {
    const buggy: GameModule<null, Input> = {
      ...winnerTakeAll,
      score: (_s, ps, i) => Object.fromEntries(ps.map((p) => [p, p === i.winner ? i.stake : -i.stake])),
    };
    expect(() => replay(buggy, null, players, [ev(1, 'A', 10)])).toThrow(/sum to zero/);
  });

  it('works at 2 and 3 players, and the totals always sum to zero', () => {
    for (const ps of [['A', 'B'], ['A', 'B', 'C']]) {
      const state = replay(winnerTakeAll, null, ps, [ev(1, 'A', 70), ev(2, ps[1] as string, 30)]);
      expect(Object.values(state.totals).reduce((a, b) => a + b, 0)).toBe(0);
      expect(settle(state.totals).reduce((s, p) => s + p.amount, 0)).toBeGreaterThan(0);
    }
  });
});

describe('ledger bounds', () => {
  it('rejects a round delta above the supported maximum', () => {
    const huge: GameModule<null, Input> = {
      ...winnerTakeAll,
      score: (_s, ps, i) =>
        Object.fromEntries(ps.map((p) => [p, p === i.winner ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER])),
    };
    expect(() => replay(huge, null, ['A', 'B'], [ev(1, 'A', 1)])).toThrow(/between/);
  });
});

describe('ledger running totals', () => {
  it('rejects the round that would push a total past the supported maximum', () => {
    const big: GameModule<null, Input> = {
      ...winnerTakeAll,
      score: (_s, ps, i) => Object.fromEntries(ps.map((p) => [p, p === i.winner ? 6e11 : -6e11])),
    };
    const two = ['A', 'B'];
    expect(() => replay(big, null, two, [ev(1, 'A', 1)])).not.toThrow();
    expect(() => replay(big, null, two, [ev(1, 'A', 1), ev(2, 'A', 1)])).toThrow(/exceed/);
  });
});
