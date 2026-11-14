import type { GameModule } from '../../core/game';
import { MAX_AMOUNT } from '../../core/integer';
import type { Net } from '../../core/settlement';

/**
 * Pusoy Dos scoring. See docs/rules/pusoy-dos.md for sources and worked examples. Every rule that
 * sources disagree on is a host option in the setup, never hard-coded.
 *
 * Systems:
 * - winner-take-all: each loser pays `stake` (times the deuce multiplier) to the winner.
 * - cards-left: each loser scores a penalty from cards left, tiered per card; the winner scores 0.
 *   `settlement` decides if only the winner collects, or every pair settles its difference.
 * - placement: play continues until one player remains; finishing order earns points and every
 *   pair settles the difference.
 */
export type Scoring = 'winner-take-all' | 'cards-left' | 'placement';
export type DeuceMode = 'off' | 'pow2' | 'double-once';
export type Settlement = 'winner-only' | 'pairwise';

export interface Tier {
  /** Applies when a player has at least this many cards left. */
  minCards: number;
  /** Penalty points per card left. */
  perCard: number;
}

export interface PusoyDosSetup {
  scoring: Scoring;
  /** What the number of 2s in the winner's final play does to the payment. */
  deuce: DeuceMode;
  /** Cards-left only. */
  settlement: Settlement;
  /** Cards dealt per player (largest possible cards-left). 13 for 4 players; some tables deal 17. */
  startingHand: number;
  /** Cards-left only. Ascending minCards, first must be 1. */
  tiers: Tier[];
  /** Placement only. Points for 1st, 2nd, ... one entry per player. */
  placementPoints: number[];
}

export interface PusoyDosInput {
  /** Winner-take-all and cards-left. In placement the winner is order[0]. */
  winner?: string;
  /** Integer stake per point (or per loser in winner-take-all). */
  stake: number;
  /** Cards-left: cards each non-winner still held. */
  cardsLeft?: Record<string, number>;
  /** Number of 2s in the winner's final play, 0 to 4. */
  deuces?: number;
  /** Placement: every player, first finisher first. */
  order?: string[];
}

/** Tier presets from docs/rules/pusoy-dos.md (Pagat basic game, and Pagat's "tiered multipliers" variation). */
export const TIER_PRESETS: Readonly<Record<string, Tier[]>> = {
  standard: [
    { minCards: 1, perCard: 1 },
    { minCards: 10, perCard: 2 },
    { minCards: 13, perCard: 3 },
  ],
  'tiered-8': [
    { minCards: 1, perCard: 1 },
    { minCards: 8, perCard: 2 },
    { minCards: 10, perCard: 3 },
    { minCards: 13, perCard: 4 },
  ],
  flat: [{ minCards: 1, perCard: 1 }],
};

/** Starting guesses only; the Pagat table lists 5/3/1/0 for four players. Hosts can edit. [UNVERIFIED for 2 and 3] */
const DEFAULT_PLACEMENT: Readonly<Record<number, number[]>> = {
  2: [1, 0],
  3: [3, 1, 0],
  4: [5, 3, 1, 0],
};

export const MAX_STAKE = 10_000_000;
export const MAX_DEUCES = 4;

/**
 * Change one placement point and keep the list valid (whole numbers 0 to 1000, never increasing
 * down the order): the value is capped by the place above, and lower places are capped by it.
 */
export function setPlacementPoint(points: readonly number[], index: number, value: number): number[] {
  const next = [...points];
  const cap = index > 0 ? (next[index - 1] ?? 1000) : 1000;
  next[index] = Math.max(0, Math.min(Math.trunc(value), cap, 1000));
  for (let j = index + 1; j < next.length; j++) next[j] = Math.min(next[j] ?? 0, next[index] as number);
  return next;
}

export function deuceMultiplier(mode: DeuceMode, deuces: number): number {
  if (deuces <= 0 || mode === 'off') return 1;
  return mode === 'pow2' ? 2 ** deuces : 2;
}

/** Penalty points for one player holding `cardsLeft` cards. */
export function penalty(tiers: readonly Tier[], cardsLeft: number): number {
  let rate = 0;
  for (const t of tiers) if (cardsLeft >= t.minCards) rate = t.perCard;
  return cardsLeft * rate;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export const pusoyDos: GameModule<PusoyDosSetup, PusoyDosInput> = {
  id: 'pusoy-dos',
  playerCounts: [2, 3, 4],

  defaultSetup: (playerCount) => ({
    scoring: 'winner-take-all',
    deuce: 'off',
    settlement: 'winner-only',
    startingHand: 13,
    tiers: (TIER_PRESETS.standard ?? []).map((t) => ({ ...t })),
    placementPoints: [...(DEFAULT_PLACEMENT[playerCount] ?? DEFAULT_PLACEMENT[4] ?? [])],
  }),

  validateSetup(raw, playerCount) {
    const problems: string[] = [];
    if (!isRecord(raw)) return ['options must be an object'];
    if (!['winner-take-all', 'cards-left', 'placement'].includes(raw.scoring as string)) problems.push('unknown scoring system');
    if (!['off', 'pow2', 'double-once'].includes(raw.deuce as string)) problems.push('unknown deuce option');
    if (!['winner-only', 'pairwise'].includes(raw.settlement as string)) problems.push('unknown settlement option');
    if (!isInt(raw.startingHand) || raw.startingHand < 2 || raw.startingHand > 26) problems.push('cards dealt must be 2 to 26');

    const tiers = raw.tiers;
    if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 6) {
      problems.push('tiers must list 1 to 6 entries');
    } else {
      let prev = 0;
      tiers.forEach((t: unknown, i) => {
        if (!isRecord(t) || !isInt(t.minCards) || !isInt(t.perCard)) {
          problems.push(`tier ${i + 1} must have whole numbers`);
          return;
        }
        if (i === 0 && t.minCards !== 1) problems.push('the first tier must start at 1 card');
        if (t.minCards <= prev) problems.push('tier card counts must increase');
        if (t.perCard < 1 || t.perCard > 10) problems.push('points per card must be 1 to 10');
        prev = t.minCards;
      });
    }

    const pts = raw.placementPoints;
    if (!Array.isArray(pts) || pts.length !== playerCount) {
      problems.push(`placement points need exactly ${playerCount} entries`);
    } else {
      let bad = false;
      pts.forEach((p: unknown, i) => {
        if (!isInt(p) || p < 0 || p > 1000) bad = true;
        else if (i > 0 && isInt(pts[i - 1]) && p > (pts[i - 1] as number)) problems.push('placement points must not increase down the order');
      });
      if (bad) problems.push('placement points must be whole numbers from 0 to 1000');
    }
    return problems;
  },

  validate(setup, players, raw) {
    const input = raw as unknown;
    if (!isRecord(input)) return ['round must be an object'];
    const problems: string[] = [];
    if (!isInt(input.stake) || input.stake < 1 || input.stake > MAX_STAKE) {
      problems.push(`stake must be a whole number from 1 to ${MAX_STAKE.toLocaleString('en-US')}`);
    }

    if (setup.scoring === 'placement') {
      const order = input.order;
      if (!Array.isArray(order) || order.length !== players.length || new Set(order).size !== order.length || !order.every((id) => typeof id === 'string' && players.includes(id))) {
        problems.push('finishing order must list every player exactly once');
      }
      if (input.deuces !== undefined && input.deuces !== 0) problems.push('deuces do not apply to placement scoring');
      return problems;
    }

    const winner = input.winner;
    if (typeof winner !== 'string' || !players.includes(winner)) problems.push('winner must be one of the players');

    const deuces = input.deuces ?? 0;
    if (!isInt(deuces) || deuces < 0 || deuces > MAX_DEUCES) problems.push('deuces must be 0 to 4');
    else if (deuces > 0 && setup.deuce === 'off') problems.push('the deuce multiplier is switched off');

    if (setup.scoring === 'winner-take-all') {
      if (input.cardsLeft !== undefined) problems.push('cards left do not apply to winner-take-all');
      return problems;
    }

    const left = input.cardsLeft;
    if (!isRecord(left)) {
      problems.push('cards left are required for every other player');
    } else {
      for (const id of players) {
        if (id === winner) {
          if (has(left, id)) problems.push('the winner has no cards left');
          continue;
        }
        const n = has(left, id) ? left[id] : undefined;
        if (!isInt(n) || n < 1 || n > setup.startingHand) {
          problems.push(`cards left for each other player must be 1 to ${setup.startingHand}`);
          break;
        }
      }
      if (Object.keys(left).some((k) => !players.includes(k))) problems.push('cards left names an unknown player');
    }
    return problems;
  },

  score(setup, players, input) {
    const n = players.length;
    const mult = deuceMultiplier(setup.deuce, input.deuces ?? 0);
    const net: Record<string, number> = {};

    if (setup.scoring === 'placement') {
      const order = input.order ?? [];
      const points = setup.placementPoints;
      const total = points.reduce((a, b) => a + b, 0);
      for (const id of players) {
        const p = points[order.indexOf(id)] ?? 0;
        net[id] = input.stake * (n * p - total);
      }
    } else if (setup.scoring === 'winner-take-all') {
      const each = input.stake * mult;
      for (const id of players) net[id] = id === input.winner ? each * (n - 1) : 0 - each;
    } else {
      const left = input.cardsLeft ?? {};
      const s: Record<string, number> = {};
      let sum = 0;
      for (const id of players) {
        s[id] = id === input.winner ? 0 : penalty(setup.tiers, left[id] ?? 0);
        sum += s[id] as number;
      }
      const unit = input.stake * mult;
      for (const id of players) {
        const mine = s[id] as number;
        if (setup.settlement === 'pairwise') net[id] = unit * (sum - n * mine);
        else net[id] = id === input.winner ? unit * sum : 0 - unit * mine;
      }
    }

    for (const id of players) {
      if (Math.abs(net[id] as number) > MAX_AMOUNT) throw new RangeError('round is too large');
      net[id] = (net[id] as number) + 0; // turns a stray -0 into 0
    }
    return net as Net;
  },
};
