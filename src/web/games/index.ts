import type { Component } from 'svelte';
import type { PublicRound } from '../../shared/protocol';
import { analyze as analyzePusoy, type PusoyInput, type PusoySetup } from '../../games/pusoy';
import { deuceMultiplier, type PusoyDosInput, type PusoyDosSetup, type Tier } from '../../games/pusoy-dos';
import { analyze as analyzePoker, type PokerInput, type PokerSetup } from '../../games/poker';
import type { TongItsInput, TongItsSetup } from '../../games/tong-its';
import PokerEntry from './poker/Entry.svelte';
import PokerPlay from './poker/Play.svelte';
import PokerSetupUi from './poker/Setup.svelte';
import PusoyEntry from './pusoy/Entry.svelte';
import PusoyPlay from './pusoy/Play.svelte';
import DosHand from './pusoy-dos/HandHelper.svelte';
import DosPlay from './pusoy-dos/Play.svelte';
import PusoySetupUi from './pusoy/Setup.svelte';
import Entry from './pusoy-dos/Entry.svelte';
import Setup from './pusoy-dos/Setup.svelte';
import TongEntry from './tong-its/Entry.svelte';
import TongHand from './tong-its/HandHelper.svelte';
import TongPlay from './tong-its/Play.svelte';
import TongStatus from './tong-its/Status.svelte';
import TongSetup from './tong-its/Setup.svelte';

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Everything the browser needs per game. The registry is typed loosely on purpose: each game's
 * components validate their own input and setup, and the server re-validates everything.
 */
export interface GameUi {
  /** Result-entry screen. Props: setup, players, rounds, initial?, submitLabel?, onsave. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Entry: Component<any>;
  /** Live game status shown under the standings for everyone (for example the Tong-its pot). Props: room. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Status?: Component<any>;
  /** Digital play: the screen for a hand being played in the app. Props: view, nameOf, onmove. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Play?: Component<any>;
  /** Private hand helper shown on each player's own phone, if the game has one. Props: code, setup. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HandHelper?: Component<any>;
  /** Host options screen. Props: setup, playerCount, onchange. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Setup: Component<any>;
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

export const gameUis: Readonly<Record<string, GameUi>> = {
  'pusoy-dos': {
    Entry,
    Setup,
    HandHelper: DosHand,
    Play: DosPlay,
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
        lines.push(t('rules.tiers', { tiers: tierText(s.tiers, s.startingHand) }));
        lines.push(t(`rules.settlement.${s.settlement}`));
      }
      if (s.scoring === 'placement') lines.push(t('rules.points', { points: s.placementPoints.join(' / ') }));
      if (s.scoring !== 'placement' && s.deuce !== 'off') lines.push(t(`rules.deuce.${s.deuce}`));
      lines.push(t('rules.vary'));
      return lines;
    },
  },
  'tong-its': {
    Entry: TongEntry,
    Setup: TongSetup,
    HandHelper: TongHand,
    Play: TongPlay,
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
  },
  pusoy: {
    Entry: PusoyEntry,
    Setup: PusoySetupUi,
    Play: PusoyPlay,
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
      const lines = [t('rules.pusoy.intro'), t('rules.pusoy.rows')];
      lines.push(t('rules.pusoy.system', { maj: s.majorityBonus, scoop: s.scoopBonus }));
      lines.push(s.foul === 'scoop' ? t('rules.pusoy.foul.scoop') : t('rules.pusoy.foul.flat', { n: s.foulFlat }));
      if (s.royalties) lines.push(t(s.royaltyMode === 'all' ? 'rules.pusoy.royalties.all' : 'rules.pusoy.royalties.onwin'));
      if (s.naturals) lines.push(t('rules.pusoy.naturals'));
      lines.push(t('rules.vary'));
      return lines;
    },
  },
  poker: {
    Entry: PokerEntry,
    Play: PokerPlay,
    Setup: PokerSetupUi,
    describe(round, _setup, nameOf, t) {
      const input = round.input as PokerInput;
      const players = Object.keys(round.delta);
      const a = analyzePoker(players, input);
      const top = players.reduce((x, y) => ((round.delta[y] ?? 0) > (round.delta[x] ?? 0) ? y : x), players[0] ?? '');
      const bits = [t('poker.inLine', { n: a.chipsIn.toLocaleString('en-US') })];
      const rebuys = players.reduce((n, id) => n + Math.max(0, (input.buyIns[id]?.length ?? 1) - 1), 0);
      if (rebuys > 0) bits.push(t('poker.rebuysLine', { n: rebuys }));
      if (top && (round.delta[top] ?? 0) > 0) bits.push(t('poker.topLine', { name: nameOf(top) }));
      if (input.adjustTo) bits.push(t('poker.adjustLine', { name: nameOf(input.adjustTo), n: Math.abs(a.difference).toLocaleString('en-US') }));
      return bits.join(' \u00b7 ');
    },
    banners(round, _setup, nameOf, t) {
      const players = Object.keys(round.delta);
      const top = players.reduce((x, y) => ((round.delta[y] ?? 0) > (round.delta[x] ?? 0) ? y : x), players[0] ?? '');
      const out: { text: string; tone: 'win' | 'bad' | 'info' }[] = [];
      if (top && (round.delta[top] ?? 0) > 0) out.push({ text: t('banner.wins', { name: nameOf(top) }), tone: 'win' });
      if ((round.input as PokerInput).adjustTo) out.push({ text: t('banner.adjusted'), tone: 'info' });
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
  },
};
