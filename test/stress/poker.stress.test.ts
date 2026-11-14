import { describe, it } from 'vitest';
import { mixSeed, shuffle } from '../../src/core/rng';
import { defaultSetup, poker, type PokerSetup } from '../../src/games/poker';
import { bestOf, equity, pokerEngine as E, type PkMove, type PkState } from '../../src/games/poker/engine';
import { Failures, N, garbage, pick, randLevels, range, roundTrip, same, seeded, sum } from './harness';

// ---------------------------------------------------------------- independent oracle: rank five/seven cards by sorting and counting
const rv = (c: number): number => ((c % 13) + 1 === 1 ? 14 : (c % 13) + 1);
type NH = { cat: number; tb: number[] };
function naive5(cards: number[]): NH {
  const ranks = cards.map(rv);
  const count: Record<number, number> = {};
  for (const x of ranks) count[x] = (count[x] ?? 0) + 1;
  const groups = Object.entries(count).map(([k, v]) => ({ r: Number(k), n: v })).sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = new Set(cards.map((c) => Math.floor(c / 13))).size === 1;
  const desc = [...ranks].sort((a, b) => b - a);
  let top = 0;
  if (new Set(ranks).size === 5) {
    if (desc[0]! - desc[4]! === 4) top = desc[0]!;
    else if (desc.join() === '14,5,4,3,2') top = 5;
  }
  const pat = groups.map((g) => g.n).join('');
  const lead = groups.map((g) => g.r);
  if (top && flush) return { cat: 8, tb: [top] };
  if (pat === '41') return { cat: 7, tb: lead };
  if (pat === '32') return { cat: 6, tb: lead };
  if (flush) return { cat: 5, tb: desc };
  if (top) return { cat: 4, tb: [top] };
  if (pat === '311') return { cat: 3, tb: lead };
  if (pat === '221') return { cat: 2, tb: lead };
  if (pat === '2111') return { cat: 1, tb: lead };
  return { cat: 0, tb: lead };
}
const cmp = (a: NH, b: NH): number => {
  if (a.cat !== b.cat) return a.cat < b.cat ? -1 : 1;
  for (let i = 0; i < 5; i++) if ((a.tb[i] ?? 0) !== (b.tb[i] ?? 0)) return (a.tb[i] ?? 0) < (b.tb[i] ?? 0) ? -1 : 1;
  return 0;
};
function naiveBest(cards: number[]): NH {
  let best: NH | null = null;
  const n = cards.length;
  for (let m = 0; m < 1 << n; m++) {
    if (popcount(m) !== 5) continue;
    const h = naive5(cards.filter((_, i) => m & (1 << i)));
    if (!best || cmp(h, best) > 0) best = h;
  }
  return best as NH;
}
function popcount(x: number): number { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

/** Who gets what, computed chip level by chip level with the independent ranker. */
function oraclePayout(players: string[], button: number, total: Record<string, number>, folded: Set<string>, hole: Record<string, number[]>, board: number[]): Record<string, number> {
  const win: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const live = players.filter((p) => !folded.has(p));
  const levels = [...new Set(Object.values(total).filter((x) => x > 0))].sort((a, b) => a - b);
  let prev = 0;
  const pots: { amount: number; eligible: string[] }[] = [];
  for (const L of levels) {
    const amount = players.reduce((a, p) => a + Math.max(0, Math.min(total[p]!, L) - prev), 0);
    const eligible = live.filter((p) => total[p]! >= L);
    const last = pots[pots.length - 1];
    // a level made only by a folded player is not a separate pot
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = L;
  }
  const order = players.map((_, k) => players[(button + 1 + k) % players.length]!);
  for (const pot of pots) {
    if (pot.amount === 0) continue;
    let winners = pot.eligible.length ? pot.eligible : live;
    if (live.length > 1 && winners.length > 1) {
      const strength = Object.fromEntries(winners.map((p) => [p, naiveBest([...hole[p]!, ...board])]));
      const best = winners.reduce((a, b) => (cmp(strength[b]!, strength[a]!) > 0 ? b : a));
      winners = winners.filter((p) => cmp(strength[p]!, strength[best]!) === 0);
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const p of winners) win[p] = win[p]! + share;
    for (const p of order) if (odd > 0 && winners.includes(p)) { win[p] = win[p]! + 1; odd--; }
  }
  return win;
}

// ---------------------------------------------------------------- privacy
function scramble(s: PkState, viewer: string | null, r: () => number): PkState {
  const others = s.players.filter((id) => id !== viewer);
  const pool = [...others.flatMap((id) => s.seats[id]!.hole), ...s.deck];
  const mixed = shuffle(pool, r);
  const seats = { ...s.seats };
  let at = 0;
  for (const id of others) { seats[id] = { ...s.seats[id]!, hole: [mixed[at]!, mixed[at + 1]!] }; at += 2; }
  return { ...s, seats, deck: mixed.slice(at) };
}

function stubPrev(ids: string[], button: number, stacks: Record<string, number>): PkState {
  return { button, endStacks: stacks } as unknown as PkState;
}

describe('Poker stress', () => {
  it('seven-card ranking agrees with an independent sort-and-count ranker on huge numbers of random hands', () => {
    const f = new Failures();
    const r = seeded(606);
    let n = 0;
    for (let t = 0; t < N(40000); t++) {
      // alternate fully random deals with ones biased toward pairs, flushes and straights
      const mode = t % 4;
      const deck = mode === 0 ? range(52) : mode === 1 ? range(52).filter((c) => c % 13 < 6 || r() % 6 === 0) : mode === 2 ? range(52).filter((c) => Math.floor(c / 13) < 2 || r() % 5 === 0) : range(52).filter((c) => [0, 1, 2, 3, 4, 12, 11].includes(c % 13) || r() % 7 === 0);
      if (deck.length < 14) continue;
      const d = shuffle(deck, r);
      const a = d.slice(0, 7);
      const b = d.slice(7, 14);
      n++;
      f.check(Math.sign(bestOf(a).key - bestOf(b).key) === cmp(naiveBest(a), naiveBest(b)), () => `7-card ordering differs: ${a} vs ${b}`);
      f.check(bestOf(a).cat === naiveBest(a).cat, () => `7-card category differs for ${a}: ${bestOf(a).cat} vs ${naiveBest(a).cat}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] poker ranking: ${n} hand pairs compared`);
    f.done('poker ranking');
  });

  it('equity estimates are sane', () => {
    const f = new Failures();
    const r = seeded(707);
    const aa = equity([0, 13], [], 1, 600, r);
    const seven2 = equity([6, 14], [], 1, 600, r);
    f.check(aa > 0.75 && aa < 0.95, () => `pocket aces vs one random hand should be about 85%, got ${aa}`);
    f.check(seven2 < 0.5, () => `a weak hand should be an underdog, got ${seven2}`);
    for (let t = 0; t < N(200); t++) {
      const d = shuffle(range(52), r);
      const k = pick([0, 3, 4, 5], r);
      const e = equity(d.slice(0, 2), d.slice(2, 2 + k), 1 + (r() % 5), 40, r);
      f.check(e >= 0 && e <= 1 && Number.isFinite(e), () => `equity out of range: ${e}`);
    }
    f.done('poker equity');
  });

  it('plays tens of thousands of hands: random actions toward all-ins, every bot mix, short stacks, blinds, chains with busts; payouts recomputed by an independent oracle', () => {
    const f = new Failures();
    let hands = 0;
    let actions = 0;
    let showdowns = 0;
    let allInHands = 0;
    for (const mode of ['fuzz', 'bots'] as const) {
      const total = mode === 'fuzz' ? N(300) : N(120);
      for (let chain = 0; chain < total; chain++) {
        const seed = mixSeed(chain + 1, mode === 'fuzz' ? 9001 : 4242);
        const r = seeded(seed);
        const n = 2 + (r() % 5);
        const ids = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
        const buyIn = pick([2, 10, 40, 100, 1000], r);
        const bb = Math.max(1, Math.min(buyIn, pick([1, 2, 5, 10, buyIn], r)));
        const setup: PokerSetup = { ...defaultSetup(), buyIn, bigBlind: bb, smallBlind: Math.max(1, Math.min(bb, pick([1, Math.floor(bb / 2), bb], r))) };
        f.check(poker.validateSetup(setup, n).length === 0, () => `setup invalid ${JSON.stringify(setup)}: ${poker.validateSetup(setup, n)}`);
        const levels = randLevels(n, r);
        let prev: PkState | null = r() % 2 === 0 ? null : stubPrev(ids, r() % n, Object.fromEntries(ids.map((id) => [id, r() % 4 === 0 ? 0 : 1 + (r() % (buyIn * 3))])));
        const hl = mode === 'fuzz' ? 5 + (r() % 30) : 2 + (r() % 8);
        for (let h = 0; h < hl; h++) {
          const hseed = mixSeed(seed, h);
          const ctx = `seed=${seed} hand=${h} ${n}p buyIn=${buyIn} bb=${bb} sb=${setup.smallBlind} ${mode === 'bots' ? levels.join(',') : 'fuzz'}`;
          let s: PkState | undefined = f.guard(ctx + ' start', () => E.start(setup, ids, hseed, prev));
          if (!s) break;
          // linking rules: the button moves, stacks carry, a busted player buys back in
          if (prev) {
            f.check(s.button === (prev.button + 1) % n, () => `${ctx}: button did not move`);
            for (const id of ids) {
              const carried = prev.endStacks![id]!;
              f.check(s.startStacks[id] === (carried > 0 ? carried : buyIn), () => `${ctx}: stack for ${id} is ${s!.startStacks[id]}, expected ${carried > 0 ? carried : buyIn}`);
            }
          }
          const holeAtStart = Object.fromEntries(ids.map((id) => [id, [...s!.seats[id]!.hole]]));
          let step = 0;
          let sawAllIn = false;
          while (s.street !== 'over') {
            const who = E.toAct(s);
            if (!who) { f.add(`${ctx}: nobody to act on ${s.street}`); break; }
            const view = E.viewFor(s, who);
            let move: PkMove | undefined;
            if (mode === 'bots') {
              move = f.guard(`${ctx} bot`, () => E.bot(view, levels[ids.indexOf(who)]!, mixSeed(hseed, step)));
            } else {
              const x = r() % 100;
              const rg = view.raise;
              if (rg && x < 38) move = { t: 'raise', to: pick([rg.min, rg.max, rg.max, rg.min + (r() % (rg.max - rg.min + 1))], r) };
              else if (view.toCall === 0) move = x < 85 ? { t: 'check' } : { t: 'fold' };
              else move = x < 70 ? { t: 'call' } : { t: 'fold' };
            }
            if (!move) break;
            const problems = E.validate(s, who, move);
            if (problems.length) { f.add(`${ctx}: illegal move ${JSON.stringify(move)} on ${s.street}: ${problems}`); break; }
            const tmo = E.validate(s, who, E.timeoutMove(view));
            if (tmo.length) f.add(`${ctx}: timeoutMove illegal: ${tmo}`);
            // validate against the independent legality rule derived from the view
            const toTry = [0, 1, view.raise?.min ?? 1, (view.raise?.min ?? 1) - 1, view.raise?.max ?? 1, (view.raise?.max ?? 1) + 1, r() % (buyIn * 4 + 3)];
            for (const to of toTry) {
              const ok = E.validate(s, who, { t: 'raise', to }).length === 0;
              const want = !!view.raise && to >= view.raise.min && to <= view.raise.max;
              f.check(ok === want, () => `${ctx}: raise to ${to} accepted=${ok} but view says ${JSON.stringify(view.raise)}`);
            }
            f.check((E.validate(s, who, { t: 'check' }).length === 0) === (view.toCall === 0 || s.seats[who]!.bet === s.currentBet), () => `${ctx}: check legality mismatch`);
            const before = JSON.stringify(s);
            for (let k = 0; k < 2; k++) {
              const junk = garbage(r);
              const res = f.guard(`${ctx} garbage`, () => E.validate(s!, who, junk));
              if (res && res.length === 0) f.add(`${ctx}: garbage accepted ${JSON.stringify(junk)}`);
            }
            f.check(JSON.stringify(s) === before, () => `${ctx}: validate changed state`);
            if (step % 4 === 0) {
              const viewer = pick([...ids, null as unknown as string], r) || null;
              f.check(same(E.viewFor(s, viewer), E.viewFor(scramble(s, viewer, r), viewer)), () => `${ctx}: view for ${viewer} depends on hidden cards`);
            }
            s = roundTrip(E.apply(s, who, move));
            step++;
            actions++;
            // chip conservation and sanity on every step
            for (const id of ids) {
              const seat = s.seats[id]!;
              if (seat.stack < 0 || seat.bet < 0 || seat.stack + seat.total !== s.startStacks[id]) { f.add(`${ctx}: chips off for ${id}: stack ${seat.stack}, total ${seat.total}, start ${s.startStacks[id]}`); break; }
              if (seat.bet > seat.total) f.add(`${ctx}: bet ${seat.bet} > total ${seat.total} for ${id}`);
              if (seat.allIn) sawAllIn = true;
            }
            if (s.street !== 'over') {
              if (s.queue.some((id) => s!.seats[id]!.folded || s!.seats[id]!.allIn)) { f.add(`${ctx}: a folded or all-in player is still to act`); break; }
              if (ids.some((id) => s!.seats[id]!.bet > s!.currentBet)) { f.add(`${ctx}: a bet exceeds the current bet`); break; }
              if (new Set(s.queue).size !== s.queue.length) { f.add(`${ctx}: a player is queued twice`); break; }
            }
            const cards = [...ids.flatMap((id) => s!.seats[id]!.hole), ...s.board, ...s.deck];
            const burns = { preflop: 0, flop: 1, turn: 2, river: 3, over: Math.max(0, s.board.length === 0 ? 0 : s.board.length - 2) }[s.street];
            if (cards.length !== 52 - burns || new Set(cards).size !== cards.length) { f.add(`${ctx}: deck broken (${cards.length} cards, ${new Set(cards).size} distinct, expected ${52 - burns})`); break; }
            if (step > 400) { f.add(`${ctx}: hand did not end in 400 actions`); break; }
          }
          if (s.street !== 'over') break;
          hands++;
          if (sawAllIn) allInHands++;
          const end = s.endStacks!;
          // conservation
          f.check(sum(end) === sum(s.startStacks), () => `${ctx}: chips created or destroyed: ${sum(end)} vs ${sum(s!.startStacks)}`);
          f.check(Object.values(end).every((x) => x >= 0 && Number.isInteger(x)), () => `${ctx}: bad end stack ${JSON.stringify(end)}`);
          // independent payout oracle
          const folded = new Set(ids.filter((id) => s!.seats[id]!.folded));
          const totals = Object.fromEntries(ids.map((id) => [id, s!.seats[id]!.total]));
          const win = oraclePayout(ids, s.button, totals, folded, holeAtStart, s.board);
          for (const id of ids) {
            const want = s.seats[id]!.stack + win[id]!;
            f.check(end[id] === want, () => `${ctx}: payout for ${id} is ${end[id]}, oracle says ${want} (totals ${JSON.stringify(totals)}, folded ${[...folded]}, board ${s!.board})`);
          }
          if (s.showdown.length > 1) showdowns++;
          // the reveal never shows folded players, and shows every showdown player
          const v = E.viewFor(s, null);
          f.check(same((v.reveal ?? []).map((x) => x.id).sort(), s.showdown.map((x) => x.id).sort()), () => `${ctx}: reveal list differs from showdown`);
          // the ledger accepts it
          const input = E.result(s);
          const problems = poker.validate(setup, ids, input as never);
          if (problems.length) { f.add(`${ctx}: result invalid: ${problems}`); }
          else {
            const net = f.guard(`${ctx} score`, () => poker.score({ ...setup, chips: pick([1, 3, 100], r), moneyUnits: pick([1, 2, 50], r) }, ids, input as never));
            if (net) f.check(sum(net) === 0, () => `${ctx}: not zero-sum ${JSON.stringify(net)}`);
          }
          if (h === 0 && chain % 40 === 0) {
            // determinism
            const t = E.start(setup, ids, hseed, prev);
            f.check(same(t.seats, roundTrip(E.start(setup, ids, hseed, prev)).seats), () => `${ctx}: start not deterministic`);
          }
          prev = s;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] poker: ${hands} hands, ${actions} actions, ${showdowns} showdowns, ${allInHands} hands with an all-in`);
    f.done('poker simulation');
  });
});
