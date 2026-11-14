import { MAX_AMOUNT } from '../../core/integer';
import type { GameModule, Net } from '../../core/game';
import { isInt, isRecord } from '../../core/check';

/**
 * Tong-its scoring. See docs/rules/tong-its.md. Payments are counted in chips, and one chip is worth
 * `stake` points. The winner collects from each of the two losers. Sources disagree on most amounts, so
 * every amount is a host option, with two presets: the Pagat table rules and the Tongits Go app style.
 */
export type Ending = 'normal' | 'tongits' | 'challenge';
/** `replace`: the ending's chips replace the normal win chips. `add`: they are added on top. */
export type Mode = 'replace' | 'add';

export interface TongItsSetup {
  preset: 'pagat' | 'tongits-go' | 'custom';
  /** Chips each loser pays for an ordinary win (stock ran out or the others folded). */
  winChips: number;
  /** Winning by going out (Tong-its). */
  tongitsChips: number;
  tongitsMode: Mode;
  /** Winning a challenged Draw. */
  challengeChips: number;
  challengeMode: Mode;
  /** Extra chips from each burned loser (no meld exposed). */
  burnedChips: number;
  /** Per ace the winner holds in hand or own exposed melds. */
  aceChips: number;
  /** Per secret set of four. */
  secretChips: number;
  /** Per run of five or more (an optional variation). */
  longRunChips: number;
  /** Per Sagasa (a fourth card drawn onto an opened set). */
  sagasaChips: number;
  /** Chips each player puts in the pot every deal. There is always a pot, so this is at least 1. */
  potAnte: number;
}

export interface TongItsInput {
  winner: string;
  ending: Ending;
  /** Points per chip. */
  stake: number;
  /** Losers who had no meld exposed. */
  burned?: string[];
  aces?: number;
  secrets?: number;
  longRuns?: number;
  sagasa?: number;
  /** Deals' worth of ante being collected by the winner (two wins in a row). 0 or absent: no pot. */
  potDeals?: number;
}

export const PRESETS: Readonly<Record<'pagat' | 'tongits-go', TongItsSetup>> = {
  // Pagat: win 1, +1 per ace, +1 per burned loser, +3 per secret set, Tong-its 3 instead of 1, challenged Draw 3.
  pagat: {
    preset: 'pagat', winChips: 1, tongitsChips: 3, tongitsMode: 'replace', challengeChips: 3, challengeMode: 'replace',
    burnedChips: 1, aceChips: 1, secretChips: 3, longRunChips: 0, sagasaChips: 0, potAnte: 2,
  },
  // Tongits Go (app) multipliers are added: Tongits x1, Win Challenge x2, Secret Meld x2, Burned x1, Sagasa x1. [UNVERIFIED]
  'tongits-go': {
    preset: 'tongits-go', winChips: 1, tongitsChips: 1, tongitsMode: 'add', challengeChips: 2, challengeMode: 'add',
    burnedChips: 1, aceChips: 0, secretChips: 2, longRunChips: 0, sagasaChips: 1, potAnte: 2,
  },
};

export const MAX_STAKE = 10_000_000;
export const MAX_CHIPS = 100;


/** Chips one loser pays, before the burned and pot extras. */
export function baseChips(setup: TongItsSetup, ending: Ending): number {
  if (ending === 'normal') return setup.winChips;
  const [chips, mode] = ending === 'tongits' ? [setup.tongitsChips, setup.tongitsMode] : [setup.challengeChips, setup.challengeMode];
  return mode === 'replace' ? chips : setup.winChips + chips;
}

export const tongIts: GameModule<TongItsSetup, TongItsInput> = {
  id: 'tong-its',
  playerCounts: [3],

  // Tongits Go style is the default, and there is always a pot.
  defaultSetup: () => ({ ...PRESETS['tongits-go'] }),

  validateSetup(raw) {
    if (!isRecord(raw)) return ['options must be an object'];
    const problems: string[] = [];
    if (!['pagat', 'tongits-go', 'custom'].includes(raw.preset as string)) problems.push('unknown preset');
    for (const key of ['tongitsMode', 'challengeMode'] as const) {
      if (!['replace', 'add'].includes(raw[key] as string)) problems.push(`${key} must be replace or add`);
    }
    for (const key of ['winChips', 'tongitsChips', 'challengeChips', 'burnedChips', 'aceChips', 'secretChips', 'longRunChips', 'sagasaChips', 'potAnte'] as const) {
      const v = raw[key];
      if (!isInt(v) || v < 0 || v > MAX_CHIPS) problems.push(`${key} must be a whole number from 0 to ${MAX_CHIPS}`);
    }
    if (isInt(raw.winChips) && raw.winChips < 1) problems.push('winChips must be at least 1');
    if (isInt(raw.potAnte) && raw.potAnte < 1) problems.push('there is always a pot, so potAnte must be at least 1');
    return problems;
  },

  validate(setup, players, raw) {
    const input = raw as unknown;
    if (!isRecord(input)) return ['round must be an object'];
    const problems: string[] = [];
    if (!isInt(input.stake) || input.stake < 1 || input.stake > MAX_STAKE) {
      problems.push(`stake must be a whole number from 1 to ${MAX_STAKE.toLocaleString('en-US')}`);
    }
    const winner = input.winner;
    if (typeof winner !== 'string' || !players.includes(winner)) problems.push('winner must be one of the players');
    if (!['normal', 'tongits', 'challenge'].includes(input.ending as string)) problems.push('pick how the hand ended');

    const burned = input.burned;
    if (burned !== undefined) {
      if (!Array.isArray(burned) || new Set(burned).size !== burned.length || !burned.every((id) => typeof id === 'string' && players.includes(id) && id !== winner)) {
        problems.push('burned players must be other players, each listed once');
      }
    }
    const counts: [string, unknown, number][] = [
      ['aces', input.aces, 4], ['secret sets', input.secrets, 13], ['long runs', input.longRuns, 10], ['sagasa', input.sagasa, 13], ['pot deals', input.potDeals, 1500],
    ];
    for (const [label, v, max] of counts) {
      if (v !== undefined && (!isInt(v) || v < 0 || v > max)) problems.push(`${label} must be 0 to ${max}`);
    }
    if (isInt(input.potDeals) && input.potDeals > 0 && setup.potAnte === 0) problems.push('the pot is switched off');
    return problems;
  },

  score(setup, players, input) {
    const losers = players.filter((p) => p !== input.winner);
    const bonus =
      (input.aces ?? 0) * setup.aceChips +
      (input.secrets ?? 0) * setup.secretChips +
      (input.longRuns ?? 0) * setup.longRunChips +
      (input.sagasa ?? 0) * setup.sagasaChips;
    const pot = (input.potDeals ?? 0) * setup.potAnte;
    const base = baseChips(setup, input.ending) + bonus + pot;

    const net: Record<string, number> = {};
    let won = 0;
    for (const id of losers) {
      const chips = base + (input.burned?.includes(id) ? setup.burnedChips : 0);
      net[id] = 0 - chips * input.stake;
      won += chips * input.stake;
    }
    net[input.winner] = won;
    for (const id of players) {
      if (Math.abs(net[id] as number) > MAX_AMOUNT) throw new RangeError('round is too large');
      net[id] = (net[id] as number) + 0;
    }
    return net as Net;
  },
};
