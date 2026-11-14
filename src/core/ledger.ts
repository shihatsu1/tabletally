import type { GameModule } from './game';
import { assertAmount, MAX_AMOUNT } from './integer';
import type { Net } from './settlement';

/**
 * Append-only event log. State (rounds, totals, history) is always derived by replaying events,
 * so undo, edit-with-reason and the full history come for free and are identical on every phone.
 */
export type LedgerEvent<Input = unknown> =
  | { type: 'round.add'; id: string; at: number; by: string; input: Input }
  | { type: 'round.undo'; at: number; by: string }
  | { type: 'round.edit'; id: string; at: number; by: string; reason: string; input: Input };

export interface Round<Input = unknown> {
  id: string;
  input: Input;
  /** Zero-sum result of this round. */
  delta: Net;
  edited: boolean;
}

export interface HistoryEntry {
  at: number;
  by: string;
  action: 'add' | 'undo' | 'edit';
  roundId: string;
  reason?: string;
}

export interface LedgerState<Input = unknown> {
  rounds: Round<Input>[];
  totals: Record<string, number>;
  history: HistoryEntry[];
}

export class LedgerError extends Error {}

/** Replay events into state. Throws LedgerError on an invalid event, naming the problem. */
export function replay<Setup, Input>(
  game: GameModule<Setup, Input>,
  setup: Setup,
  players: readonly string[],
  events: readonly LedgerEvent<Input>[],
): LedgerState<Input> {
  const rounds: Round<Input>[] = [];
  const history: HistoryEntry[] = [];

  const scoreOrThrow = (input: Input): Net => {
    let problems: string[];
    let delta: Net;
    try {
      problems = game.validate(setup, players, input);
      if (problems.length > 0) throw new LedgerError(problems.join('; '));
      delta = game.score(setup, players, input);
    } catch (e) {
      if (e instanceof LedgerError) throw e;
      // A game module must never take the room down on odd input; treat it as an invalid round.
      throw new LedgerError(e instanceof RangeError ? e.message : 'that round could not be read');
    }
    let sum = 0;
    for (const id of players) {
      if (!(id in delta)) throw new LedgerError(`score() omitted player ${id}`);
      sum += assertAmount(delta[id] as number, `delta[${id}]`);
    }
    if (sum !== 0) throw new LedgerError(`score() must sum to zero, got ${sum}`);
    return delta;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'round.add': {
        if (rounds.some((r) => r.id === ev.id)) {
          throw new LedgerError(`duplicate round id ${ev.id}`);
        }
        rounds.push({ id: ev.id, input: ev.input, delta: scoreOrThrow(ev.input), edited: false });
        history.push({ at: ev.at, by: ev.by, action: 'add', roundId: ev.id });
        break;
      }
      case 'round.undo': {
        const last = rounds.pop();
        if (!last) throw new LedgerError('nothing to undo');
        history.push({ at: ev.at, by: ev.by, action: 'undo', roundId: last.id });
        break;
      }
      case 'round.edit': {
        const reason = ev.reason.trim();
        if (reason === '') throw new LedgerError('an edit needs a reason');
        const i = rounds.findIndex((r) => r.id === ev.id);
        if (i < 0) throw new LedgerError(`unknown round ${ev.id}`);
        rounds[i] = { id: ev.id, input: ev.input, delta: scoreOrThrow(ev.input), edited: true };
        history.push({ at: ev.at, by: ev.by, action: 'edit', roundId: ev.id, reason });
        break;
      }
    }
  }

  const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const r of rounds) {
    for (const id of players) {
      const next = (totals[id] ?? 0) + (r.delta[id] ?? 0);
      // Totals feed settlement, which only accepts |x| <= MAX_AMOUNT, so reject the round that crosses it.
      if (!Number.isSafeInteger(next) || Math.abs(next) > MAX_AMOUNT) {
        throw new LedgerError(`a running total would exceed ${MAX_AMOUNT.toLocaleString('en-US')}`);
      }
      totals[id] = next;
    }
  }
  return { rounds, totals, history };
}
