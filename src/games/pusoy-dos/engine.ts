/**
 * Pusoy Dos digital play: dealing, turn rules and the computer players. See docs/rules/pusoy-dos.md.
 *
 * Rules implemented (the ones the sources agree on; group variations are not hard-coded):
 * - Ranks low to high 3 4 5 6 7 8 9 10 J Q K A 2; suits low to high clubs, spades, hearts, diamonds.
 * - Each player is dealt `startingHand` cards (13), fewer if the deck cannot cover the table.
 * - The holder of the lowest dealt card (normally the 3 of clubs) leads, and the first play must contain it.
 * - Plays are a single, pair, triple or five-card hand (straight < flush < full house < four + one < straight flush).
 *   A play must have the same size as the lead and beat it. Straights use five ranks in a row without wrapping.
 * - A player may pass unless they are leading. Once you pass you are out of that trick. When everyone else has
 *   passed, the player who made the last play leads again (or, if they went out, the next player in seat order).
 * - Winner-take-all and cards-left end when the first player goes out. "Play until one remains" goes on until
 *   one player is left.
 */
import type { BotLevel, PlayEngine } from '../../core/play';
import { makeRng, shuffle } from '../../core/rng';
import type { Card } from '../cards';
import { rankOf } from '../cards';
import { cardPower, organize, rankPower, sortHand, type PlayKind } from './hand';
import type { PusoyDosInput, PusoyDosSetup } from './index';

export interface Combo {
  size: 1 | 2 | 3 | 5;
  kind: PlayKind;
  /** Comparable with another combo of the same size: bigger beats smaller. */
  rank: number;
}

const TIER: Record<string, number> = { straight: 1, flush: 2, fullHouse: 3, fourPlus: 4, straightFlush: 5 };

/** What a set of cards is as a play, or null if it is not a legal play. */
export function classify(cards: readonly Card[]): Combo | null {
  const n = cards.length;
  if (new Set(cards).size !== n) return null;
  if (n === 1) return { size: 1, kind: 'single', rank: cardPower(cards[0] as Card) };
  const ranks = cards.map(rankPower);
  if (n === 2 || n === 3) {
    if (!ranks.every((r) => r === ranks[0])) return null;
    return n === 2
      ? { size: 2, kind: 'pair', rank: Math.max(...cards.map(cardPower)) }
      : { size: 3, kind: 'triple', rank: (ranks[0] as number) * 4 };
  }
  if (n !== 5) return null;

  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  const sortedPow = cards.map(cardPower).sort((a, b) => b - a);
  const flush = cards.every((c) => Math.floor(c / 13) === Math.floor((cards[0] as number) / 13));
  const distinct = [...count.keys()].sort((a, b) => a - b);
  const straight = distinct.length === 5 && (distinct[4] as number) - (distinct[0] as number) === 4;
  const make = (kind: PlayKind, key: number): Combo => ({ size: 5, kind, rank: (TIER[kind] as number) * 2 ** 30 + key });

  if (straight && flush) return make('straightFlush', sortedPow[0] as number);
  const shape = [...count.values()].sort((a, b) => b - a).join('');
  if (shape === '41') return make('fourPlus', [...count].find(([, v]) => v === 4)?.[0] as number);
  if (shape === '32') return make('fullHouse', [...count].find(([, v]) => v === 3)?.[0] as number);
  if (flush) return make('flush', sortedPow.reduce((acc, p) => acc * 64 + p, 0));
  if (straight) return make('straight', sortedPow[0] as number);
  return null;
}

export interface LegalPlay {
  cards: Card[];
  combo: Combo;
}

function subsets<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const go = (start: number): void => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i] as T);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return out;
}

/** Every play in `hand` that is legal against `lead` (null = leading). */
export function legalPlays(hand: readonly Card[], lead: Combo | null, mustInclude: Card | null): LegalPlay[] {
  const sizes = lead ? [lead.size] : [1, 2, 3, 5];
  const sorted = sortHand(hand);
  const out: LegalPlay[] = [];
  for (const size of sizes) {
    if (sorted.length < size) continue;
    let sets: Card[][];
    if (size === 1) sets = sorted.map((c) => [c]);
    else if (size === 5) sets = subsets(sorted, 5);
    else {
      const byRank = new Map<number, Card[]>();
      for (const c of sorted) byRank.set(rankPower(c), [...(byRank.get(rankPower(c)) ?? []), c]);
      sets = [...byRank.values()].flatMap((g) => (g.length >= size ? subsets(g, size) : []));
    }
    for (const cards of sets) {
      if (lead === null && mustInclude !== null && !cards.includes(mustInclude)) continue;
      const combo = classify(cards);
      if (!combo) continue;
      if (lead && combo.rank <= lead.rank) continue;
      out.push({ cards, combo });
    }
  }
  return out;
}

export type PdMove = { t: 'play'; cards: number[] } | { t: 'pass' };

export interface PdState {
  rules: { scoring: PusoyDosSetup['scoring']; deuce: PusoyDosSetup['deuce'] };
  players: string[];
  hands: Record<string, Card[]>;
  turn: string | null;
  lead: { by: string; cards: Card[] } | null;
  passed: string[];
  out: string[];
  /** Every card played so far this hand (public information). */
  played: Card[];
  mustInclude: Card | null;
  /** The cards of the last play made by the first player out. */
  finalPlay: Card[] | null;
  done: boolean;
}

export interface PdView {
  you: string | null;
  players: string[];
  hand: Card[];
  counts: Record<string, number>;
  turn: string | null;
  lead: { by: string; cards: Card[] } | null;
  passed: string[];
  out: string[];
  played: Card[];
  mustInclude: Card | null;
  done: boolean;
  scoring: PusoyDosSetup['scoring'];
  /** Only once the hand is over. */
  hands?: Record<string, Card[]>;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

function start(setup: PusoyDosSetup, players: readonly string[], seed: number): PdState {
  const rng = makeRng(seed);
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const size = Math.min(setup.startingHand, Math.floor(52 / players.length));
  const hands: Record<string, Card[]> = {};
  players.forEach((id, i) => {
    hands[id] = sortHand(deck.slice(i * size, (i + 1) * size));
  });
  const all = players.flatMap((id) => hands[id] as Card[]);
  const lowest = all.reduce((a, b) => (cardPower(b) < cardPower(a) ? b : a));
  const first = players.find((id) => (hands[id] as Card[]).includes(lowest)) as string;
  return {
    rules: { scoring: setup.scoring, deuce: setup.deuce },
    players: [...players],
    hands,
    turn: first,
    lead: null,
    passed: [],
    out: [],
    played: [],
    mustInclude: lowest,
    finalPlay: null,
    done: false,
  };
}

function validate(state: PdState, pid: string, raw: unknown): string[] {
  if (state.done) return ['this hand is over'];
  if (state.turn !== pid) return ['it is not your turn'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['bad move'];
  const move = raw as Record<string, unknown>;
  if (move.t === 'pass') return state.lead === null ? ['you must lead, you cannot pass'] : [];
  if (move.t !== 'play' || !Array.isArray(move.cards)) return ['bad move'];
  const cards = move.cards as unknown[];
  if (!cards.every((c) => isInt(c) && c >= 0 && c < 52)) return ['unknown card'];
  const play = cards as number[];
  const hand = state.hands[pid] as Card[];
  if (new Set(play).size !== play.length) return ['a card was repeated'];
  if (!play.every((c) => hand.includes(c))) return ['you do not hold those cards'];
  const combo = classify(play);
  if (!combo) return ['those cards are not a legal play'];
  if (state.lead === null) {
    if (state.mustInclude !== null && !play.includes(state.mustInclude)) return ['the first play must include the lowest card'];
    return [];
  }
  const target = classify(state.lead.cards) as Combo;
  if (combo.size !== target.size) return [`play ${target.size} card(s) to match the lead, or pass`];
  if (combo.rank <= target.rank) return ['that does not beat the cards on the table'];
  return [];
}

function nextActive(state: PdState, from: string, skip: (id: string) => boolean): string | null {
  const n = state.players.length;
  const start = state.players.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const id = state.players[(start + k) % n] as string;
    if (!state.out.includes(id) && !skip(id)) return id;
  }
  return null;
}

function apply(state: PdState, pid: string, move: PdMove): PdState {
  const s: PdState = {
    ...state,
    hands: { ...state.hands },
    passed: [...state.passed],
    out: [...state.out],
    played: [...state.played],
  };
  if (move.t === 'pass') {
    s.passed.push(pid);
  } else {
    const cards = move.cards;
    s.hands[pid] = (state.hands[pid] as Card[]).filter((c) => !cards.includes(c));
    s.played.push(...cards);
    s.lead = { by: pid, cards: sortHand(cards) };
    // Players who passed stay out until this trick is won, so `passed` is NOT cleared here.
    s.mustInclude = null;
    if ((s.hands[pid] as Card[]).length === 0) {
      s.out.push(pid);
      if (s.out.length === 1) s.finalPlay = s.lead.cards;
    }
  }

  const active = s.players.filter((id) => !s.out.includes(id));
  const ends = s.rules.scoring === 'placement' ? active.length <= 1 : s.out.length >= 1;
  if (ends) {
    if (s.rules.scoring === 'placement') s.out.push(...active);
    s.done = true;
    s.turn = null;
    return s;
  }

  // Everyone still in has passed against the last play: that trick is over.
  const stillIn = active.filter((id) => id !== s.lead?.by && !s.passed.includes(id));
  if (s.lead && stillIn.length === 0) {
    const leader = s.out.includes(s.lead.by) ? nextActive(s, s.lead.by, () => false) : s.lead.by;
    s.lead = null;
    s.passed = [];
    s.turn = leader;
    return s;
  }
  s.turn = nextActive(s, pid, (id) => s.passed.includes(id));
  return s;
}

function viewFor(state: PdState, pid: string | null): PdView {
  const counts: Record<string, number> = {};
  for (const id of state.players) counts[id] = (state.hands[id] as Card[]).length;
  const view: PdView = {
    you: pid,
    players: state.players,
    hand: pid && state.hands[pid] ? sortHand(state.hands[pid] as Card[]) : [],
    counts,
    turn: state.turn,
    lead: state.lead,
    passed: state.passed,
    out: state.out,
    played: state.played,
    mustInclude: state.mustInclude,
    done: state.done,
    scoring: state.rules.scoring,
  };
  if (state.done) view.hands = state.hands;
  return view;
}

function result(state: PdState): Record<string, unknown> | null {
  if (!state.done) return null;
  if (state.rules.scoring === 'placement') return { order: [...state.out] };
  const winner = state.out[0] as string;
  const input: Partial<PusoyDosInput> & { winner: string } = { winner };
  if (state.rules.deuce !== 'off') {
    const twos = (state.finalPlay ?? []).filter((c) => rankOf(c) === 2).length;
    if (twos > 0) input.deuces = Math.min(4, twos);
  }
  if (state.rules.scoring === 'cards-left') {
    const left: Record<string, number> = {};
    for (const id of state.players) if (id !== winner) left[id] = (state.hands[id] as Card[]).length;
    input.cardsLeft = left;
  }
  return input;
}

// ---------------------------------------------------------------- computer players

const rankCounts = (cards: readonly Card[]): Map<number, number> => {
  const m = new Map<number, number>();
  for (const c of cards) m.set(rankPower(c), (m.get(rankPower(c)) ?? 0) + 1);
  return m;
};

/** How many sets (pairs, triples, ...) in `hand` this play would split. */
function breaks(play: LegalPlay, hand: readonly Card[]): number {
  const have = rankCounts(hand);
  const used = rankCounts(play.cards);
  let n = 0;
  for (const [r, k] of used) if ((have.get(r) ?? 0) > k && (have.get(r) ?? 0) >= 2) n++;
  return n;
}

const twosIn = (cards: readonly Card[]): number => cards.filter((c) => rankPower(c) === 15).length;

/** True if no card still unseen (not in my hand, not yet played) can beat this card. */
function unbeatable(card: Card, view: PdView): boolean {
  const seen = new Set<number>([...view.hand, ...view.played]);
  for (let c = 0; c < 52; c++) if (!seen.has(c) && cardPower(c) > cardPower(card)) return false;
  return true;
}

function pdBot(view: PdView, level: BotLevel, seed: number): PdMove {
  const rng = makeRng(seed);
  const lead = view.lead ? classify(view.lead.cards) : null;
  const legal = legalPlays(view.hand, lead, view.mustInclude);
  const canPass = view.lead !== null;
  const play = (p: LegalPlay): PdMove => ({ t: 'play', cards: p.cards });
  if (legal.length === 0) return { t: 'pass' };

  const out = legal.find((p) => p.cards.length === view.hand.length);
  if (out) return play(out);

  if (level === 'easy') {
    if (canPass && rng() % 10 < 3) return { t: 'pass' };
    return play(legal[rng() % legal.length] as LegalPlay);
  }

  const opponents = view.players.filter((id) => id !== view.you && !view.out.includes(id));
  const minOpp = Math.min(...opponents.map((id) => view.counts[id] as number));
  const urgent = minOpp <= 2;
  const leading = !canPass;

  let pool = legal;
  if (level === 'hard') {
    // Someone is one card from going out: never hand them an easy single, and block them when we can.
    if (minOpp === 1) {
      if (leading) {
        const notSingle = legal.filter((p) => p.cards.length > 1 || unbeatable(p.cards[0] as Card, view));
        if (notSingle.length > 0) pool = notSingle;
      } else if (view.lead && view.lead.cards.length === 1) {
        const best = legal.reduce((a, b) => (b.combo.rank > a.combo.rank ? b : a));
        return play(best);
      }
    }
  }

  if (level === 'hard') return hardChoice(view, pool, legal, canPass, urgent, leading);

  // Normal is sensible but a little careless: now and then it just plays any legal card.
  if (rng() % 100 < 25) {
    if (canPass && rng() % 10 < 2) return { t: 'pass' };
    return play(legal[rng() % legal.length] as LegalPlay);
  }

  const score = (p: LegalPlay): number => {
    let c = breaks(p, view.hand) * 100;
    if (!urgent && view.hand.length > 3) c += twosIn(p.cards) * 60;
    c += Math.max(...p.cards.map(cardPower)) * (leading ? 1 : 2);
    if (leading) c -= p.cards.length * 12;
    return c;
  };
  const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a));

  if (canPass && !urgent && view.hand.length > 3) {
    // Do not burn a 2 (or split a set) just to win a small trick.
    if (twosIn(best.cards) > 0) return { t: 'pass' };
  }
  return play(best);
}

/**
 * Hard: plan the whole hand. `organize` finds the fewest plays that use every card; a good move uses up a whole
 * group of that plan. Leading starts with the weakest group (keeping control for the strong ones); following
 * only plays when it does not break the plan, or when someone is about to go out. It also counts the cards
 * already played to know which of its cards can no longer be beaten.
 */
function hardChoice(view: PdView, pool: LegalPlay[], legal: LegalPlay[], canPass: boolean, urgent: boolean, leading: boolean): PdMove {
  const play = (p: LegalPlay): PdMove => ({ t: 'play', cards: p.cards });
  const planLen = (cards: readonly Card[]): number => organize(cards).plays.length;
  const cur = planLen(view.hand);
  const scored = pool.map((p) => {
    const rest = view.hand.filter((c) => !p.cards.includes(c));
    const after = planLen(rest);
    let score = (after - cur) * 1000 + Math.max(...p.cards.map(cardPower)) * (leading ? 1 : 3);
    if (leading) score -= p.cards.length * 4;
    if (!urgent && view.hand.length > 3) score += twosIn(p.cards) * 150;
    if (leading && cur <= 3 && p.cards.length === 1 && unbeatable(p.cards[0] as Card, view)) score -= 60;
    return { p, after, score };
  });
  const best = scored.reduce((a, b) => (b.score < a.score ? b : a));
  if (canPass && !urgent && view.hand.length > 3 && best.after >= cur) return { t: 'pass' };
  void legal;
  return play(best.p);
}

/**
 * Why these cards cannot be played right now (for the play screen's button), or null if they can.
 * Mirrors `validate`, but from a player's own view.
 */
export function playProblem(view: PdView, cards: readonly Card[]): 'notPlay' | 'cannotBeat' | 'mustInclude' | null {
  const combo = classify(cards);
  if (!combo) return 'notPlay';
  if (view.lead === null) return view.mustInclude !== null && !cards.includes(view.mustInclude) ? 'mustInclude' : null;
  const target = classify(view.lead.cards) as Combo;
  return combo.size !== target.size || combo.rank <= target.rank ? 'cannotBeat' : null;
}

function timeoutMove(view: PdView): PdMove {
  if (view.lead !== null) return { t: 'pass' };
  const first = view.mustInclude ?? (sortHand(view.hand)[0] as Card);
  return { t: 'play', cards: [first] };
}

export const pusoyDosEngine: PlayEngine<PusoyDosSetup, PdState, PdMove, PdView> = {
  start,
  toAct: (s) => s.turn,
  validate,
  apply,
  viewFor,
  result,
  bot: pdBot,
  timeoutMove,
};
