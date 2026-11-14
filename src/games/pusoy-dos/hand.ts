/**
 * Pusoy Dos hand organizer. Given the cards in your own hand it finds the fewest plays that use every card,
 * so you can see how many turns you need to go out. Pure; it runs on the player's own phone and the hand is
 * never sent anywhere.
 *
 * Order of play (docs/rules/pusoy-dos.md): ranks low to high 3 4 5 6 7 8 9 10 J Q K A 2, and the Philippine
 * suit order low to high clubs, spades, hearts, diamonds. Plays: single, pair, triple, or a five-card hand
 * (straight, flush, full house, four of a kind plus a card, straight flush). Straight rules differ between
 * tables; the helper uses five ranks in a row in the order above without wrapping (J-Q-K-A-2 counts).
 */
import type { Card } from '../cards';
import { rankOf, suitOf } from '../cards';

export type PlayKind = 'single' | 'pair' | 'triple' | 'straight' | 'flush' | 'fullHouse' | 'fourPlus' | 'straightFlush';

export interface Play {
  kind: PlayKind;
  cards: Card[];
  /** Strength of the play's main card, for ordering from weakest to strongest. */
  power: number;
}

export interface Plan {
  plays: Play[];
}

export const MAX_HAND = 17;

/** 3 = 3 ... K = 13, A = 14, 2 = 15. */
export const rankPower = (c: Card): number => ((rankOf(c) + 10) % 13) + 3;
/** Philippine suit strength: clubs 0, spades 1, hearts 2, diamonds 3. Card suits are S H D C. */
const SUIT_POWER = [1, 2, 3, 0];
export const suitPower = (c: Card): number => SUIT_POWER[suitOf(c)] as number;
/** One number per card, bigger beats smaller. */
export const cardPower = (c: Card): number => rankPower(c) * 4 + suitPower(c);

export const sortHand = (cards: readonly Card[]): Card[] => [...cards].sort((a, b) => cardPower(a) - cardPower(b));

export function validateHand(cards: readonly Card[]): string[] {
  const problems: string[] = [];
  if (cards.length > MAX_HAND) problems.push(`a hand has at most ${MAX_HAND} cards`);
  if (!cards.every((c) => Number.isInteger(c) && c >= 0 && c <= 51)) problems.push('cards must be 0 to 51');
  if (new Set(cards).size !== cards.length) problems.push('a card appears twice');
  return problems;
}

interface Candidate {
  mask: number;
  play: Play;
}

function subsets<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const go = (from: number) => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = from; i < items.length; i++) {
      pick.push(items[i] as T);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return out;
}

function candidates(cards: readonly Card[]): Candidate[] {
  const idx = new Map(cards.map((c, i) => [c, i] as const));
  const out: Candidate[] = [];
  const add = (kind: PlayKind, cs: Card[]) => {
    const sorted = sortHand(cs);
    const mask = sorted.reduce((m, c) => m | (1 << (idx.get(c) as number)), 0);
    out.push({ mask, play: { kind, cards: sorted, power: playPower(kind, sorted) } });
  };

  const byRank = new Map<number, Card[]>();
  for (const c of cards) byRank.set(rankPower(c), [...(byRank.get(rankPower(c)) ?? []), c]);

  for (const c of cards) add('single', [c]);
  for (const same of byRank.values()) {
    if (same.length >= 2) for (const s of subsets(same, 2)) add('pair', s);
    if (same.length >= 3) for (const s of subsets(same, 3)) add('triple', s);
    if (same.length === 4) {
      for (const k of cards) if (rankPower(k) !== rankPower(same[0] as Card)) add('fourPlus', [...same, k]);
    }
  }
  // full house: a triple plus a pair of another rank
  for (const [r3, three] of byRank) {
    if (three.length < 3) continue;
    for (const [r2, two] of byRank) {
      if (r2 === r3 || two.length < 2) continue;
      for (const t of subsets(three, 3)) for (const p of subsets(two, 2)) add('fullHouse', [...t, ...p]);
    }
  }
  // straights and straight flushes: five ranks in a row
  for (let low = 3; low <= 11; low++) {
    const lists: Card[][] = [];
    for (let r = low; r < low + 5; r++) {
      const here = byRank.get(r);
      if (!here) break;
      lists.push(here);
    }
    if (lists.length < 5) continue;
    const walk = (i: number, chosen: Card[]) => {
      if (i === 5) {
        add(chosen.every((c) => suitOf(c) === suitOf(chosen[0] as Card)) ? 'straightFlush' : 'straight', chosen);
        return;
      }
      for (const c of lists[i] as Card[]) walk(i + 1, [...chosen, c]);
    };
    walk(0, []);
  }
  // flushes: any five of one suit that are not already a straight (those are listed as straight flushes)
  for (let s = 0; s < 4; s++) {
    const suited = cards.filter((c) => suitOf(c) === s);
    if (suited.length < 5) continue;
    for (const five of subsets(suited, 5)) {
      const ranks = five.map(rankPower).sort((a, b) => a - b);
      const isStraight = ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1);
      if (!isStraight) add('flush', five);
    }
  }
  return out;
}

const FIVE_CARD_ORDER: Partial<Record<PlayKind, number>> = { straight: 1, flush: 2, fullHouse: 3, fourPlus: 4, straightFlush: 5 };

/**
 * Orders plays weakest to strongest: singles, pairs and triples by their top card, then the five-card hands by
 * kind (straight, flush, full house, four plus one, straight flush) and, within a kind, by the deciding card
 * (the triple of a full house, the four of a kind, otherwise the top card).
 */
function playPower(kind: PlayKind, sorted: readonly Card[]): number {
  const top = cardPower(sorted[sorted.length - 1] as Card);
  const order = FIVE_CARD_ORDER[kind];
  if (!order) return top;
  const count = (c: Card) => sorted.filter((x) => rankPower(x) === rankPower(c)).length;
  const main = kind === 'fullHouse' ? sorted.filter((c) => count(c) === 3) : kind === 'fourPlus' ? sorted.filter((c) => count(c) === 4) : sorted;
  return order * 1000 + cardPower(main[main.length - 1] as Card);
}

const PLAY_COST = 10;
const SINGLE_EXTRA = 1; // between plans with the same number of plays, prefer the one with fewer lonely singles

/**
 * The fewest plays that use every card (ties broken toward fewer single cards). Plays are listed from
 * weakest to strongest, which is also a sensible order to lead them in. If a hand is so unusual that the
 * search exceeds its work budget, singles and pairs are returned instead of a worse guess.
 */
export function organize(cards: readonly Card[]): Plan {
  if (validateHand(cards).length > 0 || cards.length === 0) return { plays: [] };
  const hand = sortHand(cards);
  const cand = candidates(hand);
  const byLowest: Candidate[][] = hand.map(() => []);
  for (const c of cand) byLowest[31 - Math.clz32(c.mask & -c.mask)]!.push(c);

  const memo = new Map<number, { cost: number; pick: Candidate | null }>();
  let work = 0;
  const BUDGET = 4_000_000;
  const solve = (mask: number): number => {
    if (mask === 0) return 0;
    const seen = memo.get(mask);
    if (seen) return seen.cost;
    const low = 31 - Math.clz32(mask & -mask);
    let best = Infinity;
    let pick: Candidate | null = null;
    for (const c of byLowest[low] as Candidate[]) {
      if ((c.mask & mask) !== c.mask) continue;
      work++;
      if (work > BUDGET) break;
      const cost = PLAY_COST + (c.play.kind === 'single' ? SINGLE_EXTRA : 0) + solve(mask & ~c.mask);
      if (cost < best) {
        best = cost;
        pick = c;
      }
    }
    memo.set(mask, { cost: best, pick });
    return best;
  };

  const full = (1 << hand.length) - 1;
  solve(full);
  if (work > BUDGET) return { plays: fallback(hand) };

  const plays: Play[] = [];
  let mask = full;
  while (mask !== 0) {
    const pick = memo.get(mask)?.pick;
    if (!pick) return { plays: fallback(hand) };
    plays.push(pick.play);
    mask &= ~pick.mask;
  }
  plays.sort((a, b) => a.power - b.power);
  return { plays };
}

function fallback(hand: readonly Card[]): Play[] {
  const plays: Play[] = [];
  let i = 0;
  while (i < hand.length) {
    const c = hand[i] as Card;
    const n = hand[i + 1] !== undefined && rankPower(hand[i + 1] as Card) === rankPower(c) ? 2 : 1;
    const cs = hand.slice(i, i + n);
    plays.push({ kind: n === 2 ? 'pair' : 'single', cards: [...cs], power: cardPower(cs[cs.length - 1] as Card) });
    i += n;
  }
  return plays;
}

/** How many 2s are in the hand (a last play that includes 2s can double the round when the deuce option is on). */
export const countDeuces = (cards: readonly Card[]): number => cards.filter((c) => rankOf(c) === 2).length;
