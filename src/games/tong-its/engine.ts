/**
 * Tong-its digital play: dealing, turn rules, hand endings and the computer players.
 * See docs/rules/tong-its.md (Digital play section) for the rules chosen where sources disagree.
 *
 * - 3 players, 52 cards. The dealer gets 13 and opens by discarding; the others get 12. The rest is the stock.
 * - A turn: draw from the stock, or take the top discard if it makes a meld with your hand (you must show that
 *   meld at once). Then you may show melds (sets of 3-4 of a rank, runs of 3+ in one suit, ace low) and lay off
 *   cards onto any shown meld (sapaw). Then discard. A four-of-a-kind can be shown face down as a secret.
 * - At the start of your turn, if you have shown a meld, you may call Draw (a fight): the others fold, or the
 *   ones who have shown a meld may challenge. Lowest hand total wins; a tie goes to the challenger.
 * - Using every card (melds, lay-offs, last discard) ends the hand: Tong-its.
 * - When the last stock card has been drawn and that player has discarded, the hand ends: lowest total among
 *   players who have shown a meld wins.
 * - Players who never showed a meld are burned.
 */
import type { BotLevel, PlayEngine } from '../../core/play';
import { makeRng, rngFrom, shuffle, type Rng } from '../../core/rng';
import type { Card } from '../cards';
import { rankOf, suitOf } from '../cards';
import { bestDeadwood, discardAdvice, organize, pointsOf } from './hand';
import type { Ending, TongItsInput, TongItsSetup } from './index';
import { isInt } from '../../core/check';

// ------------------------------------------------------------------ melds

export type MeldKind = 'set' | 'run';

/** What these cards are as a meld, or null. */
export function meldKind(cards: readonly Card[]): MeldKind | null {
  const n = cards.length;
  if (n < 3 || new Set(cards).size !== n) return null;
  const rank = rankOf(cards[0] as Card);
  if (n <= 4 && cards.every((c) => rankOf(c) === rank)) return 'set';
  const suit = suitOf(cards[0] as Card);
  if (!cards.every((c) => suitOf(c) === suit)) return null;
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1) ? 'run' : null;
}

/** Can `card` be laid off onto a meld of these cards? */
export function canSapaw(kind: MeldKind, meld: readonly Card[], card: Card): boolean {
  if (meld.includes(card)) return false;
  if (kind === 'set') return meld.length === 3 && rankOf(card) === rankOf(meld[0] as Card);
  if (suitOf(card) !== suitOf(meld[0] as Card)) return false;
  const ranks = meld.map(rankOf);
  const r = rankOf(card);
  return r === Math.min(...ranks) - 1 || r === Math.max(...ranks) + 1;
}

/** Every meld you could show from `hand` that contains `card` (card may or may not be in `hand`). */
export function meldsContaining(hand: readonly Card[], card: Card): Card[][] {
  const others = hand.filter((c) => c !== card);
  const out: Card[][] = [];
  const same = others.filter((c) => rankOf(c) === rankOf(card));
  if (same.length >= 2) {
    out.push([card, ...same.slice(0, 2)]);
    if (same.length >= 3) out.push([card, ...same.slice(0, 3)]);
    if (same.length >= 3) for (let skip = 0; skip < 3; skip++) out.push([card, ...same.filter((_, i) => i !== skip)]);
  }
  const suit = suitOf(card);
  const have = new Set(others.filter((c) => suitOf(c) === suit).map(rankOf));
  have.add(rankOf(card));
  const r = rankOf(card);
  for (let lo = r; lo >= 1 && have.has(lo); lo--) {
    for (let hi = r; hi <= 13 && have.has(hi); hi++) {
      if (hi - lo + 1 < 3) continue;
      out.push(Array.from({ length: hi - lo + 1 }, (_, i) => lo * 1 + i).map((rank) => suit * 13 + rank - 1));
    }
  }
  return out;
}

export const handPoints = (cards: readonly Card[]): number => bestDeadwood(cards);

// ------------------------------------------------------------------ state

export interface TiMeld {
  id: number;
  owner: string;
  kind: MeldKind;
  cards: Card[];
  /** A four-of-a-kind shown face down. Others see only that it exists. */
  hidden: boolean;
}

export type Phase = 'draw' | 'play' | 'fight' | 'over';

export interface TiState {
  players: string[];
  hands: Record<string, Card[]>;
  /** Top of the stock is the LAST element. */
  stock: Card[];
  /** Top of the pile is the LAST element. */
  discards: Card[];
  melds: TiMeld[];
  nextMeld: number;
  turn: string;
  phase: Phase;
  drew: 'stock' | 'discard' | null;
  drawnCard: Card | null;
  /** A card taken from the discard pile that must be shown in a meld before you may discard. */
  mustMeld: Card | null;
  firstTurn: boolean;
  stockOut: boolean;
  fight: { caller: string; replies: Record<string, 'fold' | 'challenge'> } | null;
  sagasa: Record<string, number>;
  /**
   * Players an opponent has laid a card off onto (sapaw): they may not call Draw on their next turn. Cleared when
   * that player's turn ends. Optional so hands saved before this rule still load.
   */
  drawBlocked?: string[];
  end: { winner: string; ending: Ending } | null;
}

export type TiMove =
  | { t: 'draw'; from: 'stock' | 'discard' }
  | { t: 'meld'; cards: number[]; hidden?: boolean }
  | { t: 'sapaw'; meld: number; card: number }
  | { t: 'discard'; card: number }
  | { t: 'fight' }
  | { t: 'respond'; challenge: boolean };

export interface TiMeldView {
  id: number;
  owner: string;
  kind: MeldKind;
  /** Empty for someone else's face-down meld until the hand is over. */
  cards: Card[];
  hidden: boolean;
  size: number;
}

export interface TiView {
  you: string | null;
  players: string[];
  hand: Card[];
  counts: Record<string, number>;
  turn: string;
  phase: Phase;
  /** Who must act now (the caller's turn, or the next player who has to answer a fight). */
  toAct: string | null;
  drew: 'stock' | 'discard' | null;
  drawnCard: Card | null;
  mustMeld: Card | null;
  firstTurn: boolean;
  stockCount: number;
  discards: Card[];
  melds: TiMeldView[];
  /** Players who have shown at least one meld. */
  opened: string[];
  fight: { caller: string; replies: Record<string, 'fold' | 'challenge'> } | null;
  sagasa: Record<string, number>;
  /** Players who may not call Draw on their next turn, because an opponent laid off onto their meld. */
  drawBlocked: string[];
  done: boolean;
  end: { winner: string; ending: Ending } | null;
  /** Only once the hand is over. */
  hands?: Record<string, Card[]>;
}

const without = (cards: readonly Card[], drop: readonly Card[]): Card[] => cards.filter((c) => !drop.includes(c));
const openedBy = (s: Pick<TiState, 'melds'>, id: string): boolean => s.melds.some((m) => m.owner === id);

/** Who must act now: the player on turn, or the next opened player who still has to answer a fight. */
function actor(s: TiState): string | null {
  if (s.phase === 'over') return null;
  if (s.phase === 'fight' && s.fight) return pendingResponder(s);
  return s.turn;
}

function pendingResponder(s: TiState): string | null {
  const fight = s.fight;
  if (!fight) return null;
  const i = s.players.indexOf(fight.caller);
  for (let k = 1; k < s.players.length; k++) {
    const id = s.players[(i + k) % s.players.length] as string;
    if (openedBy(s, id) && fight.replies[id] === undefined) return id;
  }
  return null;
}

function start(_setup: TongItsSetup, players: readonly string[], seed: number | Rng): TiState {
  const rng = rngFrom(seed);
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
  const dealer = players[(rng() >>> 0) % players.length] as string;
  const hands: Record<string, Card[]> = {};
  let at = 0;
  for (const id of players) {
    const n = id === dealer ? 13 : 12;
    hands[id] = deck.slice(at, at + n).sort((a, b) => a - b);
    at += n;
  }
  const dealt: TiState = {
    players: [...players],
    hands,
    stock: deck.slice(at),
    discards: [],
    melds: [],
    nextMeld: 1,
    turn: dealer,
    phase: 'play',
    drew: null,
    drawnCard: null,
    mustMeld: null,
    firstTurn: true,
    stockOut: false,
    fight: null,
    sagasa: Object.fromEntries(players.map((id) => [id, 0])),
    drawBlocked: [],
    end: null,
  };
  // the dealer opens with 13 cards; if they already count 0 points, that is a Tong-its straight away
  return zeroPoints(hands[dealer] as Card[]) ? finish(dealt, dealer, 'tongits') : dealt;
}

function validate(s: TiState, pid: string, raw: unknown): string[] {
  if (s.phase === 'over') return ['this hand is over'];
  if (actor(s) !== pid) return ['it is not your turn'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return ['bad move'];
  const m = raw as Record<string, unknown>;
  const hand = s.hands[pid] as Card[];
  const cardOk = (c: unknown): c is number => isInt(c) && c >= 0 && c < 52;

  switch (m.t) {
    case 'draw': {
      if (s.phase !== 'draw') return ['you have already drawn'];
      if (m.from === 'stock') return s.stock.length > 0 ? [] : ['the stock is empty'];
      if (m.from === 'discard') {
        const top = s.discards[s.discards.length - 1];
        if (top === undefined) return ['there is no discard to take'];
        return meldsContaining(hand, top).length > 0 ? [] : ['you can only take the discard if it makes a meld with your hand'];
      }
      return ['bad move'];
    }
    case 'meld': {
      if (s.phase !== 'play') return ['draw first'];
      if (!Array.isArray(m.cards) || !m.cards.every(cardOk)) return ['unknown card'];
      const cards = m.cards as number[];
      if (!cards.every((c) => hand.includes(c))) return ['you do not hold those cards'];
      const kind = meldKind(cards);
      if (!kind) return ['those cards are not a meld'];
      if (m.hidden !== undefined && typeof m.hidden !== 'boolean') return ['bad move'];
      if (m.hidden === true && !(kind === 'set' && cards.length === 4)) return ['only four of a kind can be shown face down'];
      return keepsDiscardMeld(s.mustMeld, hand, s.melds, cards) ? [] : ['keep the cards you need to show the discard you took'];
    }
    case 'sapaw': {
      if (s.phase !== 'play') return ['draw first'];
      if (!cardOk(m.card) || !isInt(m.meld)) return ['bad move'];
      if (!hand.includes(m.card)) return ['you do not hold that card'];
      const meld = s.melds.find((x) => x.id === m.meld);
      if (!meld) return ['there is no such meld'];
      if (meld.hidden) return ['a face-down meld cannot be added to'];
      if (!canSapaw(meld.kind, meld.cards, m.card)) return ['that card does not fit that meld'];
      return keepsDiscardMeld(s.mustMeld, hand, s.melds, [m.card]) ? [] : ['keep the cards you need to show the discard you took'];
    }
    case 'discard': {
      if (s.phase !== 'play') return ['draw first'];
      if (!cardOk(m.card) || !hand.includes(m.card)) return ['you do not hold that card'];
      if (s.mustMeld !== null) return ['show the meld you took the discard for first'];
      return [];
    }
    case 'fight': {
      if (s.phase !== 'draw') return ['you can only call Draw at the start of your turn'];
      if ((s.drawBlocked ?? []).includes(pid)) return ['an opponent laid off onto your meld, so you cannot call Draw this turn'];
      return openedBy(s, pid) ? [] : ['you can only call Draw after showing a meld'];
    }
    case 'respond': {
      if (s.phase !== 'fight') return ['there is no Draw call to answer'];
      return typeof m.challenge === 'boolean' ? [] : ['bad move'];
    }
    default:
      return ['bad move'];
  }
}

/**
 * After taking a discard you must show a meld with it (or lay it off onto a shown meld). Do not let a player use
 * up the cards that meld needs first, or the turn could never be finished. Shared by the rules and the screen.
 */
export function keepsDiscardMeld(
  need: Card | null,
  hand: readonly Card[],
  melds: readonly { kind: MeldKind; cards: readonly Card[]; hidden: boolean }[],
  used: readonly Card[],
): boolean {
  if (need === null || used.includes(need)) return true;
  const after = without(hand, used);
  return meldsContaining(after, need).length > 0 || melds.some((m) => !m.hidden && canSapaw(m.kind, m.cards, need));
}

/** How a player can still get rid of the card they took from the discard pile, if they have not yet. */
function discardMeldMove(hand: readonly Card[], melds: readonly TiMeldView[], need: Card): TiMove | null {
  const options = meldsContaining(hand, need);
  if (options.length > 0) {
    const best = options.reduce((a, b) => (bestDeadwood(without(hand, b)) < bestDeadwood(without(hand, a)) ? b : a));
    return { t: 'meld', cards: best };
  }
  const target = melds.find((m) => !m.hidden && canSapaw(m.kind, m.cards, need));
  return target ? { t: 'sapaw', meld: target.id, card: need } : null;
}

function finish(s: TiState, winner: string, ending: Ending): TiState {
  return { ...s, phase: 'over', end: { winner, ending }, fight: null };
}

/**
 * A hand that counts 0 points (every card in it fits a meld) wins at once as a Tong-its, without having to lay
 * the melds down (the user's group rule, 2026-11-14). Checked after each of your moves and when your turn starts.
 */
const zeroPoints = (cards: readonly Card[]): boolean => cards.length > 0 && cards.length <= 14 && bestDeadwood(cards) === 0;

/** Lowest total wins. `order` lists the contenders from the one who wins ties to the one who loses them. */
function lowest(s: TiState, order: readonly string[]): string {
  return order.reduce((a, b) => (handPoints(s.hands[b] as Card[]) < handPoints(s.hands[a] as Card[]) ? b : a));
}

function resolveFight(s: TiState): TiState {
  const fight = s.fight as NonNullable<TiState['fight']>;
  const challengers = s.players.filter((id) => fight.replies[id] === 'challenge');
  if (challengers.length === 0) return finish(s, fight.caller, 'normal');
  // A tie goes to the challenger, and between challengers to the one who answers first after the caller.
  const i = s.players.indexOf(fight.caller);
  const inOrder = challengers.sort((a, b) => ((s.players.indexOf(a) - i + 3) % 3) - ((s.players.indexOf(b) - i + 3) % 3));
  const best = lowest(s, inOrder);
  const winner = handPoints(s.hands[fight.caller] as Card[]) < handPoints(s.hands[best] as Card[]) ? fight.caller : best;
  return finish(s, winner, 'challenge');
}

function endByStock(s: TiState): TiState {
  const opened = s.players.filter((id) => openedBy(s, id));
  const pool = opened.length > 0 ? opened : s.players;
  // Ties go to the player who would have drawn next.
  const i = s.players.indexOf(s.turn);
  const order = [...pool].sort((a, b) => ((s.players.indexOf(a) - i - 1 + 6) % 3) - ((s.players.indexOf(b) - i - 1 + 6) % 3));
  return finish(s, lowest(s, order), 'normal');
}

function apply(state: TiState, pid: string, move: TiMove): TiState {
  const s: TiState = {
    ...state,
    hands: { ...state.hands },
    stock: [...state.stock],
    discards: [...state.discards],
    melds: state.melds.map((m) => ({ ...m, cards: [...m.cards] })),
    sagasa: { ...state.sagasa },
    drawBlocked: [...(state.drawBlocked ?? [])],
  };

  switch (move.t) {
    case 'draw': {
      if (move.from === 'stock') {
        const card = s.stock.pop() as Card;
        s.hands[pid] = [...(s.hands[pid] as Card[]), card];
        s.drew = 'stock';
        s.drawnCard = card;
        if (s.stock.length === 0) s.stockOut = true;
      } else {
        const card = s.discards.pop() as Card;
        s.hands[pid] = [...(s.hands[pid] as Card[]), card];
        s.drew = 'discard';
        s.drawnCard = card;
        s.mustMeld = card;
      }
      s.phase = 'play';
      return zeroPoints(s.hands[pid] as Card[]) ? finish(s, pid, 'tongits') : s;
    }
    case 'meld': {
      const kind = meldKind(move.cards) as MeldKind;
      s.hands[pid] = without(s.hands[pid] as Card[], move.cards);
      s.melds.push({ id: s.nextMeld++, owner: pid, kind, cards: [...move.cards].sort((a, b) => (kind === 'run' ? rankOf(a) - rankOf(b) : a - b)), hidden: move.hidden === true });
      if (s.mustMeld !== null && move.cards.includes(s.mustMeld)) s.mustMeld = null;
      return (s.hands[pid] as Card[]).length === 0 || zeroPoints(s.hands[pid] as Card[]) ? finish(s, pid, 'tongits') : s;
    }
    case 'sapaw': {
      const meld = s.melds.find((x) => x.id === move.meld) as TiMeld;
      s.hands[pid] = without(s.hands[pid] as Card[], [move.card]);
      if (meld.kind === 'set' && meld.owner === pid && s.drew === 'stock' && s.drawnCard === move.card) s.sagasa[pid] = (s.sagasa[pid] ?? 0) + 1;
      meld.cards = [...meld.cards, move.card].sort((a, b) => (meld.kind === 'run' ? rankOf(a) - rankOf(b) : a - b));
      // Laying off onto an opponent's meld stops them calling Draw on their next turn.
      if (meld.owner !== pid && !(s.drawBlocked as string[]).includes(meld.owner)) (s.drawBlocked as string[]).push(meld.owner);
      if (s.mustMeld === move.card) s.mustMeld = null;
      return (s.hands[pid] as Card[]).length === 0 || zeroPoints(s.hands[pid] as Card[]) ? finish(s, pid, 'tongits') : s;
    }
    case 'discard': {
      s.hands[pid] = without(s.hands[pid] as Card[], [move.card]);
      s.discards.push(move.card);
      // Your turn is over, so a block from an earlier sapaw has been served.
      s.drawBlocked = (s.drawBlocked as string[]).filter((id) => id !== pid);
      if ((s.hands[pid] as Card[]).length === 0 || zeroPoints(s.hands[pid] as Card[])) return finish(s, pid, 'tongits');
      if (s.stockOut) return endByStock(s);
      const i = s.players.indexOf(pid);
      s.turn = s.players[(i + 1) % s.players.length] as string;
      s.phase = 'draw';
      s.drew = null;
      s.drawnCard = null;
      s.mustMeld = null;
      s.firstTurn = false;
      // the next player may already be holding a hand worth 0 points
      return zeroPoints(s.hands[s.turn] as Card[]) ? finish(s, s.turn, 'tongits') : s;
    }
    case 'fight': {
      s.phase = 'fight';
      s.fight = { caller: pid, replies: {} };
      // Players with no meld shown cannot challenge, so they fold on their own.
      return pendingResponder(s) === null ? resolveFight(s) : s;
    }
    case 'respond': {
      const fight = { caller: (s.fight as NonNullable<TiState['fight']>).caller, replies: { ...(s.fight as NonNullable<TiState['fight']>).replies } };
      fight.replies[pid] = move.challenge ? 'challenge' : 'fold';
      s.fight = fight;
      return pendingResponder(s) === null ? resolveFight(s) : s;
    }
  }
}

function viewFor(s: TiState, pid: string | null): TiView {
  const over = s.phase === 'over';
  const counts: Record<string, number> = {};
  for (const id of s.players) counts[id] = (s.hands[id] as Card[]).length;
  const view: TiView = {
    you: pid,
    players: s.players,
    hand: pid && s.hands[pid] ? [...(s.hands[pid] as Card[])].sort((a, b) => a - b) : [],
    counts,
    turn: s.turn,
    phase: s.phase,
    toAct: actor(s),
    drew: s.drew,
    // What you drew is private to you; everyone sees only which pile it came from (`drew`).
    drawnCard: pid === s.turn ? s.drawnCard : null,
    mustMeld: pid === s.turn ? s.mustMeld : null,
    firstTurn: s.firstTurn,
    stockCount: s.stock.length,
    discards: s.discards,
    melds: s.melds.map((m) => {
      const show = !m.hidden || over || m.owner === pid;
      return { id: m.id, owner: m.owner, kind: m.kind, cards: show ? m.cards : [], hidden: m.hidden, size: m.cards.length };
    }),
    opened: s.players.filter((id) => openedBy(s, id)),
    fight: s.fight,
    sagasa: s.sagasa,
    drawBlocked: [...(s.drawBlocked ?? [])],
    done: over,
    end: s.end,
  };
  if (over) view.hands = s.hands;
  return view;
}

function result(s: TiState): Record<string, unknown> | null {
  if (s.phase !== 'over' || !s.end) return null;
  const { winner, ending } = s.end;
  const mine = s.melds.filter((m) => m.owner === winner);
  const input: Partial<TongItsInput> & { winner: string; ending: Ending } = { winner, ending };
  const burned = s.players.filter((id) => id !== winner && !openedBy(s, id));
  if (burned.length > 0) input.burned = burned;
  const aces = [...(s.hands[winner] as Card[]), ...mine.flatMap((m) => m.cards)].filter((c) => rankOf(c) === 1).length;
  let secrets = mine.filter((m) => m.hidden).length;
  let longRuns = mine.filter((m) => m.kind === 'run' && m.cards.length >= 5).length;
  // An automatic Tong-its (0 points) can end the hand while melds are still in the winner's hand. They count as
  // if laid down: a four of a kind never shown is a secret set, and a run of five or more is a long run. Of the
  // ways to group the hand, the one with the most of these is used.
  const held = s.hands[winner] as Card[];
  if (ending === 'tongits' && held.length > 0) {
    const ways = organize(held, 20).filter((a) => a.points === 0);
    const bonus = (a: (typeof ways)[number]) => ({
      secrets: a.melds.filter((m) => m.kind === 'set' && m.cards.length === 4).length,
      longRuns: a.melds.filter((m) => m.kind === 'run' && m.cards.length >= 5).length,
    });
    const best = ways.map(bonus).sort((x, y) => y.secrets + y.longRuns - (x.secrets + x.longRuns) || y.secrets - x.secrets)[0];
    if (best) {
      secrets += best.secrets;
      longRuns += best.longRuns;
    }
  }
  const sagasa = s.sagasa[winner] ?? 0;
  if (aces > 0) input.aces = aces;
  if (secrets > 0) input.secrets = secrets;
  if (longRuns > 0) input.longRuns = longRuns;
  if (sagasa > 0) input.sagasa = sagasa;
  return input;
}

/** The pot goes to a player who wins two deals in a row, and holds one ante per deal since it was last emptied. */
function finalize(input: Record<string, unknown>, setup: TongItsSetup, history: readonly unknown[]): Record<string, unknown> {
  if (setup.potAnte < 1 || history.length === 0) return input;
  const prev = history[history.length - 1] as TongItsInput;
  if (prev.winner !== input.winner || (prev.potDeals ?? 0) > 0) return input;
  let since = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (((history[i] as TongItsInput).potDeals ?? 0) > 0) break;
    since++;
  }
  return { ...input, potDeals: since + 1 };
}

// ------------------------------------------------------------------ computer players

const pick = <T>(items: readonly T[], rng: Rng): T => items[rng() % items.length] as T;

function exposable(view: TiView): Card[][] {
  // The best way to group the hand into melds; only the melds, not the leftover cards.
  const best = organize(view.hand, 1)[0];
  return best ? best.melds.map((m) => [...m.cards]) : [];
}

/** Cards in `hand` that fit a meld that is already shown (and not face down). */
function sapawOptions(view: TiView, cards: readonly Card[]): { meld: number; card: Card }[] {
  const out: { meld: number; card: Card }[] = [];
  for (const m of view.melds) {
    if (m.hidden) continue;
    for (const c of cards) if (canSapaw(m.kind, m.cards, c)) out.push({ meld: m.id, card: c });
  }
  return out;
}

function discardChoice(view: TiView, level: BotLevel, rng: Rng): Card {
  if (level === 'easy') return pick(view.hand, rng);
  const advice = discardAdvice(view.hand, view.hand.length);
  // Normal is sensible but careless: about one discard in three is just any card.
  if (level === 'normal') return rng() % 100 < 35 ? pick(view.hand, rng) : (advice[0] as { card: Card }).card;
  // Hard: among the best discards, throw the card least likely to help anyone. A card whose rank is nearly
  // used up (already played or shown) cannot be part of a meld for the others, and a high card that nobody
  // is collecting costs the most points if we get stuck with it.
  const bestLeft = (advice[0] as { deadwoodAfter: number }).deadwoodAfter;
  const pool = advice.filter((a) => a.deadwoodAfter <= bestLeft + 1);
  const seen = [...view.discards, ...view.melds.flatMap((m) => m.cards), ...view.hand];
  const dead = (c: Card): number => seen.filter((x) => rankOf(x) === rankOf(c)).length;
  const score = (a: { card: Card; deadwoodAfter: number }): number => a.deadwoodAfter * 10 - pointsOf(a.card) - dead(a.card) * 2;
  return pool.reduce((a, b) => (score(b) < score(a) ? b : a)).card;
}

function tiBot(view: TiView, level: BotLevel, seed: number): TiMove {
  const rng = makeRng(seed);
  const me = view.you as string;
  const myPoints = handPoints(view.hand);
  // A rough guess at someone's total from how many cards they hold; players who have shown a meld hold lower cards.
  const guess = (id: string): number => (view.counts[id] as number) * (view.opened.includes(id) ? 3 : 5);

  if (view.phase === 'fight') {
    const caller = (view.fight as NonNullable<TiView['fight']>).caller;
    if (level === 'easy') return { t: 'respond', challenge: rng() % 2 === 0 };
    const limit = level === 'normal' ? 8 : guess(caller);
    return { t: 'respond', challenge: myPoints <= limit };
  }

  if (view.phase === 'draw') {
    const opponents = view.players.filter((id) => id !== me);
    if (view.opened.includes(me) && !view.drawBlocked.includes(me) && level !== 'easy') {
      const callLimit = level === 'normal' ? 6 : Math.min(12, Math.min(...opponents.map(guess)) * 0.5);
      if (myPoints <= callLimit) return { t: 'fight' };
    }
    const top = view.discards[view.discards.length - 1];
    if (top !== undefined && meldsContaining(view.hand, top).length > 0 && (level === 'hard' || rng() % 100 < (level === 'normal' ? 75 : 50))) {
      return { t: 'draw', from: 'discard' };
    }
    return { t: 'draw', from: 'stock' };
  }

  // phase 'play'
  if (view.mustMeld !== null) {
    const move = discardMeldMove(view.hand, view.melds, view.mustMeld);
    if (move) return move;
  }
  const skip = level === 'easy' && rng() % 100 < 35;
  if (!skip) {
    const melds = exposable(view);
    const next = melds[0];
    if (next) {
      const quad = next.length === 4 && meldKind(next) === 'set';
      return { t: 'meld', cards: next, ...(quad && level !== 'easy' ? { hidden: true } : {}) };
    }
    const lay = sapawOptions(view, view.hand);
    if (lay.length > 0) {
      const o = level === 'easy' ? pick(lay, rng) : (lay.reduce((a, b) => (pointsOf(b.card) > pointsOf(a.card) ? b : a)));
      return { t: 'sapaw', meld: o.meld, card: o.card };
    }
  }
  return { t: 'discard', card: discardChoice(view, level, rng) };
}

function timeoutMove(view: TiView): TiMove {
  if (view.phase === 'fight') return { t: 'respond', challenge: false };
  if (view.phase === 'draw') return { t: 'draw', from: 'stock' };
  if (view.mustMeld !== null) {
    const move = discardMeldMove(view.hand, view.melds, view.mustMeld);
    if (move) return move;
  }
  // Throw away the highest card that is not in a suggested meld (the same melds the screen groups first).
  const loose = organize(view.hand, 1)[0]?.deadwood ?? [];
  if (loose.length > 0) {
    const worst = [...loose].sort((a, b) => pointsOf(b) - pointsOf(a) || rankOf(b) - rankOf(a) || b - a)[0] as Card;
    return { t: 'discard', card: worst };
  }
  return { t: 'discard', card: (discardAdvice(view.hand, 1)[0] as { card: Card }).card };
}

export const tongItsEngine: PlayEngine<TongItsSetup, TiState, TiMove, TiView> & {
  finalize: typeof finalize;
} = {
  start,
  toAct: actor,
  validate,
  apply,
  viewFor,
  result,
  finalize,
  bot: tiBot,
  timeoutMove,
  // a turn is draw, then (melds and) a discard; the same player never starts a new turn straight after their own
  finishTurnOnTimeout: true,
};
