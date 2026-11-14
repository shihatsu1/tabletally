/**
 * Tong-its hand organizer. Given the cards in your own hand it finds the best way to group them into
 * melds, so the cards left over (deadwood) are worth as few points as possible. It is pure and runs on
 * the player's own phone: the hand is never sent anywhere.
 *
 * Cards are numbers 0..51: suit * 13 + (rank - 1), suits S H D C, ranks A=1 .. K=13.
 * Melds follow docs/rules/tong-its.md: a set is 3 or 4 cards of one rank; a run is 3 or more
 * consecutive cards of one suit, with the ace low only (A-2-3 is a run, Q-K-A is not).
 * Card points: A = 1, 2 to 10 face value, J, Q, K = 10.
 */
import { RANK_LABELS, SUITS, cardLabel, makeCard, rankOf, suitOf, type Card } from '../cards';

export { RANK_LABELS, SUITS, cardLabel, makeCard, rankOf, suitOf };
export type { Card };

export const pointsOf = (c: Card): number => Math.min(rankOf(c), 10);

export interface Meld {
  kind: 'set' | 'run';
  cards: Card[];
}

export interface Arrangement {
  melds: Meld[];
  deadwood: Card[];
  /** Points of the cards left over. Lower is better; 0 means every card is in a meld. */
  points: number;
}

export const MAX_HAND = 14;

/** Problems with a hand: duplicates, out-of-range cards, or too many. */
export function validateHand(cards: readonly Card[]): string[] {
  const problems: string[] = [];
  if (cards.length > MAX_HAND) problems.push(`a hand has at most ${MAX_HAND} cards`);
  if (!cards.every((c) => Number.isInteger(c) && c >= 0 && c <= 51)) problems.push('cards must be 0 to 51');
  if (new Set(cards).size !== cards.length) problems.push('a card appears twice');
  return problems;
}

interface Candidate {
  mask: number;
  meld: Meld;
}

function candidates(cards: readonly Card[]): Candidate[] {
  const out: Candidate[] = [];
  const idx = new Map(cards.map((c, i) => [c, i] as const));
  const bit = (c: Card) => 1 << (idx.get(c) as number);

  // sets
  for (let rank = 1; rank <= 13; rank++) {
    const same = cards.filter((c) => rankOf(c) === rank);
    if (same.length < 3) continue;
    const n = same.length;
    for (let sub = 1; sub < 1 << n; sub++) {
      const pick = same.filter((_, i) => sub & (1 << i));
      if (pick.length < 3 || pick.length > 4) continue;
      out.push({ mask: pick.reduce((m, c) => m | bit(c), 0), meld: { kind: 'set', cards: pick } });
    }
  }
  // runs: every segment of length 3+ inside each maximal stretch of consecutive ranks in a suit
  for (let suit = 0; suit < 4; suit++) {
    const ranks = cards.filter((c) => suitOf(c) === suit).map(rankOf).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++) {
      for (let j = i + 2; j < ranks.length; j++) {
        if ((ranks[j] as number) - (ranks[i] as number) !== j - i) break; // not consecutive any more
        const pick = ranks.slice(i, j + 1).map((r) => makeCard(suit, r));
        out.push({ mask: pick.reduce((m, c) => m | bit(c), 0), meld: { kind: 'run', cards: pick } });
      }
    }
  }
  return out;
}

class Solver {
  readonly cards: readonly Card[];
  readonly cand: Candidate[];
  private readonly byLowBit: Map<number, Candidate[]> = new Map();
  private readonly memo = new Map<number, number>();

  constructor(cards: readonly Card[]) {
    this.cards = cards;
    this.cand = candidates(cards);
    for (const c of this.cand) {
      const low = c.mask & -c.mask;
      const list = this.byLowBit.get(low) ?? [];
      list.push(c);
      this.byLowBit.set(low, list);
    }
  }

  /** Smallest deadwood points for the cards in `mask`. */
  best(mask: number): number {
    if (mask === 0) return 0;
    const hit = this.memo.get(mask);
    if (hit !== undefined) return hit;
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    let result = pointsOf(this.cards[i] as Card) + this.best(mask ^ low);
    for (const c of this.byLowBit.get(low) ?? []) {
      if ((c.mask & mask) === c.mask) result = Math.min(result, this.best(mask ^ c.mask));
    }
    this.memo.set(mask, result);
    return result;
  }

  /** Every arrangement whose deadwood is within `slack` points of the best, capped at `cap`. */
  enumerate(slack: number, cap: number): Arrangement[] {
    const full = (1 << this.cards.length) - 1;
    const limit = this.best(full) + slack;
    const found: Arrangement[] = [];
    const walk = (mask: number, melds: Meld[], dead: Card[], deadPoints: number): void => {
      if (found.length >= cap) return;
      if (mask === 0) {
        found.push({ melds: [...melds], deadwood: [...dead], points: deadPoints });
        return;
      }
      const low = mask & -mask;
      const i = 31 - Math.clz32(low);
      const card = this.cards[i] as Card;
      // leave the lowest card as deadwood
      const pts = deadPoints + pointsOf(card);
      if (pts + this.best(mask ^ low) <= limit) walk(mask ^ low, melds, [...dead, card], pts);
      // or put it in a meld
      for (const c of this.byLowBit.get(low) ?? []) {
        if ((c.mask & mask) !== c.mask) continue;
        if (deadPoints + this.best(mask ^ c.mask) <= limit) walk(mask ^ c.mask, [...melds, c.meld], dead, deadPoints);
      }
    };
    walk(full, [], [], 0);
    return found;
  }
}

/** The fewest deadwood points any arrangement of these cards can reach. */
export function bestDeadwood(cards: readonly Card[]): number {
  if (validateHand(cards).length > 0) throw new RangeError('invalid hand');
  return new Solver(cards).best((1 << cards.length) - 1);
}

const canonical = (a: Arrangement): string =>
  a.melds
    .map((m) => [...m.cards].sort((x, y) => x - y).join('.'))
    .sort()
    .join('|');

/**
 * The best few arrangements, best first. Arrangements that differ only in how the same cards are
 * labelled are not repeated. Within equal deadwood, more melds come first.
 */
export function organize(cards: readonly Card[], howMany = 3): Arrangement[] {
  if (validateHand(cards).length > 0) throw new RangeError('invalid hand');
  if (cards.length === 0) return [{ melds: [], deadwood: [], points: 0 }];
  const sorted = [...cards].sort((a, b) => a - b);
  const solver = new Solver(sorted);
  const all = solver.enumerate(6, 800);
  const seen = new Set<string>();
  const unique = all.filter((a) => {
    const key = canonical(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.points - b.points || b.melds.length - a.melds.length || a.deadwood.length - b.deadwood.length);
  return unique.slice(0, howMany);
}

/** True when every card is in a meld (the hand can call Tong-its). */
export const isTongIts = (cards: readonly Card[]): boolean => cards.length > 0 && bestDeadwood(cards) === 0;

export const countAces = (cards: readonly Card[]): number => cards.filter((c) => rankOf(c) === 1).length;

/** Sets of four in an arrangement: each is a "secret" when kept hidden (see the rules doc). */
export const secretSets = (a: Arrangement): number => a.melds.filter((m) => m.kind === 'set' && m.cards.length === 4).length;

export interface Advice {
  card: Card;
  /** Deadwood points left after the move. */
  deadwoodAfter: number;
}

/**
 * Which card to throw away. Works on a hand with one card too many (you just drew). Best moves first:
 * lowest deadwood left, and among equals the card worth the most points.
 */
export function discardAdvice(cards: readonly Card[], howMany = 3): Advice[] {
  if (validateHand(cards).length > 0) throw new RangeError('invalid hand');
  const out = cards.map((card) => ({ card, deadwoodAfter: bestDeadwood(cards.filter((c) => c !== card)) }));
  out.sort((a, b) => a.deadwoodAfter - b.deadwoodAfter || pointsOf(b.card) - pointsOf(a.card) || a.card - b.card);
  return out.slice(0, howMany);
}

/**
 * Cards that would help if you drew them: for each card not in your hand, the deadwood you could reach
 * after drawing it and discarding the best card. Only cards that improve on today's hand are returned,
 * best first. It cannot know which cards other players hold, so it lists every card that would help.
 */
export function drawAdvice(cards: readonly Card[]): Advice[] {
  if (validateHand(cards).length > 0 || cards.length >= MAX_HAND) throw new RangeError('invalid hand');
  const before = bestDeadwood(cards);
  const out: Advice[] = [];
  for (let card = 0; card < 52; card++) {
    if (cards.includes(card)) continue;
    const withCard = [...cards, card];
    let after = Infinity;
    for (const drop of withCard) after = Math.min(after, bestDeadwood(withCard.filter((c) => c !== drop)));
    if (after < before) out.push({ card, deadwoodAfter: after });
  }
  out.sort((a, b) => a.deadwoodAfter - b.deadwoodAfter || a.card - b.card);
  return out;
}
