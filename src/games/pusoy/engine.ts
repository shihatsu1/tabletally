/**
 * Pusoy (13-card Chinese poker) digital play: dealing, hand evaluation, setting the three rows, naturals,
 * the reveal, and the computer players. See docs/rules/pusoy.md (Digital play section).
 *
 * - 2 to 4 players, 13 cards each. Everyone splits their cards into back (5), middle (5) and front (3) IN SECRET
 *   and at the same time. When every player has set (or run out of time) all rows are revealed and compared,
 *   row against row, against each opponent, and the result goes to the normal Pusoy scorer.
 * - The back must be at least as strong as the middle, and the middle at least as strong as the front. The app does
 *   not accept a mis-set hand, so a foul cannot happen in digital play.
 * - A player dealt a natural (for example three flushes, six pairs, a dragon) may declare it instead of setting rows,
 *   if the host has that natural switched on.
 * - Five-card hands: straight flush > four of a kind > full house > flush > straight > three of a kind > two pair >
 *   pair > high card. The wheel (A-2-3-4-5) is the lowest straight. Suits never break ties. The front is three
 *   cards: three of a kind > pair > high card.
 */
import type { BotLevel, PlayEngine } from '../../core/play';
import { makeRng, rngFrom, shuffle, type Rng } from '../../core/rng';
import type { Card } from '../cards';
import { rankOf, suitOf } from '../cards';
import type { Detail, NaturalKey, PlayerRoyalties, PusoyInput, PusoySetup, Ranking, RowKey } from './index';
import { analyze, ROWS } from './index';

// ------------------------------------------------------------------ hand evaluation

/** Ace high: 2..14. */
export const rankValue = (c: Card): number => (rankOf(c) === 1 ? 14 : rankOf(c));

export const CAT = { high: 0, pair: 1, twoPair: 2, trips: 3, straight: 4, flush: 5, fullHouse: 6, quads: 7, straightFlush: 8 } as const;
export type Cat = (typeof CAT)[keyof typeof CAT];

export interface Eval {
  cat: Cat;
  /** Ranks that decide the hand, most important first (group size, then rank). */
  lead: number[];
  /** Comparable with another eval of the same size: bigger wins. */
  key: number;
  royal: boolean;
}

const B = 15;

function groups(cards: readonly Card[]): { rank: number; n: number }[] {
  const m = new Map<number, number>();
  for (const c of cards) m.set(rankValue(c), (m.get(rankValue(c)) ?? 0) + 1);
  return [...m].map(([rank, n]) => ({ rank, n })).sort((a, b) => b.n - a.n || b.rank - a.rank);
}

const encode = (cat: number, lead: readonly number[], width: number): number =>
  lead.reduce((acc, r, i) => acc + r * B ** (width - 1 - i), cat * B ** width);

/** Three-card hand: high card, pair or three of a kind. */
export function eval3(cards: readonly Card[]): Eval {
  const g = groups(cards);
  const cat: Cat = g[0]!.n === 3 ? CAT.trips : g[0]!.n === 2 ? CAT.pair : CAT.high;
  const lead = g.map((x) => x.rank);
  return { cat, lead, key: encode(cat, lead, 3), royal: false };
}

/** Five-card hand. */
export function eval5(cards: readonly Card[]): Eval {
  const g = groups(cards);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0] as Card));
  const ranks = g.map((x) => x.rank).sort((a, b) => b - a);
  const distinct = g.length === 5;
  const wheel = distinct && ranks.join() === '14,5,4,3,2';
  const straight = distinct && (ranks[0]! - ranks[4]! === 4 || wheel);
  const top = wheel ? 5 : ranks[0]!;
  const seq = straight ? [top, top - 1, top - 2, top - 3, top - 4] : [];
  let cat: Cat;
  let lead: number[];
  if (straight && flush) { cat = CAT.straightFlush; lead = seq; }
  else if (g[0]!.n === 4) { cat = CAT.quads; lead = g.map((x) => x.rank); }
  else if (g[0]!.n === 3 && g[1]!.n === 2) { cat = CAT.fullHouse; lead = g.map((x) => x.rank); }
  else if (flush) { cat = CAT.flush; lead = ranks; }
  else if (straight) { cat = CAT.straight; lead = seq; }
  else if (g[0]!.n === 3) { cat = CAT.trips; lead = g.map((x) => x.rank); }
  else if (g[0]!.n === 2 && g[1]!.n === 2) { cat = CAT.twoPair; lead = g.map((x) => x.rank); }
  else if (g[0]!.n === 2) { cat = CAT.pair; lead = g.map((x) => x.rank); }
  else { cat = CAT.high; lead = ranks; }
  return { cat, lead, key: encode(cat, lead, 5), royal: cat === CAT.straightFlush && top === 14 };
}

/** Is a five-card middle at least as strong as a three-card front? Compares the deciding ranks, category first. */
export function middleCoversFront(middle: Eval, front: Eval): boolean {
  if (middle.cat !== front.cat) return middle.cat > front.cat;
  for (let i = 0; i < Math.min(middle.lead.length, front.lead.length); i++) {
    if (middle.lead[i] !== front.lead[i]) return (middle.lead[i] as number) > (front.lead[i] as number);
  }
  return true;
}

export interface Arrangement {
  back: Card[];
  middle: Card[];
  front: Card[];
}

export type Problem = 'sizes' | 'cards' | 'order';

/** Why these rows cannot be played (they must use the 13 dealt cards exactly), or null when valid. */
export function arrangementProblem(a: Arrangement, hand: readonly Card[]): Problem | null {
  if (a.back.length !== 5 || a.middle.length !== 5 || a.front.length !== 3) return 'sizes';
  const all = [...a.back, ...a.middle, ...a.front];
  if (new Set(all).size !== 13 || all.length !== hand.length || !all.every((c) => hand.includes(c))) return 'cards';
  const [b, m, f] = [eval5(a.back), eval5(a.middle), eval3(a.front)];
  return b.key >= m.key && middleCoversFront(m, f) ? null : 'order';
}

export function rowEval(a: Arrangement, row: RowKey): Eval {
  return row === 'front' ? eval3(a.front) : eval5(a[row]);
}

// ------------------------------------------------------------------ naturals

function subsets<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const go = (start: number): void => {
    if (pick.length === k) { out.push([...pick]); return; }
    for (let i = start; i <= items.length - (k - pick.length); i++) { pick.push(items[i] as T); go(i + 1); pick.pop(); }
  };
  go(0);
  return out;
}

/** Can the 13 cards be split into two five-card groups and a three-card group that satisfy these tests? */
function splits(hand: readonly Card[], ok5: (c: Card[]) => boolean, ok3: (c: Card[]) => boolean): boolean {
  const idx = hand.map((_, i) => i);
  for (const a of subsets(idx, 5)) {
    const A = a.map((i) => hand[i] as Card);
    if (!ok5(A)) continue;
    const rest = idx.filter((i) => !a.includes(i));
    for (const b of subsets(rest, 5)) {
      const Bc = b.map((i) => hand[i] as Card);
      if (!ok5(Bc)) continue;
      if (ok3(rest.filter((i) => !b.includes(i)).map((i) => hand[i] as Card))) return true;
    }
  }
  return false;
}

const sameSuit = (c: readonly Card[]): boolean => c.every((x) => suitOf(x) === suitOf(c[0] as Card));
const consecutive3 = (c: readonly Card[]): boolean => {
  const r = c.map(rankValue).sort((a, b) => a - b);
  return (r[2]! - r[0]! === 2 && new Set(r).size === 3) || r.join() === '2,3,14';
};

/** Every natural hand these 13 cards qualify as (Wikipedia's list; whether it is played depends on the host's options). */
export function naturalsOf(hand: readonly Card[]): NaturalKey[] {
  const g = groups(hand);
  const count = (pred: (n: number) => boolean): number => g.filter((x) => pred(x.n)).length;
  const found: NaturalKey[] = [];
  const rv = hand.map(rankValue);

  if (splits(hand, sameSuit, sameSuit)) found.push('threeFlushes');
  if (splits(hand, (c) => eval5(c).cat === CAT.straight || eval5(c).cat === CAT.straightFlush, consecutive3)) found.push('threeStraights');
  if (g.reduce((a, x) => a + Math.floor(x.n / 2), 0) >= 6) found.push('sixPairs');
  if (count((n) => n >= 3) >= 4) found.push('fourTriplets');
  if (hand.every((c) => suitOf(c) === 1 || suitOf(c) === 2) || hand.every((c) => suitOf(c) === 0 || suitOf(c) === 3)) found.push('sameColour');
  if (rv.every((r) => r <= 8) || rv.every((r) => r >= 8)) found.push('allLowOrHigh');
  if (count((n) => n === 4) >= 3) found.push('threeQuads');
  if (splits(hand, (c) => eval5(c).cat === CAT.straightFlush, (c) => sameSuit(c) && consecutive3(c))) found.push('threeStraightFlushes');
  if (rv.filter((r) => r >= 11 && r <= 13).length === 12) found.push('twelveRoyals');
  if (g.length === 13) found.push(sameSuit(hand) ? 'pureDragon' : 'dragon');
  if (found.includes('pureDragon')) found.push('dragon');
  return found;
}

// ------------------------------------------------------------------ state

export type PsMove = ({ t: 'set' } & Arrangement) | { t: 'natural'; key: NaturalKey };

export interface PsState {
  rules: { royalties: boolean; naturals: boolean; natural: Record<NaturalKey, number> };
  /** The table's scoring options, so the reveal can show how each pair of players came out. */
  setup?: PusoySetup;
  players: string[];
  hands: Record<string, Card[]>;
  /** Naturals each player holds that this table plays (private to them until the reveal). */
  eligible: Record<string, NaturalKey[]>;
  sets: Record<string, Arrangement | null>;
  declared: Record<string, NaturalKey | null>;
  done: boolean;
}

export interface PsView {
  you: string | null;
  players: string[];
  hand: Card[];
  counts: Record<string, number>;
  /** Who still has to set their rows. */
  waiting: string[];
  /** Naturals you were dealt that this table plays, best value first. */
  eligible: NaturalKey[];
  naturalValues: Partial<Record<NaturalKey, number>>;
  /** Your own rows, once set. */
  mine: Arrangement | null;
  myNatural: NaturalKey | null;
  royalties: boolean;
  done: boolean;
  /** Only once everyone is done. */
  reveal?: Record<string, { arrangement: Arrangement | null; natural: NaturalKey | null }>;
  /** Only once everyone is done: each player's units for the hand (before the stake) and every pair's row results. */
  outcome?: { units: Record<string, number>; pairs: Detail['pairs'] };
}

const pendingOf = (s: PsState): string[] => s.players.filter((id) => s.sets[id] === null && s.declared[id] === null);

function start(setup: PusoySetup, players: readonly string[], seed: number | Rng): PsState {
  const rng = rngFrom(seed);
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const hands: Record<string, Card[]> = {};
  const eligible: Record<string, NaturalKey[]> = {};
  players.forEach((id, i) => {
    const hand = deck.slice(i * 13, i * 13 + 13).sort((a, b) => a - b);
    hands[id] = hand;
    eligible[id] = setup.naturals
      ? naturalsOf(hand).filter((k) => setup.natural[k] > 0).sort((a, b) => setup.natural[b] - setup.natural[a])
      : [];
  });
  return {
    rules: { royalties: setup.royalties, naturals: setup.naturals, natural: { ...setup.natural } },
    setup,
    players: [...players],
    hands,
    eligible,
    sets: Object.fromEntries(players.map((id) => [id, null])),
    declared: Object.fromEntries(players.map((id) => [id, null])),
    done: false,
  };
}

const isCards = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((c) => typeof c === 'number' && Number.isSafeInteger(c) && c >= 0 && c < 52);

function validate(s: PsState, pid: string, raw: unknown): string[] {
  if (s.done) return ['this hand is over'];
  if (!s.players.includes(pid)) return ['you are not at this table'];
  if (s.sets[pid] !== null || s.declared[pid] !== null) return ['you have already set your hand'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['bad move'];
  const m = raw as Record<string, unknown>;
  if (m.t === 'natural') {
    return typeof m.key === 'string' && (s.eligible[pid] as NaturalKey[]).includes(m.key as NaturalKey) ? [] : ['you do not hold that natural hand'];
  }
  if (m.t !== 'set') return ['bad move'];
  if (!isCards(m.back, 5) || !isCards(m.middle, 5) || !isCards(m.front, 3)) return ['set 5 cards in the back, 5 in the middle and 3 in the front'];
  const problem = arrangementProblem({ back: m.back, middle: m.middle, front: m.front }, s.hands[pid] as Card[]);
  if (problem === 'cards') return ['use each of your 13 cards exactly once'];
  if (problem === 'order') return ['the back must be at least as strong as the middle, and the middle at least as strong as the front'];
  return [];
}

const sorted = (c: readonly Card[]): Card[] => [...c].sort((a, b) => a - b);

function apply(s: PsState, pid: string, move: PsMove): PsState {
  const next: PsState = { ...s, sets: { ...s.sets }, declared: { ...s.declared } };
  if (move.t === 'natural') next.declared[pid] = move.key;
  else next.sets[pid] = { back: sorted(move.back), middle: sorted(move.middle), front: sorted(move.front) };
  if (pendingOf(next).length === 0) next.done = true;
  return next;
}

// ------------------------------------------------------------------ comparing rows and scoring helpers

/** Group the players by how their row ranks, best first; equal hands share a group. */
function rankRow(players: readonly string[], evalOf: (id: string) => Eval): Ranking {
  const list = players.map((id) => ({ id, key: evalOf(id).key })).sort((a, b) => b.key - a.key);
  const out: Ranking = [];
  let last: number | null = null;
  for (const x of list) {
    if (last !== null && x.key === last) (out[out.length - 1] as string[]).push(x.id);
    else out.push([x.id]);
    last = x.key;
  }
  return out;
}

export function royaltiesOf(a: Arrangement): PlayerRoyalties {
  const out: PlayerRoyalties = {};
  if (eval3(a.front).cat === CAT.trips) out.front = 'trips';
  const m = eval5(a.middle);
  if (m.royal) out.middle = 'royal';
  else if (m.cat === CAT.straightFlush) out.middle = 'straightFlush';
  else if (m.cat === CAT.quads) out.middle = 'quads';
  else if (m.cat === CAT.fullHouse) out.middle = 'fullHouse';
  const b = eval5(a.back);
  if (b.royal) out.back = 'royal';
  else if (b.cat === CAT.straightFlush) out.back = 'straightFlush';
  else if (b.cat === CAT.quads) out.back = 'quads';
  return out;
}

function result(s: PsState): Record<string, unknown> | null {
  if (!s.done) return null;
  const natural: Record<string, NaturalKey> = {};
  for (const id of s.players) if (s.declared[id]) natural[id] = s.declared[id] as NaturalKey;
  const ranked = s.players.filter((id) => s.sets[id] !== null);
  const rows = Object.fromEntries(
    ROWS.map((row) => [row, rankRow(ranked, (id) => rowEval(s.sets[id] as Arrangement, row))]),
  ) as Record<RowKey, Ranking>;
  const input: Partial<PusoyInput> & { rows: Record<RowKey, Ranking> } = { rows };
  if (Object.keys(natural).length > 0) input.naturals = natural;
  if (s.rules.royalties) {
    const royalties: Record<string, PlayerRoyalties> = {};
    for (const id of ranked) {
      const r = royaltiesOf(s.sets[id] as Arrangement);
      if (r.front || r.middle || r.back) royalties[id] = r;
    }
    if (Object.keys(royalties).length > 0) input.royalties = royalties;
  }
  return input;
}

function viewFor(s: PsState, pid: string | null): PsView {
  const counts = Object.fromEntries(s.players.map((id) => [id, (s.hands[id] as Card[]).length]));
  const me = pid && s.hands[pid] ? pid : null;
  const eligible = me ? (s.eligible[me] as NaturalKey[]) : [];
  const view: PsView = {
    you: pid,
    players: s.players,
    hand: me ? (s.hands[me] as Card[]) : [],
    counts,
    waiting: pendingOf(s),
    eligible,
    naturalValues: Object.fromEntries(eligible.map((k) => [k, s.rules.natural[k]])),
    mine: me ? s.sets[me] ?? null : null,
    myNatural: me ? s.declared[me] ?? null : null,
    royalties: s.rules.royalties,
    done: s.done,
  };
  if (s.done) {
    view.reveal = Object.fromEntries(s.players.map((id) => [id, { arrangement: s.sets[id] ?? null, natural: s.declared[id] ?? null }]));
    const input = result(s);
    if (s.setup && input) {
      try {
        const d = analyze(s.setup, s.players, { stake: 1, ...input } as PusoyInput);
        view.outcome = { units: d.units, pairs: d.pairs };
      } catch {
        /* the reveal still shows every hand */
      }
    }
  }
  return view;
}

// ------------------------------------------------------------------ computer players

/** Rough chance that a random hand is weaker, used by Hard to value a row. */
const CUM5 = [0.5012, 0.9235, 0.971, 0.9921, 0.996, 0.998, 0.9994, 0.99998, 1];
const CUM3 = [0.8279, 0.9973, 0.9973, 1];
function beats(e: Eval, size: 3 | 5): number {
  const cum = size === 5 ? CUM5 : CUM3;
  const lo = e.cat === 0 ? 0 : (cum[e.cat - 1] as number);
  const hi = cum[e.cat] as number;
  const within = ((e.lead[0] as number) - 2) / 12;
  return lo + (hi - lo) * Math.max(0, Math.min(1, within));
}

const KEY5_MAX = encode(8, [14, 13, 12, 11, 10], 5);
const KEY3_MAX = encode(3, [14, 14, 14], 3);

/** Every valid way to set the hand, scored by `score`; returns the best. 72k splits at most. */
export function bestArrangement(hand: readonly Card[], score: (a: { b: Eval; m: Eval; f: Eval }) => number): Arrangement {
  const cards = [...hand].sort((x, y) => x - y);
  const idx = cards.map((_, i) => i);
  const five = subsets(idx, 5).map((ix) => ({ mask: ix.reduce((m, i) => m | (1 << i), 0), cards: ix.map((i) => cards[i] as Card) }));
  const fives = five.map((f) => ({ ...f, ev: eval5(f.cards) }));
  const frontEvals = new Map<number, { cards: Card[]; ev: Eval }>();
  for (const ix of subsets(idx, 3)) {
    const cs = ix.map((i) => cards[i] as Card);
    frontEvals.set(ix.reduce((m, i) => m | (1 << i), 0), { cards: cs, ev: eval3(cs) });
  }
  const full = (1 << cards.length) - 1;
  let best: { s: number; a: Arrangement } | null = null;
  for (const back of fives) {
    for (const mid of fives) {
      if ((back.mask & mid.mask) !== 0 || back.ev.key < mid.ev.key) continue;
      const front = frontEvals.get(full ^ back.mask ^ mid.mask);
      if (!front || !middleCoversFront(mid.ev, front.ev)) continue;
      const s = score({ b: back.ev, m: mid.ev, f: front.ev });
      if (best === null || s > best.s) best = { s, a: { back: back.cards, middle: mid.cards, front: front.cards } };
    }
  }
  if (!best) throw new Error('no valid arrangement'); // cannot happen: sorting any hand into back/middle/front by strength is valid
  return best.a;
}

const ROYALTY_VALUE = 3;

const scoreNormal = ({ b, m, f }: { b: Eval; m: Eval; f: Eval }): number => b.key / KEY5_MAX + 1.1 * (m.key / KEY5_MAX) + f.key / KEY3_MAX;

function scoreHard(rules: PsView, { b, m, f }: { b: Eval; m: Eval; f: Eval }): number {
  // Expected units against a random opponent: each row is worth 2p - 1, plus a bonus for taking the majority,
  // plus the royalties it earns (they are paid whether or not the row wins).
  const wf = 2 * beats(f, 3) - 1;
  const wm = 2 * beats(m, 5) - 1;
  const wb = 2 * beats(b, 5) - 1;
  let v = wf + wm + wb;
  const majority = (beats(f, 3) * beats(m, 5) + beats(f, 3) * beats(b, 5) + beats(m, 5) * beats(b, 5)) * 2 - 1;
  v += 0.6 * majority;
  if (rules.royalties) {
    if (f.cat === CAT.trips) v += ROYALTY_VALUE;
    if (m.cat === CAT.fullHouse) v += 2;
    if (m.cat >= CAT.quads) v += 4;
    if (b.cat >= CAT.quads) v += 4;
  }
  return v;
}

function randomValid(hand: readonly Card[], rng: Rng): Arrangement {
  for (let i = 0; i < 40; i++) {
    const d = shuffle(hand, rng);
    const a: Arrangement = { back: d.slice(0, 5), middle: d.slice(5, 10), front: d.slice(10) };
    const [e1, e2] = [eval5(a.back), eval5(a.middle)];
    const ordered = e1.key >= e2.key ? a : { back: a.middle, middle: a.back, front: a.front };
    if (arrangementProblem(ordered, hand) === null) return ordered;
  }
  return bestArrangement(hand, scoreNormal);
}

function psBot(view: PsView, level: BotLevel, seed: number): PsMove {
  const rng = makeRng(seed);
  const natural = view.eligible[0]; // best value first
  if (natural && (level !== 'easy' || rng() % 2 === 0)) return { t: 'natural', key: natural };
  let a: Arrangement;
  if (level === 'easy') a = randomValid(view.hand, rng);
  else if (level === 'normal') a = rng() % 100 < 25 ? randomValid(view.hand, rng) : bestArrangement(view.hand, scoreNormal);
  else a = bestArrangement(view.hand, (x) => scoreHard(view, x));
  return { t: 'set', ...a };
}

function timeoutMove(view: PsView): PsMove {
  return { t: 'set', ...bestArrangement(view.hand, scoreNormal) };
}

export const pusoyEngine: PlayEngine<PusoySetup, PsState, PsMove, PsView> = {
  start,
  toAct: (s) => (s.done ? null : (pendingOf(s)[0] ?? null)),
  pending: (s) => (s.done ? [] : pendingOf(s)),
  simultaneous: true,
  turnFactor: 6,
  validate,
  apply,
  viewFor,
  result,
  bot: psBot,
  timeoutMove,
};

