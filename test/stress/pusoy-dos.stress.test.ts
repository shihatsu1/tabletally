import { describe, it } from 'vitest';
import { mixSeed, shuffle } from '../../src/core/rng';
import { pusoyDos, type PusoyDosSetup } from '../../src/games/pusoy-dos';
import { classify, legalPlays, pusoyDosEngine as E, type PdMove, type PdState } from '../../src/games/pusoy-dos/engine';
import { MAX_AMOUNT } from '../../src/core/integer';
import { Failures, N, garbage, pick, randLevels, range, roundTrip, same, seeded, sum } from './harness';

// ---------------------------------------------------------------- an independent hand classifier (the oracle)
const power = (c: number): number => ((c % 13) + 1 === 1 ? 14 : (c % 13) + 1 === 2 ? 15 : (c % 13) + 1);
const suitStrength = (c: number): number => [1, 2, 3, 0][Math.floor(c / 13)] as number; // S H D C -> clubs lowest
const cardPow = (c: number): number => power(c) * 4 + suitStrength(c);
type Naive = { size: number; key: number[] } | null;
function naive(cards: number[]): Naive {
  const n = cards.length;
  if (new Set(cards).size !== n) return null;
  const pw = cards.map(power);
  const byRank: Record<number, number> = {};
  for (const p of pw) byRank[p] = (byRank[p] ?? 0) + 1;
  const counts = Object.values(byRank).sort((a, b) => b - a).join('');
  if (n === 1) return { size: 1, key: [cardPow(cards[0] as number)] };
  if (n === 2) return counts === '2' ? { size: 2, key: [Math.max(...cards.map(cardPow))] } : null;
  if (n === 3) return counts === '3' ? { size: 3, key: [pw[0] as number] } : null;
  if (n !== 5) return null;
  const sortedPw = [...pw].sort((a, b) => a - b);
  const straight = new Set(pw).size === 5 && (sortedPw[4] as number) - (sortedPw[0] as number) === 4;
  const flush = new Set(cards.map((c) => Math.floor(c / 13))).size === 1;
  const desc = [...cards].sort((a, b) => cardPow(b) - cardPow(a));
  if (straight && flush) return { size: 5, key: [5, cardPow(desc[0] as number)] };
  if (counts === '41') return { size: 5, key: [4, Number(Object.entries(byRank).find(([, v]) => v === 4)![0])] };
  if (counts === '32') return { size: 5, key: [3, Number(Object.entries(byRank).find(([, v]) => v === 3)![0])] };
  if (flush) return { size: 5, key: [2, ...desc.map(cardPow)] };
  if (straight) return { size: 5, key: [1, cardPow(desc[0] as number)] };
  return null;
}
const cmpKey = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0) ? -1 : 1;
  return 0;
};

function subsetsOf(items: number[], k: number): number[][] {
  const out: number[][] = [];
  const pickK: number[] = [];
  const go = (s: number): void => {
    if (pickK.length === k) { out.push([...pickK]); return; }
    for (let i = s; i <= items.length - (k - pickK.length); i++) { pickK.push(items[i] as number); go(i + 1); pickK.pop(); }
  };
  go(0);
  return out;
}

// ---------------------------------------------------------------- privacy: the view may depend only on what the viewer can know
function scramble(s: PdState, viewer: string | null, r: () => number): PdState {
  const known = new Set<number>([...s.played, ...(viewer ? (s.hands[viewer] as number[]) : [])]);
  const unknownHolders = s.players.filter((id) => id !== viewer);
  const pool = unknownHolders.flatMap((id) => s.hands[id] as number[]);
  const mixed = shuffle(pool, r);
  const hands = { ...s.hands };
  let at = 0;
  for (const id of unknownHolders) {
    const k = (s.hands[id] as number[]).length;
    hands[id] = mixed.slice(at, at + k);
    at += k;
  }
  void known;
  return { ...s, hands };
}

describe('Pusoy Dos stress', () => {
  it('hand classification and legal plays agree with an independent brute-force oracle', () => {
    const f = new Failures();
    const r = seeded(101);
    for (let t = 0; t < N(6000); t++) {
      // build biased random sets so pairs, triples, straights, flushes and full houses actually occur
      const ranks = shuffle(range(13), r).slice(0, 4 + (r() % 4));
      const deck = range(52).filter((c) => ranks.includes(c % 13) || r() % 6 === 0);
      const size = pick([1, 2, 3, 5, 5, 5], r);
      const cards = shuffle(deck, r).slice(0, size);
      const a = classify(cards);
      const b = naive(cards);
      f.check((a === null) === (b === null), () => `classify/naive disagree on ${cards}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      if (a && b) {
        const other = shuffle(deck, r).slice(0, size);
        const a2 = classify(other);
        const b2 = naive(other);
        if (a2 && b2) {
          const x = Math.sign(a.rank - a2.rank);
          const y = cmpKey(b.key, b2.key);
          f.check(x === y, () => `ordering disagrees: ${cards} vs ${other}: engine ${x}, oracle ${y}`);
        }
      }
    }
    // legalPlays against brute force
    for (let t = 0; t < N(400); t++) {
      const hand = shuffle(range(52), r).slice(0, 5 + (r() % 9));
      const leadSet = r() % 3 === 0 ? null : shuffle(range(52), r).slice(0, pick([1, 2, 3, 5], r));
      const lead = leadSet ? classify(leadSet) : null;
      const leadN = leadSet ? naive(leadSet) : null;
      if (leadSet && !lead) continue;
      const got = legalPlays(hand, lead, null).map((p) => [...p.cards].sort((x, y) => x - y).join(',')).sort();
      const sizes = leadN ? [leadN.size] : [1, 2, 3, 5];
      const want: string[] = [];
      for (const k of sizes) for (const sub of subsetsOf(hand, k)) {
        const nv = naive(sub);
        if (nv && (!leadN || cmpKey(nv.key, leadN.key) > 0)) want.push([...sub].sort((x, y) => x - y).join(','));
      }
      want.sort();
      f.check(same(got, want), () => `legalPlays mismatch for hand ${hand} lead ${leadSet}: got ${got.length} want ${want.length}`);
    }
    f.done('pusoy-dos oracle');
  });

  it('plays tens of thousands of hands across every option, player count and bot mix', () => {
    const f = new Failures();
    const scorings = ['winner-take-all', 'cards-left', 'placement'] as const;
    const deuces = ['off', 'pow2', 'double-once'] as const;
    const settlements = ['winner-only', 'pairwise'] as const;
    let hands = 0;
    let moves = 0;
    for (const scoring of scorings) for (const deuce of deuces) for (const settlement of settlements) for (const startingHand of [13, 17]) for (const n of [2, 3, 4]) {
      const setup: PusoyDosSetup = { ...pusoyDos.defaultSetup(n), scoring, deuce, settlement, startingHand };
      // a hand size the deck cannot deal to everyone is refused (4 x 17 > 52), and is never played
      if (startingHand * n > 52) {
        f.check(pusoyDos.validateSetup(setup, n).length > 0, () => `an undealable hand size was accepted: ${startingHand} x ${n}`);
        continue;
      }
      f.check(pusoyDos.validateSetup(setup, n).length === 0, () => `default-derived setup invalid: ${JSON.stringify(setup)} ${pusoyDos.validateSetup(setup, n)}`);
      const ids = ['A', 'B', 'C', 'D'].slice(0, n);
      const games = N(200);
      for (let g = 0; g < games; g++) {
        const seed = mixSeed(g + 1, scoring.length * 31 + deuce.length * 7 + settlement.length + startingHand + n * 1000);
        const r = seeded(seed);
        const levels = randLevels(n, r);
        const ctx = `seed=${seed} ${scoring}/${deuce}/${settlement}/${startingHand}/${n}p ${levels}`;
        let s: PdState | undefined = f.guard(ctx + ' start', () => E.start(setup, ids, seed));
        if (!s) continue;
        const size = Math.min(startingHand, Math.floor(52 / n));
        let step = 0;
        while (!s.done) {
          const who = E.toAct(s);
          if (!who) { f.add(`${ctx}: no one to act but not done`); break; }
          const view = E.viewFor(s, who);
          const level = levels[ids.indexOf(who)]!;
          const move = f.guard(`${ctx} bot`, () => E.bot(view, level, mixSeed(seed, step)));
          if (!move) break;
          const problems = E.validate(s, who, move);
          if (problems.length) { f.add(`${ctx}: ${level} bot made an illegal move ${JSON.stringify(move)}: ${problems}`); break; }
          const tmo = E.validate(s, who, E.timeoutMove(view));
          if (tmo.length) f.add(`${ctx}: timeoutMove illegal: ${tmo}`);
          // garbage moves are rejected, never throw, never change state
          const before = JSON.stringify(s);
          for (let k = 0; k < 2; k++) {
            const junk = garbage(r);
            const res = f.guard(`${ctx} garbage ${JSON.stringify(junk)}`, () => E.validate(s!, who, junk));
            f.check(res === undefined || Array.isArray(res), () => `${ctx}: validate returned non-array`);
            if (res && res.length === 0) f.add(`${ctx}: garbage accepted: ${JSON.stringify(junk)}`);
          }
          f.check(JSON.stringify(s) === before, () => `${ctx}: validate changed the state`);
          // privacy: the view must not depend on other players' hidden hands
          if (step % 7 === 0) {
            const viewer = pick([...ids, null as unknown as string], r) || null;
            const a = E.viewFor(s, viewer);
            const b = E.viewFor(scramble(s, viewer, r), viewer);
            f.check(same(a, b), () => `${ctx}: view for ${viewer} depends on hidden cards`);
          }
          s = roundTrip(E.apply(s, who, move)); // the Durable Object stores JSON, so test what survives it
          step++;
          moves++;
          // conservation
          const held = ids.reduce((a, id) => a + (s!.hands[id] as number[]).length, 0);
          if (held + s.played.length !== size * n) { f.add(`${ctx}: cards lost or duplicated (${held} + ${s.played.length} != ${size * n})`); break; }
          const all = [...ids.flatMap((id) => s!.hands[id] as number[]), ...s.played];
          if (new Set(all).size !== all.length) { f.add(`${ctx}: a card exists twice`); break; }
          if (new Set(s.out).size !== s.out.length) { f.add(`${ctx}: a player went out twice`); break; }
          if (step > 400) { f.add(`${ctx}: hand did not end in 400 moves`); break; }
        }
        if (!s.done) continue;
        hands++;
        const res = E.result(s);
        if (!res) { f.add(`${ctx}: finished but no result`); continue; }
        const stake = pick([1, 7, 50, 12345], r);
        const input = { ...res, stake } as never;
        const problems = pusoyDos.validate(setup, ids, input);
        if (problems.length) { f.add(`${ctx}: result invalid: ${problems} ${JSON.stringify(res)}`); continue; }
        const net = f.guard(`${ctx} score`, () => pusoyDos.score(setup, ids, input));
        if (net) {
          f.check(sum(net) === 0, () => `${ctx}: not zero-sum ${JSON.stringify(net)}`);
          f.check(Object.values(net).every((v) => Math.abs(v) <= MAX_AMOUNT), () => `${ctx}: amount over the limit`);
        }
        // the final view reveals hands to everyone; that must be the only difference
        f.check(E.viewFor(s, 'A').done === true, () => `${ctx}: final view not done`);
        if (g % 25 === 0) {
          // determinism: the same seed and levels give the same game
          let t: PdState = E.start(setup, ids, seed);
          let st = 0;
          while (!t.done && st < 400) { const who = E.toAct(t)!; t = E.apply(t, who, E.bot(E.viewFor(t, who), levels[ids.indexOf(who)]!, mixSeed(seed, st++))); }
          f.check(same(t, s), () => `${ctx}: not deterministic`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] pusoy-dos: ${hands} hands, ${moves} moves`);
    f.done('pusoy-dos simulation');
  });
});
