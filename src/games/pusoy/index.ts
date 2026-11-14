import type { GameModule } from '../../core/game';
import { MAX_AMOUNT } from '../../core/integer';
import type { Net } from '../../core/settlement';

/**
 * Pusoy (13-card Chinese poker) scoring. See docs/rules/pusoy.md. The app never sees the cards: the host
 * enters how every player finished in each row, plus fouls, royalties and naturals. Everything the sources
 * disagree on is a host option, with presets for the two common point systems.
 *
 * Each pair of players is scored on its own, then summed per player:
 *   units = (rows won - rows lost) + majorityBonus if won 2+ (minus if lost 2+) + scoopBonus if won all 3 (minus if lost all 3)
 *   1-6 system: majorityBonus 0, scoopBonus 3  (a scoop is worth 3 + 3 = 6)
 *   2-4 system: majorityBonus 1, scoopBonus 0  (a 2-1 win is worth 2, a scoop 3 + 1 = 4)
 */
export type RowKey = 'front' | 'middle' | 'back';
export const ROWS: readonly RowKey[] = ['front', 'middle', 'back'];

/** Players grouped by finish in one row, best group first. Players in the same group tied. */
export type Ranking = string[][];

export const ROYALTY_KEYS = [
  'front.trips', 'middle.fullHouse', 'middle.quads', 'middle.straightFlush', 'middle.royal',
  'back.quads', 'back.straightFlush', 'back.royal',
] as const;
export type RoyaltyKey = (typeof ROYALTY_KEYS)[number];

export const NATURAL_KEYS = [
  'threeFlushes', 'threeStraights', 'sixPairs', 'fourTriplets', 'sameColour', 'allLowOrHigh',
  'threeQuads', 'threeStraightFlushes', 'twelveRoyals', 'dragon', 'pureDragon',
] as const;
export type NaturalKey = (typeof NATURAL_KEYS)[number];

export interface PusoySetup {
  system: '1-6' | '2-4' | 'custom';
  /** Extra units for winning 2 or 3 of the 3 rows against one opponent. */
  majorityBonus: number;
  /** Extra units for winning all 3 rows against one opponent (a scoop). */
  scoopBonus: number;
  /** A fouled hand (rows in the wrong order): `scoop` loses all 3 rows to each valid opponent, `flat` pays foulFlat units to each. */
  foul: 'scoop' | 'flat';
  foulFlat: number;
  royalties: boolean;
  royaltyPreset: 'classic' | 'wikipedia' | 'playtime' | 'custom';
  /** `all`: every opponent pays each royalty. `on-win`: only opponents beaten in that row pay it. */
  royaltyMode: 'all' | 'on-win';
  royalty: Record<RoyaltyKey, number>;
  naturals: boolean;
  natural: Record<NaturalKey, number>;
}

export interface PlayerRoyalties {
  front?: 'trips';
  middle?: 'fullHouse' | 'quads' | 'straightFlush' | 'royal';
  back?: 'quads' | 'straightFlush' | 'royal';
}

export interface PusoyInput {
  /** Points per unit. */
  stake: number;
  /** How the players finished in each row. Fouled players and players with a natural are left out. */
  rows: Record<RowKey, Ranking>;
  fouls?: string[];
  royalties?: Record<string, PlayerRoyalties>;
  naturals?: Record<string, NaturalKey>;
}

const table = (v: number[]): Record<RoyaltyKey, number> =>
  Object.fromEntries(ROYALTY_KEYS.map((k, i) => [k, v[i] as number])) as Record<RoyaltyKey, number>;

/** Royalty tables from three sources (docs/rules/pusoy.md). Order: front trips, mid full house, mid quads, mid SF, mid royal, back quads, back SF, back royal. */
export const ROYALTY_PRESETS: Readonly<Record<'classic' | 'wikipedia' | 'playtime', Record<RoyaltyKey, number>>> = {
  classic: table([3, 2, 4, 5, 5, 4, 5, 5]),
  wikipedia: table([3, 1, 3, 4, 4, 2, 3, 3]),
  playtime: table([3, 0, 4, 5, 10, 2, 3, 5]),
};

/** Natural hands and values from Wikipedia's Chinese poker page (the Taiwanese list). A value of 0 means that hand is not played. */
export const NATURAL_WIKIPEDIA: Record<NaturalKey, number> = {
  threeFlushes: 3, threeStraights: 4, sixPairs: 6, fourTriplets: 8, sameColour: 10, allLowOrHigh: 12,
  threeQuads: 20, threeStraightFlushes: 24, twelveRoyals: 32, dragon: 36, pureDragon: 108,
};

/**
 * Default naturals, modelled on the Philippine Pusoy apps (Tongits Go style): six pairs, three straights and
 * three flushes pay 3 each, and the dragon (one card of every rank) pays 13. Every other natural is off (0).
 * [UNVERIFIED] no official rulebook was found; the figures come from PH card-site guides.
 */
export const NATURAL_DEFAULTS: Record<NaturalKey, number> = {
  threeFlushes: 3, threeStraights: 3, sixPairs: 3, fourTriplets: 0, sameColour: 0, allLowOrHigh: 0,
  threeQuads: 0, threeStraightFlushes: 0, twelveRoyals: 0, dragon: 13, pureDragon: 0,
};

export const MAX_STAKE = 10_000_000;
export const MAX_UNITS = 1000;

export const SYSTEMS = {
  '1-6': { majorityBonus: 0, scoopBonus: 3 },
  '2-4': { majorityBonus: 1, scoopBonus: 0 },
} as const;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function defaultSetup(): PusoySetup {
  return {
    system: '2-4', ...SYSTEMS['2-4'],
    foul: 'scoop', foulFlat: 3,
    royalties: true, royaltyPreset: 'classic', royaltyMode: 'all', royalty: { ...ROYALTY_PRESETS.classic },
    naturals: true, natural: { ...NATURAL_DEFAULTS },
  };
}

/** Rank number of each player in a row (0 = best). */
function rankMap(r: Ranking): Map<string, number> {
  const m = new Map<string, number>();
  r.forEach((group, i) => group.forEach((id) => m.set(id, i)));
  return m;
}

export interface Detail {
  /** Per player: net units won (before stake). */
  units: Record<string, number>;
  scoops: { winner: string; loser: string }[];
  fouls: string[];
  royaltyHolders: string[];
  naturalHolders: string[];
  /**
   * One entry per pair, keyed `a|b` in seat order: how each row went for `a` (1 won, -1 lost, 0 tie or not
   * compared), how the pair was settled, and the units `a` won from `b` (negative when `a` paid).
   */
  pairs: Record<string, PairResult>;
}

export interface PairResult {
  rows: [number, number, number];
  how: 'rows' | 'natural' | 'foul' | 'both-fouled';
  units: number;
}

/** A pair result seen from `me` against `other`, whichever order they sit in. */
export function pairFor(d: Pick<Detail, 'pairs'>, me: string, other: string): PairResult | null {
  const direct = d.pairs[`${me}|${other}`];
  if (direct) return direct;
  const back = d.pairs[`${other}|${me}`];
  return back ? { rows: back.rows.map((r) => -r) as [number, number, number], how: back.how, units: -back.units } : null;
}

/** Score a round in units, and say what happened. Pure; the validators must have passed first. */
export function analyze(setup: PusoySetup, players: readonly string[], input: PusoyInput): Detail {
  const fouls = new Set(input.fouls ?? []);
  const hasNat = (id: string): boolean => setup.naturals && !!input.naturals?.[id];
  const nat = (id: string): number => (hasNat(id) ? setup.natural[input.naturals![id] as NaturalKey] : 0);
  const ranks = ROWS.map((row) => rankMap(input.rows[row]));
  const units: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const scoops: Detail['scoops'] = [];
  const pairs: Detail['pairs'] = {};
  const give = (from: string, to: string, n: number) => {
    units[from] = (units[from] as number) - n;
    units[to] = (units[to] as number) + n;
  };
  const royaltyOf = (id: string, row: RowKey): number => {
    const pick = input.royalties?.[id]?.[row];
    return setup.royalties && pick ? setup.royalty[`${row}.${pick}` as RoyaltyKey] : 0;
  };
  const foulUnits = setup.foul === 'flat' ? setup.foulFlat : 3 + setup.majorityBonus + setup.scoopBonus;

  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const i = players[a] as string;
      const j = players[b] as string;
      const fi = fouls.has(i);
      const fj = fouls.has(j);
      const before = units[i] as number;
      const record = (how: PairResult['how'], rows: [number, number, number] = [0, 0, 0]) => {
        pairs[`${i}|${j}`] = { rows, how, units: (units[i] as number) - before };
      };
      if (fi && fj) {
        record('both-fouled');
        continue;
      }

      if (fi || fj) {
        // the valid player collects the foul payment, and their own royalties from the fouler
        const [valid, bad] = fi ? [j, i] : [i, j];
        give(bad, valid, foulUnits);
        scoops.push({ winner: valid, loser: bad });
        for (const row of ROWS) give(bad, valid, royaltyOf(valid, row));
        record('foul');
        continue;
      }

      const ni = nat(i);
      const nj = nat(j);
      if (hasNat(i) || hasNat(j)) {
        if (ni > nj) give(j, i, ni);
        else if (nj > ni) give(i, j, nj);
        record('natural');
        continue; // equal naturals draw; rows are never compared against a natural
      }

      let won = 0;
      let lost = 0;
      const rowResult: [number, number, number] = [0, 0, 0];
      ranks.forEach((r, k) => {
        const ri = r.get(i) as number;
        const rj = r.get(j) as number;
        rowResult[k] = ri < rj ? 1 : rj < ri ? -1 : 0;
        if (ri < rj) {
          won++;
          if (setup.royaltyMode === 'on-win') give(j, i, royaltyOf(i, ROWS[k] as RowKey));
        } else if (rj < ri) {
          lost++;
          if (setup.royaltyMode === 'on-win') give(i, j, royaltyOf(j, ROWS[k] as RowKey));
        }
      });
      if (setup.royaltyMode === 'all') {
        for (const row of ROWS) {
          give(j, i, royaltyOf(i, row));
          give(i, j, royaltyOf(j, row));
        }
      }
      let u = won - lost;
      if (won >= 2) u += setup.majorityBonus;
      if (lost >= 2) u -= setup.majorityBonus;
      if (won === 3) {
        u += setup.scoopBonus;
        scoops.push({ winner: i, loser: j });
      }
      if (lost === 3) {
        u -= setup.scoopBonus;
        scoops.push({ winner: j, loser: i });
      }
      give(j, i, u);
      record('rows', rowResult);
    }
  }

  const royaltyHolders = players.filter((p) => !fouls.has(p) && ROWS.some((r) => royaltyOf(p, r) > 0));
  const naturalHolders = players.filter((p) => hasNat(p));
  return { units, scoops, fouls: players.filter((p) => fouls.has(p)), royaltyHolders, naturalHolders, pairs };
}

function validRanking(r: unknown, expected: readonly string[]): boolean {
  if (!Array.isArray(r)) return false;
  const seen: string[] = [];
  for (const g of r) {
    if (!Array.isArray(g) || g.length === 0) return false;
    for (const id of g) {
      if (typeof id !== 'string') return false;
      seen.push(id);
    }
  }
  return seen.length === expected.length && new Set(seen).size === seen.length && expected.every((id) => seen.includes(id));
}

const ROYALTY_CHOICES: Record<RowKey, readonly string[]> = {
  front: ['trips'],
  middle: ['fullHouse', 'quads', 'straightFlush', 'royal'],
  back: ['quads', 'straightFlush', 'royal'],
};

export const pusoy: GameModule<PusoySetup, PusoyInput> = {
  id: 'pusoy',
  playerCounts: [2, 3, 4],

  defaultSetup: () => defaultSetup(),

  validateSetup(raw) {
    if (!isRecord(raw)) return ['options must be an object'];
    const problems: string[] = [];
    if (!['1-6', '2-4', 'custom'].includes(raw.system as string)) problems.push('unknown point system');
    if (!isInt(raw.majorityBonus) || raw.majorityBonus < 0 || raw.majorityBonus > 20) problems.push('majority bonus must be 0 to 20');
    if (!isInt(raw.scoopBonus) || raw.scoopBonus < 0 || raw.scoopBonus > 20) problems.push('scoop bonus must be 0 to 20');
    if (!['scoop', 'flat'].includes(raw.foul as string)) problems.push('unknown foul rule');
    if (!isInt(raw.foulFlat) || raw.foulFlat < 0 || raw.foulFlat > 50) problems.push('flat foul must be 0 to 50');
    if (typeof raw.royalties !== 'boolean') problems.push('royalties must be on or off');
    if (!['classic', 'wikipedia', 'playtime', 'custom'].includes(raw.royaltyPreset as string)) problems.push('unknown royalty preset');
    if (!['all', 'on-win'].includes(raw.royaltyMode as string)) problems.push('unknown royalty mode');
    if (typeof raw.naturals !== 'boolean') problems.push('naturals must be on or off');
    for (const [name, keys, min, max] of [['royalty', ROYALTY_KEYS, 0, 50], ['natural', NATURAL_KEYS, 0, 200]] as const) {
      const t = raw[name];
      if (!isRecord(t)) {
        problems.push(`${name} table must be an object`);
        continue;
      }
      for (const k of keys) {
        const v = has(t, k) ? t[k] : undefined;
        if (!isInt(v) || v < min || v > max) problems.push(`${name} ${k} must be ${min} to ${max}`);
      }
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

    const fouls = input.fouls;
    if (fouls !== undefined && (!Array.isArray(fouls) || new Set(fouls).size !== fouls.length || !fouls.every((f) => typeof f === 'string' && players.includes(f)))) {
      problems.push('fouls must list each fouled player once');
      return problems;
    }
    const fouled = new Set<string>((fouls as string[] | undefined) ?? []);

    const naturals = input.naturals;
    const natural = new Set<string>();
    if (naturals !== undefined) {
      if (!isRecord(naturals)) {
        problems.push('naturals must be an object');
      } else if (Object.keys(naturals).length > 0 && !setup.naturals) {
        problems.push('naturals are switched off');
      } else {
        for (const [id, key] of Object.entries(naturals)) {
          if (!players.includes(id) || !(NATURAL_KEYS as readonly string[]).includes(key as string)) problems.push('unknown natural hand');
          else if (setup.natural[key as NaturalKey] === 0) problems.push('that natural hand is not played at this table');
          else if (fouled.has(id)) problems.push('a fouled player cannot have a natural');
          else natural.add(id);
        }
      }
    }

    const toRank = players.filter((p) => !fouled.has(p) && !natural.has(p));
    const rows = input.rows;
    if (!isRecord(rows)) {
      problems.push('rows are required');
    } else {
      for (const row of ROWS) {
        if (!validRanking(rows[row], toRank)) {
          problems.push(`rank every player who is not fouled or holding a natural in the ${row} row, once each`);
          break;
        }
      }
    }

    const royalties = input.royalties;
    if (royalties !== undefined) {
      if (!isRecord(royalties)) problems.push('royalties must be an object');
      else if (Object.keys(royalties).length > 0 && !setup.royalties) problems.push('royalties are switched off');
      else {
        for (const [id, r] of Object.entries(royalties)) {
          if (!players.includes(id) || fouled.has(id) || natural.has(id)) problems.push('royalties are for valid players only');
          else if (!isRecord(r)) problems.push('bad royalty entry');
          else {
            for (const row of ROWS) {
              const pick = has(r, row) ? r[row] : undefined;
              if (pick !== undefined && !ROYALTY_CHOICES[row].includes(pick as string)) problems.push(`unknown ${row} royalty`);
            }
          }
        }
      }
    }
    return problems;
  },

  score(setup, players, input) {
    const { units } = analyze(setup, players, input);
    // Object.fromEntries defines own properties, so even an id such as "__proto__" keeps its amount.
    return Object.fromEntries(
      players.map((id) => {
        const v = (units[id] as number) * input.stake;
        if (Math.abs(v) > MAX_AMOUNT) throw new RangeError('round is too large');
        return [id, v + 0]; // a stray -0 becomes 0
      }),
    ) as Net;
  },
};
