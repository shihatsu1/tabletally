/**
 * Poker digital play: no-limit Texas Hold'em with PLAY CHIPS. TableTally never handles money; chips are a score and
 * the room's ledger converts them with the host's ratio, exactly as for a home game played with real cards.
 * See docs/rules/poker.md (Digital play).
 *
 * - 2 to 6 players. Every player starts each hand with their stack; a player who has no chips buys back in for one
 *   buy-in before the hand. A hand is one ledger round: buy-in = the stack at the start, cash-out = the stack at the
 *   end, so chips in always equal chips out.
 * - The dealer button moves one seat each hand. Small blind is left of the button, big blind next (heads-up: the
 *   button is the small blind and acts first before the flop, last after).
 * - Betting is no-limit. A raise must be at least the size of the last full raise (or the big blind). An all-in
 *   that is smaller than a full raise does not let players who already acted raise again.
 * - Side pots are built from what each player put in. Ties split the pot; an odd chip goes to the first winner
 *   left of the button. A bet nobody can call is returned to the bettor.
 */
import type { BotLevel, PlayEngine } from '../../core/play';
import { makeRng, shuffle, type Rng } from '../../core/rng';
import type { Card } from '../cards';
import { rankOf } from '../cards';
import { eval5 } from '../pusoy/engine';
import { MAX_CHIPS, analyze, blindsOf, type PokerInput, type PokerSetup } from './index';

// ------------------------------------------------------------------ hand evaluation

/** Hand category 0 high card .. 8 straight flush, as in the Pusoy evaluator. */
export interface Strength {
  key: number;
  cat: number;
}

const COMBOS: Record<number, number[][]> = {};
function combos(n: number): number[][] {
  if (COMBOS[n]) return COMBOS[n] as number[][];
  const out: number[][] = [];
  const pick: number[] = [];
  const go = (start: number): void => {
    if (pick.length === 5) { out.push([...pick]); return; }
    for (let i = start; i <= n - (5 - pick.length); i++) { pick.push(i); go(i + 1); pick.pop(); }
  };
  go(0);
  COMBOS[n] = out;
  return out;
}

/** The best five-card hand among 5 to 7 cards. */
export function bestOf(cards: readonly Card[]): Strength {
  let best: Strength | null = null;
  for (const ix of combos(cards.length)) {
    const e = eval5(ix.map((i) => cards[i] as Card));
    if (best === null || e.key > best.key) best = { key: e.key, cat: e.cat };
  }
  return best as Strength;
}

// ------------------------------------------------------------------ state

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'over';

export interface PkSeat {
  stack: number;
  /** Chips put in on this street. */
  bet: number;
  /** Chips put in over the whole hand. */
  total: number;
  folded: boolean;
  allIn: boolean;
  hole: [Card, Card];
}

export interface PkWin {
  id: string;
  amount: number;
}

export interface PkState {
  blinds: { sb: number; bb: number };
  players: string[];
  button: number;
  seats: Record<string, PkSeat>;
  startStacks: Record<string, number>;
  /** Top of the deck is the LAST element. */
  deck: Card[];
  board: Card[];
  street: Street;
  currentBet: number;
  /** Size of the last full raise (at least the big blind). */
  minRaise: number;
  /** Players who still have to act on this street, in order; the first one is on turn. */
  queue: string[];
  /** The bet level a player faced when they last acted this street (null = not acted yet). They may raise again only
   *  when the bet has since gone up by at least a full raise, so several short all-ins can add up to reopen the betting. */
  lastAct: Record<string, number | null>;
  /** Filled when the hand is over. */
  endStacks: Record<string, number> | null;
  wins: PkWin[];
  /** Players who showed cards at the end, with the strength of their hand. */
  showdown: { id: string; cat: number }[];
}

export type PkMove = { t: 'fold' } | { t: 'check' } | { t: 'call' } | { t: 'raise'; to: number };

export interface PkSeatView {
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  dealer: boolean;
}

export interface PkView {
  you: string | null;
  players: string[];
  /** Your own two cards (nobody else's until the showdown). */
  hole: Card[];
  board: Card[];
  street: Street;
  pot: number;
  seat: Record<string, PkSeatView>;
  toAct: string | null;
  /** What you would have to add to call (0 when you can check). */
  toCall: number;
  /** The smallest and largest total you may raise TO this street. Null when you cannot raise. */
  raise: { min: number; max: number } | null;
  blinds: { sb: number; bb: number };
  done: boolean;
  /** At the end: who showed what, and who won how much. */
  reveal?: { id: string; hole: Card[]; cat: number }[];
  wins?: PkWin[];
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const potOf = (s: PkState): number => s.players.reduce((a, id) => a + (s.seats[id] as PkSeat).total, 0);
const live = (s: PkState): string[] => s.players.filter((id) => !(s.seats[id] as PkSeat).folded);
const canAct = (s: PkState, id: string): boolean => {
  const seat = s.seats[id] as PkSeat;
  return !seat.folded && !seat.allIn;
};

/** Seat order starting just after `from`. */
const orderAfter = (s: PkState, from: number): string[] => s.players.map((_, k) => s.players[(from + 1 + k) % s.players.length] as string);

function post(s: PkState, id: string, amount: number): void {
  const seat = s.seats[id] as PkSeat;
  const pay = Math.min(amount, seat.stack);
  seat.stack -= pay;
  seat.bet += pay;
  seat.total += pay;
  if (seat.stack === 0) seat.allIn = true;
}

function start(setup: PokerSetup, players: readonly string[], seed: number, prev?: PkState | null): PkState {
  const rng = makeRng(seed);
  const n = players.length;
  const blinds = blindsOf(setup);
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const startStacks: Record<string, number> = {};
  const seats: Record<string, PkSeat> = {};
  players.forEach((id, i) => {
    // Chips carry over from the last hand; a player with none buys back in for one buy-in.
    const carried = prev?.endStacks?.[id] ?? setup.buyIn;
    const stack = carried > 0 ? carried : setup.buyIn;
    startStacks[id] = stack;
    seats[id] = { stack, bet: 0, total: 0, folded: false, allIn: false, hole: [deck.pop() as Card, deck.pop() as Card] };
    void i;
  });
  const button = prev ? (prev.button + 1) % n : (rng() >>> 0) % n;
  const s: PkState = {
    blinds, players: [...players], button, seats, startStacks, deck, board: [], street: 'preflop',
    currentBet: 0, minRaise: blinds.bb, queue: [], lastAct: Object.fromEntries(players.map((id) => [id, null])), endStacks: null, wins: [], showdown: [],
  };
  const sbSeat = n === 2 ? button : (button + 1) % n;
  const bbSeat = n === 2 ? (button + 1) % n : (button + 2) % n;
  post(s, players[sbSeat] as string, blinds.sb);
  post(s, players[bbSeat] as string, blinds.bb);
  // The bet to match is the full big blind even if the big blind could only post part of it.
  s.currentBet = blinds.bb;
  // Before the flop the player after the big blind acts first (heads-up that is the button).
  s.queue = orderAfter(s, bbSeat).filter((id) => canAct(s, id));
  return settleStreet(s);
}

function mayRaise(s: PkState, id: string): boolean {
  const last = s.lastAct[id];
  return last === null || last === undefined || s.currentBet - last >= s.minRaise;
}

function minRaiseTo(s: PkState, id: string): { min: number; max: number } | null {
  const seat = s.seats[id] as PkSeat;
  const max = seat.bet + seat.stack;
  if (!mayRaise(s, id) || max <= s.currentBet) return null;
  return { min: Math.min(s.currentBet + s.minRaise, max), max };
}

function toActOf(s: PkState): string | null {
  return s.street === 'over' ? null : (s.queue[0] ?? null);
}

function validate(s: PkState, pid: string, raw: unknown): string[] {
  if (s.street === 'over') return ['this hand is over'];
  if (toActOf(s) !== pid) return ['it is not your turn'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['bad move'];
  const m = raw as Record<string, unknown>;
  const seat = s.seats[pid] as PkSeat;
  switch (m.t) {
    case 'fold':
      return [];
    case 'check':
      return seat.bet === s.currentBet ? [] : ['you cannot check, there is a bet to call'];
    case 'call':
      return seat.bet < s.currentBet ? [] : ['there is nothing to call'];
    case 'raise': {
      if (!isInt(m.to)) return ['bad raise amount'];
      const r = minRaiseTo(s, pid);
      if (!r) return ['you cannot raise now'];
      if (m.to > r.max) return ['you do not have that many chips'];
      if (m.to < r.min) return [`the smallest raise is to ${r.min}`];
      return [];
    }
    default:
      return ['bad move'];
  }
}

function clone(s: PkState): PkState {
  return {
    ...s,
    players: [...s.players],
    seats: Object.fromEntries(s.players.map((id) => [id, { ...(s.seats[id] as PkSeat) }])),
    deck: [...s.deck], board: [...s.board], queue: [...s.queue], lastAct: { ...s.lastAct },
    wins: [...s.wins], showdown: [...s.showdown],
  };
}

function apply(state: PkState, pid: string, move: PkMove): PkState {
  const s = clone(state);
  const seat = s.seats[pid] as PkSeat;
  s.queue = s.queue.filter((id) => id !== pid);

  switch (move.t) {
    case 'fold':
      seat.folded = true;
      break;
    case 'check':
      s.lastAct[pid] = s.currentBet;
      break;
    case 'call':
      post(s, pid, s.currentBet - seat.bet);
      s.lastAct[pid] = s.currentBet;
      break;
    case 'raise': {
      const raiseSize = move.to - s.currentBet;
      post(s, pid, move.to - seat.bet);
      const full = raiseSize >= s.minRaise;
      if (full) s.minRaise = raiseSize;
      s.currentBet = Math.max(s.currentBet, seat.bet);
      s.lastAct[pid] = s.currentBet;
      const i = s.players.indexOf(pid);
      if (full) {
        // A full raise reopens the betting for everyone else still in the hand.
        s.queue = orderAfter(s, i).filter((id) => id !== pid && canAct(s, id));
      } else {
        // A short all-in must still be called. Those who already acted may raise again only if the bet has now gone
        // up by at least a full raise since they last acted (see `mayRaise`).
        s.queue = orderAfter(s, i).filter((id) => id !== pid && canAct(s, id) && (s.seats[id] as PkSeat).bet < s.currentBet);
      }
      break;
    }
  }
  return settleStreet(s);
}

/** Move on when nobody is left to act: next street, run out the board, or end the hand. */
function settleStreet(s: PkState): PkState {
  for (;;) {
    if (live(s).length === 1) return finish(s);
    if (s.queue.length > 0) {
      // Someone alone with chips against all-in players has nobody to bet against.
      const withChips = live(s).filter((id) => canAct(s, id));
      if (withChips.length === 1 && (s.seats[withChips[0] as string] as PkSeat).bet >= s.currentBet) s.queue = [];
      else return s;
    }
    if (s.street === 'river') return finish(s);
    for (const id of s.players) (s.seats[id] as PkSeat).bet = 0;
    s.currentBet = 0;
    s.minRaise = s.blinds.bb;
    for (const id of s.players) s.lastAct[id] = null;
    const burn = s.deck.pop();
    void burn;
    const count = s.street === 'preflop' ? 3 : 1;
    for (let i = 0; i < count; i++) s.board.push(s.deck.pop() as Card);
    s.street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river';
    const withChips = live(s).filter((id) => canAct(s, id));
    s.queue = withChips.length >= 2 ? orderAfter(s, s.button).filter((id) => canAct(s, id)) : [];
  }
}

/** Split the pot into the main pot and side pots from what each player put in. */
export function buildPots(total: Record<string, number>, folded: ReadonlySet<string>): { amount: number; eligible: string[] }[] {
  const ids = Object.keys(total);
  const levels = [...new Set(ids.map((id) => total[id] as number).filter((n) => n > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = ids.reduce((a, id) => a + Math.max(0, Math.min(total[id] as number, level) - prev), 0);
    const eligible = ids.filter((id) => (total[id] as number) >= level && !folded.has(id));
    if (amount > 0) {
      // A level made only by players who folded is not a separate pot: its chips join the pot with the same players
      // in it, so an odd chip is split once, not once per level.
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length && last.eligible.every((id, i) => id === eligible[i])) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  return pots;
}

function finish(s: PkState): PkState {
  s.street = 'over';
  s.queue = [];
  const folded = new Set(s.players.filter((id) => (s.seats[id] as PkSeat).folded));
  const winnings: Record<string, number> = Object.fromEntries(s.players.map((id) => [id, 0]));
  const contenders = live(s);
  const strength: Record<string, Strength> = {};
  if (contenders.length > 1) {
    for (const id of contenders) strength[id] = bestOf([...(s.seats[id] as PkSeat).hole, ...s.board]);
    s.showdown = contenders.map((id) => ({ id, cat: (strength[id] as Strength).cat }));
  }
  const total = Object.fromEntries(s.players.map((id) => [id, (s.seats[id] as PkSeat).total]));
  for (const pot of buildPots(total, folded)) {
    let winners = pot.eligible;
    if (winners.length === 0) winners = contenders; // cannot happen: someone always remains eligible for each pot
    if (winners.length > 1 && contenders.length > 1) {
      const best = Math.max(...winners.map((id) => (strength[id] as Strength).key));
      winners = winners.filter((id) => (strength[id] as Strength).key === best);
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const id of winners) winnings[id] = (winnings[id] as number) + share;
    // The odd chip(s) go to the winners closest to the left of the button.
    for (const id of orderAfter(s, s.button)) {
      if (odd === 0) break;
      if (winners.includes(id)) { winnings[id] = (winnings[id] as number) + 1; odd--; }
    }
  }
  s.endStacks = Object.fromEntries(s.players.map((id) => [id, (s.seats[id] as PkSeat).stack + (winnings[id] as number)]));
  // What each winner gained: their end stack less what they started with (so a returned uncalled bet is not a "win").
  s.wins = s.players
    .map((id) => ({ id, amount: (s.endStacks as Record<string, number>)[id]! - (s.startStacks[id] as number) }))
    .filter((w) => w.amount > 0);
  return s;
}

function viewFor(s: PkState, pid: string | null): PkView {
  const me = pid && s.seats[pid] ? pid : null;
  const over = s.street === 'over';
  const seat = Object.fromEntries(s.players.map((id, i) => {
    const x = s.seats[id] as PkSeat;
    // Once the hand is over show the stacks after the payouts.
    return [id, over && s.endStacks ? { stack: s.endStacks[id] as number, bet: 0, folded: x.folded, allIn: false, dealer: i === s.button } : { stack: x.stack, bet: x.bet, folded: x.folded, allIn: x.allIn, dealer: i === s.button }];
  }));
  const toAct = toActOf(s);
  const mine = me ? (s.seats[me] as PkSeat) : null;
  const view: PkView = {
    you: pid,
    players: s.players,
    hole: me && mine ? [...mine.hole] : [],
    board: s.board,
    street: s.street,
    pot: potOf(s),
    seat,
    toAct,
    toCall: mine ? Math.max(0, Math.min(mine.stack, s.currentBet - mine.bet)) : 0,
    raise: me && toAct === me ? minRaiseTo(s, me) : null,
    blinds: s.blinds,
    done: over,
  };
  if (over) {
    view.reveal = s.showdown.map((x) => ({ id: x.id, hole: [...(s.seats[x.id] as PkSeat).hole], cat: x.cat }));
    view.wins = s.wins;
  }
  return view;
}

/** The ledger limits each buy-in entry; a bigger starting stack is written as several entries. */
const entries = (stack: number): number[] => {
  const out: number[] = [];
  for (let left = stack; left > 0; left -= MAX_CHIPS) out.push(Math.min(left, MAX_CHIPS));
  return out;
};

function result(s: PkState): Record<string, unknown> | null {
  if (s.street !== 'over' || !s.endStacks) return null;
  const input: PokerInput = {
    buyIns: Object.fromEntries(s.players.map((id) => [id, entries(s.startStacks[id] as number)])),
    cashOuts: { ...s.endStacks },
  };
  return input as unknown as Record<string, unknown>;
}

// ------------------------------------------------------------------ computer players

/** Chen's formula, 0 (worst) to about 20 (pocket aces), for two hole cards. */
export function chen(hole: readonly Card[]): number {
  const v = (c: Card): number => (rankOf(c) === 1 ? 14 : rankOf(c));
  const [a, b] = [...hole].sort((x, y) => v(y) - v(x)) as [Card, Card];
  const pts = (r: number): number => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let score = pts(v(a));
  const suited = Math.floor(a / 13) === Math.floor(b / 13);
  if (v(a) === v(b)) return Math.max(5, score * 2);
  if (suited) score += 2;
  const gap = v(a) - v(b) - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && v(a) < 12) score += 1;
  return Math.max(0, Math.ceil(score));
}

/** Chance (0 to 1) of winning at showdown against `opponents` random hands, by simulation. */
export function equity(hole: readonly Card[], board: readonly Card[], opponents: number, trials: number, rng: Rng): number {
  const known = new Set<number>([...hole, ...board]);
  const rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !known.has(c));
  let score = 0;
  for (let t = 0; t < trials; t++) {
    const d = shuffle(rest, rng);
    const full = [...board, ...d.slice(0, 5 - board.length)];
    const mine = bestOf([...hole, ...full]).key;
    let best = mine;
    let ties = 1;
    for (let o = 0; o < opponents; o++) {
      const theirs = bestOf([d[5 - board.length + o * 2] as Card, d[6 - board.length + o * 2] as Card, ...full]).key;
      if (theirs > best) { best = theirs; ties = 0; }
      else if (theirs === best) ties++;
    }
    if (best === mine) score += 1 / ties;
  }
  return score / trials;
}

/** A quick 0 to 1 strength guess without simulation (Normal). */
function roughStrength(view: PkView): number {
  if (view.board.length === 0) return Math.min(1, chen(view.hole) / 18);
  const s = bestOf([...view.hole, ...view.board]);
  const v = (c: Card): number => (rankOf(c) === 1 ? 14 : rankOf(c));
  const boardTop = Math.max(...view.board.map(v));
  const byCat = [0.22, 0.5, 0.72, 0.8, 0.88, 0.9, 0.95, 0.99, 1];
  let r = byCat[s.cat] as number;
  if (s.cat === 0) r += Math.max(...view.hole.map(v)) / 100;
  if (s.cat === 1 && view.hole.some((c) => v(c) >= boardTop)) r += 0.1; // top pair or better
  return Math.min(1, r);
}

function raiseTo(view: PkView, fraction: number): number {
  const r = view.raise as { min: number; max: number };
  const target = (view.seat[view.you as string] as PkSeatView).bet + view.toCall + Math.round((view.pot + view.toCall) * fraction);
  return Math.max(r.min, Math.min(r.max, target));
}

function pkBot(view: PkView, level: BotLevel, seed: number): PkMove {
  const rng = makeRng(seed);
  const me = view.seat[view.you as string] as PkSeatView;
  const odds = view.toCall / (view.pot + view.toCall);
  const check = (): PkMove => ({ t: 'check' });
  const passive = (): PkMove => (view.toCall === 0 ? check() : { t: 'fold' });
  const call = (): PkMove => (view.toCall === 0 ? check() : { t: 'call' });
  const raise = (fraction: number): PkMove => (view.raise ? { t: 'raise', to: raiseTo(view, fraction) } : call());
  const roll = rng() % 100;

  if (level === 'easy') {
    if (view.toCall === 0) return roll < 12 ? raise(0.4) : check();
    if (view.toCall > view.pot * 0.8 && roll < 45) return { t: 'fold' };
    return roll < 8 ? raise(0.5) : roll < 78 ? call() : { t: 'fold' };
  }

  if (level === 'normal') {
    if (roll < 15) return roll < 7 ? passive() : call(); // careless now and then
    const s = roughStrength(view);
    if (view.toCall === 0) return s > 0.62 ? raise(0.55) : s > 0.45 && roll < 40 ? raise(0.35) : check();
    if (s > 0.8) return raise(0.7);
    return s > odds + 0.12 ? call() : passive();
  }

  // Hard: compare a simulated chance of winning with the pot odds, and play position and bluffs.
  const opponents = Math.max(1, view.players.filter((id) => id !== view.you && !(view.seat[id] as PkSeatView).folded).length);
  const e = equity(view.hole, view.board, Math.min(opponents, 4), 260, rng);
  const late = me.dealer;
  const adj = e - (opponents - 1) * 0.02;
  if (view.toCall === 0) {
    if (adj > 0.66) return raise(0.7);
    if (adj > 0.52 && roll < 55) return raise(0.5);
    if (adj < 0.4 && late && roll < 14 && view.board.length > 0) return raise(0.55); // a little bluff from late position
    return check();
  }
  if (adj > 0.78 && view.raise) return raise(0.9);
  if (adj > 0.64 && view.raise && roll < 50) return raise(0.6);
  return adj > odds + 0.04 ? call() : passive();
}

function timeoutMove(view: PkView): PkMove {
  return view.toCall === 0 ? { t: 'check' } : { t: 'fold' };
}

export const pokerEngine: PlayEngine<PokerSetup, PkState, PkMove, PkView> = {
  start,
  playerCounts: [2, 3, 4, 5, 6],
  stakeless: true,
  linkedHands: true,
  toAct: toActOf,
  validate,
  apply,
  viewFor,
  result,
  finalize(input, _setup, history) {
    // Carry the session's chips so the scorer converts the whole session at once (see PokerInput.prior).
    const players = Object.keys((input as unknown as PokerInput).buyIns);
    const prior: Record<string, number> = Object.fromEntries(players.map((id) => [id, 0]));
    for (const h of history) {
      const net = analyze(players, h as PokerInput).netChips;
      for (const id of players) prior[id] = (prior[id] as number) + (net[id] ?? 0);
    }
    return { ...input, prior, seq: history.length };
  },
  bot: pkBot,
  timeoutMove,
};
