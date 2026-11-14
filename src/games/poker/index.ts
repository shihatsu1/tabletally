import type { GameModule } from '../../core/game';
import { MAX_AMOUNT, convertZeroSum } from '../../core/integer';
import type { Net } from '../../core/settlement';

/**
 * Poker (home cash game) money tracking. See docs/rules/poker.md. The app never sees hands, bets or pots:
 * one "round" is one session (a night). For each player the host enters every buy-in (the first buy-in
 * and any rebuys, in chips) and the final cash-out (chips). Chips in must equal chips out. If they do
 * not, the round is refused until an entry is fixed or the difference is assigned to one chosen player.
 *
 *   net chips = cash-out - sum of buy-ins   (+ the difference, for the player it is assigned to)
 *   units     = net chips converted with the integer ratio `chips : moneyUnits`, largest remainder,
 *               so the converted totals still sum to exactly zero.
 */
export interface PokerSetup {
  /** `chips` chips are worth `moneyUnits` of the room's unit. Two integers keep the math exact. */
  chips: number;
  moneyUnits: number;
  /** The usual buy-in, offered as the default for a first buy-in and each rebuy. */
  buyIn: number;
  /** Blinds in chips, used when playing in the app (no-limit Texas Hold'em with play chips). Optional so older rooms stay valid. */
  smallBlind?: number;
  bigBlind?: number;
}

export interface PokerInput {
  /** Every buy-in and rebuy for each player, in chips. Each player has at least one. */
  buyIns: Record<string, number[]>;
  /** Final stack for each player, in chips (0 if they lost everything). */
  cashOuts: Record<string, number>;
  /** Whoever absorbs a chips-in vs chips-out difference. Required when the totals differ. */
  adjustTo?: string;
}

export const MAX_CHIPS = 1_000_000_000;
export const MAX_ENTRIES = 30;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function defaultSetup(): PokerSetup {
  return { chips: 1, moneyUnits: 1, buyIn: 100, smallBlind: 1, bigBlind: 2 };
}

/** The blinds a table plays with: the chosen ones, or about 2% of the buy-in for the big blind. */
export function blindsOf(setup: PokerSetup): { sb: number; bb: number } {
  const bb = setup.bigBlind ?? Math.max(2, Math.round(setup.buyIn / 50));
  return { sb: setup.smallBlind ?? Math.max(1, Math.floor(bb / 2)), bb };
}

export interface Analysis {
  /** Sum of all buy-ins. */
  chipsIn: number;
  chipsOut: number;
  /** chipsIn - chipsOut. Positive means chips are missing, negative means extra chips came out. */
  difference: number;
  /** Net chips per player, after any adjustment. */
  netChips: Record<string, number>;
  /** Total each player put in. */
  put: Record<string, number>;
}

/** Totals for a round in chips. Pure; the validators must have passed first. */
export function analyze(players: readonly string[], input: PokerInput): Analysis {
  const own = <T>(rec: Record<string, T>, id: string): T | undefined => (has(rec, id) ? rec[id] : undefined);
  const paid = players.map((id) => (own(input.buyIns, id) ?? []).reduce((s, n) => s + n, 0));
  const out = players.map((id) => own(input.cashOuts, id) ?? 0);
  const chipsIn = paid.reduce((s, n) => s + n, 0);
  const chipsOut = out.reduce((s, n) => s + n, 0);
  const difference = chipsIn - chipsOut;
  // Object.fromEntries defines own properties, so even an id such as "__proto__" keeps its amount.
  const put = Object.fromEntries(players.map((id, i) => [id, paid[i] as number]));
  const netChips = Object.fromEntries(players.map((id, i) => [id, (out[i] as number) - (paid[i] as number) + (input.adjustTo === id ? difference : 0)]));
  return { chipsIn, chipsOut, difference, netChips, put };
}

export const poker: GameModule<PokerSetup, PokerInput> = {
  id: 'poker',
  playerCounts: [2, 3, 4, 5, 6, 7, 8, 9, 10],

  defaultSetup: () => defaultSetup(),

  validateSetup(raw) {
    if (!isRecord(raw)) return ['options must be an object'];
    const problems: string[] = [];
    if (!isInt(raw.chips) || raw.chips < 1 || raw.chips > MAX_CHIPS) problems.push(`chips must be 1 to ${MAX_CHIPS}`);
    if (!isInt(raw.moneyUnits) || raw.moneyUnits < 1 || raw.moneyUnits > MAX_CHIPS) problems.push(`money units must be 1 to ${MAX_CHIPS}`);
    if (!isInt(raw.buyIn) || raw.buyIn < 1 || raw.buyIn > MAX_CHIPS) problems.push(`buy-in must be 1 to ${MAX_CHIPS}`);
    for (const key of ['smallBlind', 'bigBlind'] as const) {
      const v = raw[key];
      if (v !== undefined && (!isInt(v) || v < 1 || v > MAX_CHIPS)) problems.push(`${key} must be 1 to ${MAX_CHIPS}`);
    }
    if (isInt(raw.smallBlind) && isInt(raw.bigBlind) && raw.smallBlind > raw.bigBlind) problems.push('the small blind cannot be more than the big blind');
    if (isInt(raw.bigBlind) && isInt(raw.buyIn) && raw.bigBlind > raw.buyIn) problems.push('the big blind cannot be more than the buy-in');
    return problems;
  },

  validate(setup, players, raw) {
    const input = raw as unknown;
    if (!isRecord(input)) return ['round must be an object'];
    const { buyIns, cashOuts, adjustTo } = input;
    if (!isRecord(buyIns) || !isRecord(cashOuts)) return ['buy-ins and cash-outs are required'];
    const problems: string[] = [];

    for (const [name, rec] of [['buy-ins', buyIns], ['cash-outs', cashOuts]] as const) {
      if (Object.keys(rec).some((k) => !players.includes(k))) problems.push(`${name} list an unknown player`);
    }
    for (const id of players) {
      const list = has(buyIns, id) ? buyIns[id] : undefined;
      if (!Array.isArray(list) || list.length < 1 || list.length > MAX_ENTRIES || !list.every((n) => isInt(n) && n >= 1 && n <= MAX_CHIPS)) {
        problems.push(`every player needs 1 to ${MAX_ENTRIES} buy-ins of 1 to ${MAX_CHIPS} chips`);
        break;
      }
    }
    for (const id of players) {
      const out = has(cashOuts, id) ? cashOuts[id] : undefined;
      if (!isInt(out) || out < 0 || out > MAX_CHIPS * MAX_ENTRIES) {
        problems.push('every player needs a cash-out of 0 or more chips');
        break;
      }
    }
    if (problems.length > 0) return problems;

    const a = analyze(players, input as unknown as PokerInput);
    if (adjustTo !== undefined && (typeof adjustTo !== 'string' || !players.includes(adjustTo))) {
      problems.push('the difference must be assigned to a player at the table');
    } else if (a.difference !== 0 && adjustTo === undefined) {
      problems.push(
        a.difference > 0
          ? `${a.difference} chips are missing: chips out must equal chips in`
          : `${-a.difference} extra chips came out: chips out must equal chips in`,
      );
    } else if (a.difference === 0 && adjustTo !== undefined) {
      problems.push('chips in equal chips out, so there is nothing to assign');
    }
    if (problems.length === 0 && Object.values(a.netChips).some((n) => Math.abs(n) > MAX_AMOUNT)) problems.push('round is too large');
    return problems;
  },

  score(setup, players, input) {
    const a = analyze(players, input);
    const chips = players.map((id) => (has(a.netChips, id) ? a.netChips[id] : 0) as number);
    const units = convertZeroSum(chips, { chips: setup.chips, moneyUnits: setup.moneyUnits });
    // Object.fromEntries defines own properties, so even an id such as "__proto__" keeps its amount.
    return Object.fromEntries(players.map((id, i) => [id, (units[i] as number) + 0])) as Net;
  },
};
