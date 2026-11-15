import type { Component, Snippet } from 'svelte';
import type { PublicRound } from '../../shared/protocol';
import { analyze as analyzePusoy, type PusoyInput, type PusoySetup } from '../../games/pusoy';
import { deuceMultiplier, type PusoyDosInput, type PusoyDosSetup, type Tier } from '../../games/pusoy-dos';
import type { PokerInput, PokerSetup } from '../../games/poker';
import type { TongItsInput, TongItsSetup } from '../../games/tong-its';
import type { PkMove, PkView } from '../../games/poker/engine';
import type { PsMove, PsView } from '../../games/pusoy/engine';
import type { PdMove, PdView } from '../../games/pusoy-dos/engine';
import { handPoints, type TiMove, type TiView } from '../../games/tong-its/engine';
import type { RoomView } from '../../shared/protocol';
import PokerPlay from './poker/Play.svelte';
import PokerSetupUi from './poker/Setup.svelte';
import PusoyPlay from './pusoy/Play.svelte';
import DosPlay from './pusoy-dos/Play.svelte';
import PusoySetupUi from './pusoy/Setup.svelte';
import Setup from './pusoy-dos/Setup.svelte';
import TongPlay from './tong-its/Play.svelte';
import TongStatus from './tong-its/Status.svelte';
import TongSetup from './tong-its/Setup.svelte';

type T = (key: string, vars?: Record<string, string | number>) => string;

/** What the seat strip shows for one player while a hand is on. Every field is optional. */
export interface SeatInfo {
  /** Cards still held (drawn as small card backs). */
  cards?: number;
  /** One short line of live state, for example a poker stack. */
  text?: string;
  /** Out of this hand (poker fold). */
  out?: boolean;
  /** Holds the dealer button. */
  dealer?: boolean;
}

/** Card counts are public in the shedding and rummy games. */
const countSeat = (view: unknown, id: string): SeatInfo | null => {
  const n = (view as { counts?: Record<string, number> } | null)?.counts?.[id];
  return n === undefined ? null : { cards: n };
};

/** Props every game's Play screen takes. */
export interface PlayProps<View, Move> {
  view: View;
  timer?: Snippet;
  /** The hand's stake (only some games show it). */
  stake?: number;
  nameOf: (id: string) => string;
  onmove: (move: Move) => void;
  /** The room, for games that show table-wide facts during a hand (the Tong-its pot). */
  room?: RoomView;
}

/** Props every game's options screen takes. */
export interface SetupProps<Setup> {
  setup: Setup;
  playerCount: number;
  onchange: (next: Setup) => void;
}

/**
 * Everything the browser needs per game, typed for that game. Games are registered through `defineUi`, which
 * checks each screen against the game's own view, move and options types, then stores it in the shared registry.
 */
export interface GameUiOf<View, Move, Setup> {
  /** Live game status shown in the waiting room (for example the Tong-its pot). */
  Status?: Component<{ room: RoomView }>;
  /** The screen for a hand being played. */
  Play: Component<PlayProps<View, Move>>;
  /** Host options screen. */
  Setup: Component<SetupProps<Setup>>;
  /** Live seat details for the seat strip, from this player's view of the hand. */
  seat?(view: View, playerId: string, t: T): SeatInfo | null;
  /** The stake the host sets when dealing: its label key and a starting value. Absent for stakeless games (poker). */
  stake?: { label: string; start: number };
  /** Time-per-turn choices in seconds, after "No limit". Default 30, 45 and 60 seconds (one move at a time). */
  turnChoices?: readonly number[];
  /** One-line summary of a saved round for the history list. */
  describe(round: PublicRound, setup: unknown, nameOf: (id: string) => string, t: T): string;
  /** Who won the round, for celebrations. Null if there is no single winner. */
  winnerOf(round: PublicRound, setup: unknown): string | null;
  /** Big callouts to flash when a round is saved, in order. */
  banners(round: PublicRound, setup: unknown, nameOf: (id: string) => string, t: T): { text: string; tone: 'win' | 'bad' | 'info' }[];
  /** Plain-language lines explaining the rules currently in force. */
  rules(setup: unknown, t: T): string[];
}

function tierText(tiers: Tier[], hand: number): string {
  return tiers
    .map((tier, i) => {
      const next = tiers[i + 1];
      const to = next ? next.minCards - 1 : hand;
      const range = tier.minCards >= to ? `${tier.minCards}` : `${tier.minCards}-${to}`;
      return `${range}: ${tier.perCard}`;
    })
    .join(' · ');
}

/**
 * The shared registry holds games side by side, so their view, move and options types are erased here. That is
 * safe because every component and helper was checked against its own game's types in `defineUi`, the server only
 * ever sends a game's own view to its screen, and the server re-validates every move and option.
 */
type Erased = any;
export type GameUi = GameUiOf<Erased, Erased, Erased>;
const defineUi = <View, Move, Setup>(ui: GameUiOf<View, Move, Setup>): GameUi => ui as unknown as GameUi;

export const gameUis: Readonly<Record<string, GameUi>> = {
  'pusoy-dos': defineUi<PdView, PdMove, PusoyDosSetup>({
    Setup,
    Play: DosPlay,
    stake: { label: 'play.stake', start: 50 },
    seat: countSeat,
    describe(round, setupRaw, nameOf, t) {
      const setup = setupRaw as PusoyDosSetup;
      const input = round.input as PusoyDosInput;
      const deuces = input.deuces && input.deuces > 0 ? ` · ${t('entry.deucesShort', { n: input.deuces })}` : '';
      if (setup.scoring === 'placement') {
        return t('entry.orderLine', { order: (input.order ?? []).map(nameOf).join(' › ') });
      }
      if (setup.scoring === 'cards-left') {
        const left = Object.entries(input.cardsLeft ?? {}).map(([id, n]) => `${nameOf(id)} ${n}`).join(', ');
        return t('entry.wonLeft', { name: nameOf(input.winner ?? ''), left }) + deuces;
      }
      return t('entry.won', { name: nameOf(input.winner ?? ''), stake: input.stake }) + deuces;
    },
    winnerOf(round, setupRaw) {
      const setup = setupRaw as PusoyDosSetup;
      const input = round.input as PusoyDosInput;
      return (setup.scoring === 'placement' ? input.order?.[0] : input.winner) ?? null;
    },
    banners(round, setupRaw, nameOf, t) {
      const setup = setupRaw as PusoyDosSetup;
      const input = round.input as PusoyDosInput;
      const win = (setup.scoring === 'placement' ? input.order?.[0] : input.winner) ?? '';
      const out: { text: string; tone: 'win' | 'bad' | 'info' }[] = [{ text: t('banner.wins', { name: nameOf(win) }), tone: 'win' }];
      const mult = deuceMultiplier(setup.deuce, input.deuces ?? 0);
      if (setup.scoring !== 'placement' && mult > 1) out.push({ text: t('banner.deuces', { n: mult }), tone: 'win' });
      if (setup.scoring === 'cards-left') {
        const left = Object.entries(input.cardsLeft ?? {});
        const all = left.filter(([, n]) => n >= setup.startingHand).map(([id]) => nameOf(id));
        const many = left.filter(([, n]) => n >= 10 && n < setup.startingHand).map(([id]) => nameOf(id));
        if (all.length) out.push({ text: t('banner.noPlay', { names: all.join(', ') }), tone: 'bad' });
        if (many.length) out.push({ text: t('banner.sunog', { names: many.join(', ') }), tone: 'bad' });
      }
      return out;
    },
    rules(setupRaw, t) {
      const s = setupRaw as PusoyDosSetup;
      const lines: string[] = [t(`rules.${s.scoring}`)];
      if (s.scoring === 'cards-left') {
        lines.push(s.scoringVersion === 2 ? t('rules.dos.fixedPenalty') : t('rules.tiers', { tiers: tierText(s.tiers, s.startingHand) }));
        lines.push(t(`rules.settlement.${s.settlement}`));
      }
      if (s.scoring === 'placement') lines.push(t('rules.points', { points: s.placementPoints.join(' / ') }));
      if (s.scoring !== 'placement' && s.deuce !== 'off') lines.push(t(`rules.deuce.${s.deuce}`));
      lines.push(t('rules.vary'));
      return lines;
    },
  }),
  'tong-its': defineUi<TiView, TiMove, TongItsSetup>({
    Setup: TongSetup,
    Play: TongPlay,
    stake: { label: 'tong.stake', start: 10 },
    seat(view, id, t) {
      const cards = view.done ? view.hands?.[id] : undefined;
      return cards ? { text: t('tong.play.points', { n: handPoints(cards) }) } : countSeat(view, id);
    },
    Status: TongStatus,
    describe(round, _setup, nameOf, t) {
      const i = round.input as TongItsInput;
      const bits = [t(`tong.ending.${i.ending}`)];
      if (i.burned?.length) bits.push(t('tong.burnedLine', { names: i.burned.map(nameOf).join(', ') }));
      if (i.aces) bits.push(t('tong.acesLine', { n: i.aces }));
      if (i.secrets) bits.push(t('tong.secretsLine', { n: i.secrets }));
      if (i.potDeals) bits.push(t('tong.potLine', { n: i.potDeals }));
      return `${t('tong.wonLine', { name: nameOf(i.winner) })} \u00b7 ${bits.join(' \u00b7 ')} \u00b7 ${t('tong.perChip', { n: i.stake })}`;
    },
    banners(round, setupRaw, nameOf, t) {
      const setup = setupRaw as TongItsSetup;
      const i = round.input as TongItsInput;
      const out: { text: string; tone: 'win' | 'bad' | 'info' }[] = [];
      if (i.ending === 'tongits') out.push({ text: t('banner.tongits'), tone: 'win' });
      else if (i.ending === 'challenge') out.push({ text: t('banner.challenge'), tone: 'win' });
      else out.push({ text: t('banner.wins', { name: nameOf(i.winner) }), tone: 'win' });
      if (i.secrets) out.push({ text: t('banner.secret'), tone: 'info' });
      if (i.sagasa) out.push({ text: t('banner.sagasa'), tone: 'info' });
      if (i.burned?.length) out.push({ text: t('banner.burned', { names: i.burned.map(nameOf).join(', ') }), tone: 'bad' });
      if (i.potDeals) out.push({ text: t('banner.pot', { n: i.potDeals * setup.potAnte * Object.keys(round.delta).length }), tone: 'win' });
      return out;
    },
    winnerOf: (round) => (round.input as TongItsInput).winner,
    rules(setupRaw, t) {
      const s = setupRaw as TongItsSetup;
      const lines = [t('rules.tong.intro')];
      lines.push(t('rules.tong.win', { n: s.winChips }));
      lines.push(t(s.tongitsMode === 'replace' ? 'rules.tong.tongits.replace' : 'rules.tong.tongits.add', { n: s.tongitsChips }));
      lines.push(t(s.challengeMode === 'replace' ? 'rules.tong.challenge.replace' : 'rules.tong.challenge.add', { n: s.challengeChips }));
      if (s.burnedChips) lines.push(t('rules.tong.burned', { n: s.burnedChips }));
      if (s.aceChips) lines.push(t('rules.tong.ace', { n: s.aceChips }));
      if (s.secretChips) lines.push(t('rules.tong.secret', { n: s.secretChips }));
      if (s.longRunChips) lines.push(t('rules.tong.longRun', { n: s.longRunChips }));
      if (s.sagasaChips) lines.push(t('rules.tong.sagasa', { n: s.sagasaChips }));
      if (s.potAnte) lines.push(t('rules.tong.pot', { n: s.potAnte }));
      lines.push(t('rules.vary'));
      return lines;
    },
  }),
  pusoy: defineUi<PsView, PsMove, PusoySetup>({
    Setup: PusoySetupUi,
    Play: PusoyPlay,
    stake: { label: 'play.stake', start: 50 },
    // the whole 13-card hand is set in one go, so the clock is in minutes
    turnChoices: [60, 120, 180],
    seat(viewRaw, id, t) {
      const view = viewRaw as PsView | null;
      if (!view || view.done) return null;
      return { text: t(view.waiting.includes(id) ? 'pusoy.play.setting' : 'pusoy.play.ready') };
    },
    describe(round, setupRaw, nameOf, t) {
      const setup = setupRaw as PusoySetup;
      const input = round.input as PusoyInput;
      const players = Object.keys(round.delta);
      const d = analyzePusoy(setup, players, input);
      const bits: string[] = [];
      const top = players.reduce((a, b) => ((round.delta[b] ?? 0) > (round.delta[a] ?? 0) ? b : a), players[0] ?? '');
      if (top) bits.push(t('pusoy.topLine', { name: nameOf(top) }));
      if (d.scoops.length) bits.push(t('pusoy.scoopLine', { names: d.scoops.map((x) => `${nameOf(x.winner)}\u2192${nameOf(x.loser)}`).join(', ') }));
      if (d.fouls.length) bits.push(t('pusoy.foulLine', { names: d.fouls.map(nameOf).join(', ') }));
      if (d.royaltyHolders.length) bits.push(t('pusoy.royaltyLine', { names: d.royaltyHolders.map(nameOf).join(', ') }));
      if (d.naturalHolders.length) bits.push(t('pusoy.naturalLine', { names: d.naturalHolders.map(nameOf).join(', ') }));
      return bits.join(' \u00b7 ');
    },
    banners(round, setupRaw, nameOf, t) {
      const setup = setupRaw as PusoySetup;
      const players = Object.keys(round.delta);
      const d = analyzePusoy(setup, players, round.input as PusoyInput);
      const out: { text: string; tone: 'win' | 'bad' | 'info' }[] = [];
      const top = players.reduce((a, b) => ((round.delta[b] ?? 0) > (round.delta[a] ?? 0) ? b : a), players[0] ?? '');
      if (top && (round.delta[top] ?? 0) > 0) out.push({ text: t('banner.wins', { name: nameOf(top) }), tone: 'win' });
      for (const x of d.scoops.slice(0, 2)) out.push({ text: t('banner.scoop', { name: nameOf(x.winner) }), tone: 'win' });
      if (d.naturalHolders.length) out.push({ text: t('banner.natural', { names: d.naturalHolders.map(nameOf).join(', ') }), tone: 'win' });
      if (d.royaltyHolders.length) out.push({ text: t('banner.royalty', { names: d.royaltyHolders.map(nameOf).join(', ') }), tone: 'info' });
      if (d.fouls.length) out.push({ text: t('banner.foul', { names: d.fouls.map(nameOf).join(', ') }), tone: 'bad' });
      return out;
    },
    winnerOf(round) {
      const entries = Object.entries(round.delta);
      const best = entries.reduce<[string, number] | null>((a, e) => (a === null || e[1] > a[1] ? e : a), null);
      return best && best[1] > 0 ? best[0] : null;
    },
    rules(setupRaw, t) {
      const s = setupRaw as PusoySetup;
      const lines = [t('rules.pusoy.intro'), ...(s.system === 'fixed' ? [] : [t('rules.pusoy.rows')])];
      lines.push(s.system === 'fixed' ? t('rules.pusoy.fixed') : t('rules.pusoy.system', { maj: s.majorityBonus, scoop: s.scoopBonus }));
      if (s.royalties) lines.push(t(s.royaltyMode === 'all' ? 'rules.pusoy.royalties.all' : 'rules.pusoy.royalties.onwin'));
      if (s.naturals) lines.push(t('rules.pusoy.naturals'));
      lines.push(t('rules.vary'));
      return lines;
    },
  }),
  poker: defineUi<PkView, PkMove, PokerSetup>({
    Play: PokerPlay,
    seat(viewRaw, id, t) {
      const ps = (viewRaw as PkView | null)?.seat?.[id];
      if (!ps) return null;
      const state = ps.folded ? t('poker.folded') : ps.allIn ? t('poker.allin') : ps.bet > 0 ? t('poker.seatBet', { n: ps.bet }) : '';
      return { text: t('poker.stack', { n: ps.stack }) + (state ? ` · ${state}` : ''), out: ps.folded, dealer: ps.dealer };
    },
    Setup: PokerSetupUi,
    describe(round, _setup, nameOf, t) {
      const input = round.input as PokerInput;
      const players = Object.keys(round.delta);
      const top = players.reduce((x, y) => ((round.delta[y] ?? 0) > (round.delta[x] ?? 0) ? y : x), players[0] ?? '');
      const bits: string[] = [];
      if (top && (round.delta[top] ?? 0) > 0) bits.push(t('poker.topLine', { name: nameOf(top) }));
      const rebuys = players.filter((id) => (input.buyIns[id]?.length ?? 1) > 1);
      if (rebuys.length > 0) bits.push(t('poker.rebuyLine', { names: rebuys.map(nameOf).join(', ') }));
      if (bits.length === 0) bits.push(t('poker.evenLine'));
      return bits.join(' \u00b7 ');
    },
    banners(round, _setup, nameOf, t) {
      const players = Object.keys(round.delta);
      const top = players.reduce((x, y) => ((round.delta[y] ?? 0) > (round.delta[x] ?? 0) ? y : x), players[0] ?? '');
      const out: { text: string; tone: 'win' | 'bad' | 'info' }[] = [];
      if (top && (round.delta[top] ?? 0) > 0) out.push({ text: t('banner.wins', { name: nameOf(top) }), tone: 'win' });
      return out;
    },
    winnerOf(round) {
      const best = Object.entries(round.delta).reduce<[string, number] | null>((a, e) => (a === null || e[1] > a[1] ? e : a), null);
      return best && best[1] > 0 ? best[0] : null;
    },
    rules(setupRaw, t) {
      const s = setupRaw as PokerSetup;
      return [
        t('rules.poker.intro'),
        t('rules.poker.balance'),
        t('rules.poker.ratio', { chips: s.chips, units: s.moneyUnits }),
        t('rules.poker.noMoney'),
      ];
    },
  }),
};
