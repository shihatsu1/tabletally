import { describe, it } from 'vitest';
import { mixSeed, shuffle } from '../../src/core/rng';
import { MAX_AMOUNT } from '../../src/core/integer';
import { makeCard } from '../../src/games/cards';
import {
  NATURAL_DEFAULTS, NATURAL_KEYS, NATURAL_WIKIPEDIA, ROYALTY_PRESETS, defaultSetup, pusoy, type NaturalKey, type PusoyInput, type PusoySetup, type RowKey,
} from '../../src/games/pusoy';
import {
  arrangementProblem, bestArrangement, eval3, eval5, middleCoversFront, naturalsOf, pusoyEngine as E, royaltiesOf, type Arrangement, type PsMove, type PsState,
} from '../../src/games/pusoy/engine';
import { Failures, N, garbage, pick, randLevels, range, roundTrip, same, seeded, sum } from './harness';

const C = (suit: number, rank: number) => makeCard(suit, rank);

// ---------------------------------------------------------------- independent poker-hand oracle
const rv = (c: number): number => ((c % 13) + 1 === 1 ? 14 : (c % 13) + 1);
type NH = { cat: number; tb: number[] };
function naiveHand(cards: number[]): NH {
  const ranks = cards.map(rv);
  const count: Record<number, number> = {};
  for (const x of ranks) count[x] = (count[x] ?? 0) + 1;
  const groups = Object.entries(count).map(([k, v]) => ({ r: Number(k), n: v })).sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.length === 5 && new Set(cards.map((c) => Math.floor(c / 13))).size === 1;
  const sortedR = [...ranks].sort((a, b) => b - a);
  const uniq = [...new Set(ranks)];
  let straightTop = 0;
  if (cards.length === 5 && uniq.length === 5) {
    if (sortedR[0]! - sortedR[4]! === 4) straightTop = sortedR[0]!;
    else if (sortedR.join() === '14,5,4,3,2') straightTop = 5;
  }
  const pattern = groups.map((g) => g.n).join('');
  const lead = groups.map((g) => g.r);
  if (straightTop && flush) return { cat: 8, tb: [straightTop] };
  if (pattern === '41') return { cat: 7, tb: lead };
  if (pattern === '32') return { cat: 6, tb: lead };
  if (flush) return { cat: 5, tb: sortedR };
  if (straightTop) return { cat: 4, tb: [straightTop] };
  if (pattern === '311' || pattern === '3') return { cat: 3, tb: lead };
  if (pattern === '221') return { cat: 2, tb: lead };
  if (pattern === '2111' || pattern === '21') return { cat: 1, tb: lead };
  return { cat: 0, tb: lead };
}
const cmpNH = (a: NH, b: NH): number => {
  if (a.cat !== b.cat) return a.cat < b.cat ? -1 : 1;
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) if ((a.tb[i] ?? 0) !== (b.tb[i] ?? 0)) return (a.tb[i] ?? 0) < (b.tb[i] ?? 0) ? -1 : 1;
  return 0;
};
/** middle (5) at least as strong as front (3): category first, then the deciding ranks. */
const naiveMiddleOk = (m: number[], f: number[]): boolean => {
  const a = naiveHand(m);
  const b = naiveHand(f);
  if (a.cat !== b.cat) return a.cat > b.cat;
  for (let i = 0; i < Math.min(a.tb.length, b.tb.length); i++) if (a.tb[i] !== b.tb[i]) return a.tb[i]! > b.tb[i]!;
  return true;
};
const naiveValid = (a: Arrangement): boolean => cmpNH(naiveHand(a.back), naiveHand(a.middle)) >= 0 && naiveMiddleOk(a.middle, a.front);

function subsets(items: number[], k: number): number[][] {
  const out: number[][] = [];
  const pk: number[] = [];
  const go = (s: number): void => {
    if (pk.length === k) { out.push([...pk]); return; }
    for (let i = s; i <= items.length - (k - pk.length); i++) { pk.push(items[i] as number); go(i + 1); pk.pop(); }
  };
  go(0);
  return out;
}
const without = (a: number[], b: number[]): number[] => a.filter((x) => !b.includes(x));

// ---------------------------------------------------------------- independent natural-hand detectors
const suitOf = (c: number): number => Math.floor(c / 13);
function partitionExists(hand: number[], ok5: (c: number[]) => boolean, ok3: (c: number[]) => boolean): boolean {
  for (const a of subsets(hand, 5)) {
    if (!ok5(a)) continue;
    const rest = without(hand, a);
    for (const b of subsets(rest, 5)) if (ok5(b) && ok3(without(rest, b))) return true;
  }
  return false;
}
function naiveNaturals(hand: number[]): Set<NaturalKey> {
  const out = new Set<NaturalKey>();
  const ranks = hand.map(rv);
  const cnt: Record<number, number> = {};
  for (const x of ranks) cnt[x] = (cnt[x] ?? 0) + 1;
  const sameS = (c: number[]) => new Set(c.map(suitOf)).size === 1;
  const run3 = (c: number[]) => { const r = c.map(rv).sort((a, b) => a - b); return (r[2]! - r[0]! === 2 && new Set(r).size === 3) || r.join() === '2,3,14'; };
  if (partitionExists(hand, sameS, sameS)) out.add('threeFlushes');
  if (partitionExists(hand, (c) => { const k = naiveHand(c).cat; return k === 4 || k === 8; }, run3)) out.add('threeStraights');
  if (Object.values(cnt).reduce((a, n) => a + Math.floor(n / 2), 0) >= 6) out.add('sixPairs');
  if (Object.values(cnt).filter((n) => n >= 3).length >= 4) out.add('fourTriplets');
  if (hand.every((c) => [1, 2].includes(suitOf(c))) || hand.every((c) => [0, 3].includes(suitOf(c)))) out.add('sameColour');
  if (ranks.every((x) => x <= 8) || ranks.every((x) => x >= 8)) out.add('allLowOrHigh');
  if (Object.values(cnt).filter((n) => n === 4).length >= 3) out.add('threeQuads');
  if (partitionExists(hand, (c) => naiveHand(c).cat === 8, (c) => sameS(c) && run3(c))) out.add('threeStraightFlushes');
  if (ranks.filter((x) => x >= 11 && x <= 13).length === 12) out.add('twelveRoyals');
  if (Object.keys(cnt).length === 13) { out.add(sameS(hand) ? 'pureDragon' : 'dragon'); if (sameS(hand)) out.add('dragon'); }
  return out;
}

// ---------------------------------------------------------------- privacy
function scramble(s: PsState, viewer: string | null, r: () => number): PsState {
  const others = s.players.filter((id) => id !== viewer);
  const mixed = shuffle(others.flatMap((id) => s.hands[id] as number[]), r);
  let at = 0;
  const hands = { ...s.hands };
  const sets = { ...s.sets };
  const eligible = { ...s.eligible };
  for (const id of others) {
    const h = mixed.slice(at, at + 13);
    at += 13;
    hands[id] = h;
    if (s.sets[id]) sets[id] = { back: h.slice(0, 5), middle: h.slice(5, 10), front: h.slice(10) };
    eligible[id] = [];
  }
  return { ...s, hands, sets, eligible };
}

describe('Pusoy stress', () => {
  it('hand ranking, row comparison, royalties and arrangement search agree with independent oracles', () => {
    const f = new Failures();
    const r = seeded(404);
    for (let t = 0; t < N(20000); t++) {
      const ranks = shuffle(range(13), r).slice(0, 3 + (r() % 6));
      const deck = range(52).filter((c) => ranks.includes(c % 13) || r() % 7 === 0);
      const a = shuffle(deck, r).slice(0, 5);
      const b = shuffle(deck, r).slice(0, 5);
      if (a.length < 5 || b.length < 5) continue;
      f.check(Math.sign(eval5(a).key - eval5(b).key) === cmpNH(naiveHand(a), naiveHand(b)), () => `eval5 ordering: ${a} vs ${b}`);
      f.check(eval5(a).cat === naiveHand(a).cat, () => `eval5 category: ${a}: ${eval5(a).cat} vs ${naiveHand(a).cat}`);
      const f3 = shuffle(deck, r).slice(0, 3);
      const g3 = shuffle(deck, r).slice(0, 3);
      f.check(Math.sign(eval3(f3).key - eval3(g3).key) === cmpNH(naiveHand(f3), naiveHand(g3)), () => `eval3 ordering: ${f3} vs ${g3}`);
      f.check(middleCoversFront(eval5(a), eval3(f3)) === naiveMiddleOk(a, f3), () => `middleCoversFront ${a} vs ${f3}`);
    }
    // arrangement validity and completeness against brute force over all 72,072 arrangements
    for (let t = 0; t < N(60); t++) {
      const hand = shuffle(range(52), r).slice(0, 13);
      const obj = (x: { b: { cat: number }; m: { cat: number }; f: { cat: number } }): number => x.b.cat * 100 + x.m.cat * 10 + x.f.cat;
      const got = bestArrangement(hand, obj);
      f.check(arrangementProblem(got, hand) === null && naiveValid(got), () => `bestArrangement invalid for ${hand}`);
      let best = -1;
      for (const back of subsets(hand, 5)) for (const mid of subsets(without(hand, back), 5)) {
        const arr: Arrangement = { back, middle: mid, front: without(without(hand, back), mid) };
        if (!naiveValid(arr)) continue;
        best = Math.max(best, naiveHand(back).cat * 100 + naiveHand(mid).cat * 10 + naiveHand(arr.front).cat);
      }
      const gotScore = naiveHand(got.back).cat * 100 + naiveHand(got.middle).cat * 10 + naiveHand(got.front).cat;
      f.check(gotScore === best, () => `bestArrangement not optimal for ${hand}: ${gotScore} vs ${best}`);
    }
    // royalties
    for (let t = 0; t < N(4000); t++) {
      const ranks = shuffle(range(13), r).slice(0, 3 + (r() % 4));
      const deck = range(52).filter((c) => ranks.includes(c % 13) || r() % 6 === 0);
      const d = shuffle(deck.length >= 13 ? deck : range(52), r).slice(0, 13);
      const arr = bestArrangement(d, ({ b, m, f: fr }) => b.key * 0.5 + m.key + fr.key * 3 + r() % 50);
      const got = royaltiesOf(arr);
      const m = naiveHand(arr.middle);
      const bk = naiveHand(arr.back);
      const royal = (c: number[]) => naiveHand(c).cat === 8 && naiveHand(c).tb[0] === 14;
      const want = {
        ...(naiveHand(arr.front).cat === 3 ? { front: 'trips' } : {}),
        ...(royal(arr.middle) ? { middle: 'royal' } : m.cat === 8 ? { middle: 'straightFlush' } : m.cat === 7 ? { middle: 'quads' } : m.cat === 6 ? { middle: 'fullHouse' } : {}),
        ...(royal(arr.back) ? { back: 'royal' } : bk.cat === 8 ? { back: 'straightFlush' } : bk.cat === 7 ? { back: 'quads' } : {}),
      };
      f.check(same(got, want), () => `royalties: ${JSON.stringify(got)} vs ${JSON.stringify(want)} for ${JSON.stringify(arr)}`);
    }
    f.done('pusoy oracle');
  });

  it('natural hands: every one is detected when planted, and detection matches an independent partition search on random and skewed hands', () => {
    const f = new Failures();
    const r = seeded(505);
    // planted deals for every natural
    const planted: Record<NaturalKey, number[][]> = {
      threeFlushes: [
        [...[1, 3, 5, 7, 9].map((x) => C(0, x)), ...[2, 4, 6, 8, 10].map((x) => C(1, x)), C(2, 1), C(2, 5), C(2, 9)],
        [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => C(0, x)), C(1, 2), C(1, 6), C(1, 10)], // two rows share a suit
        [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((x) => C(3, x))],
      ],
      threeStraights: [
        [C(0, 1), C(1, 2), C(2, 3), C(3, 4), C(0, 5), C(1, 6), C(2, 7), C(3, 8), C(0, 9), C(1, 10), C(2, 11), C(3, 12), C(0, 13)].slice(0, 13),
        [C(0, 1), C(1, 2), C(2, 3), C(3, 4), C(0, 5), C(1, 9), C(2, 10), C(3, 11), C(0, 12), C(1, 13), C(2, 12), C(3, 11), C(1, 1)].slice(0, 8).concat([C(0, 6), C(1, 7), C(2, 8), C(3, 7), C(0, 8)]).slice(0, 13),
      ],
      sixPairs: [[...[2, 3, 4, 5, 6, 7].flatMap((x) => [C(0, x), C(1, x)]), C(2, 13)]],
      fourTriplets: [[...[2, 3, 4, 5].flatMap((x) => [C(0, x), C(1, x), C(2, x)]), C(3, 13)]],
      sameColour: [[...[1, 3, 5, 7, 9, 11, 13].map((x) => C(1, x)), ...[2, 4, 6, 8, 10, 12].map((x) => C(2, x))]],
      allLowOrHigh: [[...[2, 3, 4, 5, 6, 7, 8].map((x) => C(0, x)), ...[2, 3, 4, 5, 6, 7].map((x) => C(1, x))], [...[8, 9, 10, 11, 12, 13, 1].map((x) => C(0, x)), ...[8, 9, 10, 11, 12, 13].map((x) => C(1, x))]],
      threeQuads: [[...[2, 3, 4].flatMap((x) => [0, 1, 2, 3].map((s) => C(s, x))), C(0, 13)]],
      threeStraightFlushes: [
        [...[1, 2, 3, 4, 5].map((x) => C(0, x)), ...[6, 7, 8, 9, 10].map((x) => C(1, x)), C(2, 11), C(2, 12), C(2, 13)],
        [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => C(0, x)), C(1, 11), C(1, 12), C(1, 13)],
      ],
      twelveRoyals: [[...[11, 12, 13].flatMap((x) => [0, 1, 2, 3].map((s) => C(s, x))), C(0, 2)]],
      dragon: [Array.from({ length: 13 }, (_, i) => C(i % 4, i + 1))],
      pureDragon: [Array.from({ length: 13 }, (_, i) => C(2, i + 1))],
    };
    for (const key of NATURAL_KEYS) {
      for (const hand of planted[key]) {
        if (new Set(hand).size !== 13) { f.add(`harness: planted ${key} hand invalid ${hand}`); continue; }
        f.check(naiveNaturals(hand).has(key), () => `ORACLE says planted ${key} hand is not ${key}: ${hand}`);
        f.check(naturalsOf(hand).includes(key), () => `naturalsOf missed a planted ${key}: ${hand}`);
      }
    }
    // random and skewed hands, both directions against the independent partition search
    let checked = 0;
    for (let t = 0; t < N(3000); t++) {
      const mode = t % 5;
      let hand: number[];
      if (mode === 0) hand = shuffle(range(52), r).slice(0, 13);
      else if (mode === 1) hand = shuffle(range(52).filter((c) => suitOf(c) < 2), r).slice(0, 13); // two suits
      else if (mode === 2) hand = shuffle(range(52).filter((c) => c % 13 < 6 || r() % 9 === 0), r).slice(0, 13); // low cards
      else if (mode === 3) hand = [...shuffle(range(13).map((x) => C(suitOf(shuffle(range(4), r)[0]!), x + 1)), r).slice(0, 10), ...shuffle(range(52), r).slice(0, 3)]; // runs
      else hand = shuffle(range(52).filter((c) => c % 13 === 0 || c % 13 === 12 || c % 13 === 11 || c % 13 === 10 || r() % 5 === 0), r).slice(0, 13); // high cards
      if (new Set(hand).size !== 13) continue;
      const want = naiveNaturals(hand);
      const got = new Set(naturalsOf(hand));
      checked++;
      f.check(same([...want].sort(), [...got].sort()), () => `naturals differ for ${hand}: engine ${[...got]} oracle ${[...want]}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] pusoy naturals: ${checked} random hands compared`);
    f.done('pusoy naturals');
  });

  it('plays thousands of hands across systems, royalty tables, natural lists, player counts and bot mixes', () => {
    const f = new Failures();
    const setups: PusoySetup[] = [];
    for (const system of ['1-6', '2-4'] as const) for (const royalties of [true, false]) for (const naturals of [true, false]) for (const royaltyMode of ['all', 'on-win'] as const) for (const rp of ['classic', 'wikipedia', 'playtime'] as const) for (const nat of [NATURAL_DEFAULTS, NATURAL_WIKIPEDIA]) {
      setups.push({
        ...defaultSetup(), system, majorityBonus: system === '2-4' ? 1 : 0, scoopBonus: system === '1-6' ? 3 : 0, royalties, naturals, royaltyMode, royaltyPreset: rp,
        royalty: { ...ROYALTY_PRESETS[rp] }, natural: { ...nat },
      });
    }
    let hands = 0;
    let withNatural = 0;
    for (const [si, setup] of setups.entries()) {
      f.check(pusoy.validateSetup(setup, 4).length === 0, () => `setup invalid ${pusoy.validateSetup(setup, 4)}`);
      for (const n of [2, 3, 4]) {
        const ids = ['A', 'B', 'C', 'D'].slice(0, n);
        const games = N(12);
        for (let g = 0; g < games; g++) {
          const seed = mixSeed(g + 1, si * 101 + n);
          const r = seeded(seed);
          const levels = randLevels(n, r);
          const ctx = `seed=${seed} setup#${si} ${n}p ${levels}`;
          let s: PsState | undefined = f.guard(ctx + ' start', () => E.start(setup, ids, seed));
          if (!s) continue;
          const order = shuffle(ids, r);
          let step = 0;
          for (const who of order) {
            const view = E.viewFor(s, who);
            // each player: a bot, a random valid arrangement, or (if allowed) a natural
            const how = r() % 3;
            let move: PsMove | undefined;
            if (how === 0) move = f.guard(`${ctx} bot`, () => E.bot(view, levels[ids.indexOf(who)]!, mixSeed(seed, step)));
            else if (how === 1 || !view.eligible.length) move = { t: 'set', ...bestArrangement(view.hand, ({ b, m, f: fr }) => b.key * (r() % 7) + m.key * (r() % 5) + fr.key * (r() % 3) + (r() % 1000)) };
            else move = { t: 'natural', key: pick(view.eligible, r) };
            if (!move) break;
            const problems = E.validate(s, who, move);
            if (problems.length) { f.add(`${ctx}: illegal ${move.t} for ${who}: ${problems}`); break; }
            const tmo = E.validate(s, who, E.timeoutMove(view));
            if (tmo.length) f.add(`${ctx}: timeoutMove illegal: ${tmo}`);
            const before = JSON.stringify(s);
            for (let k = 0; k < 2; k++) {
              const junk = garbage(r);
              const res = f.guard(`${ctx} garbage`, () => E.validate(s!, who, junk));
              if (res && res.length === 0) f.add(`${ctx}: garbage accepted ${JSON.stringify(junk)}`);
            }
            f.check(JSON.stringify(s) === before, () => `${ctx}: validate changed state`);
            if (!s.done) {
              const viewer = pick([...ids, null as unknown as string], r) || null;
              f.check(same(E.viewFor(s, viewer), E.viewFor(scramble(s, viewer, r), viewer)), () => `${ctx}: view for ${viewer} depends on hidden hands/rows`);
            }
            s = roundTrip(E.apply(s, who, move));
            step++;
          }
          if (!s.done) { f.add(`${ctx}: not done after everyone acted`); continue; }
          hands++;
          const res = E.result(s);
          if (!res) { f.add(`${ctx}: done but no result`); continue; }
          if ((res as { naturals?: object }).naturals) withNatural++;
          // row grouping against the independent comparator
          const ranked = ids.filter((id) => s!.sets[id]);
          for (const row of ['front', 'middle', 'back'] as RowKey[]) {
            const want: string[][] = [];
            const sorted = [...ranked].sort((a, b) => cmpNH(naiveHand((s!.sets[b] as Arrangement)[row]), naiveHand((s!.sets[a] as Arrangement)[row])));
            for (const id of sorted) {
              const last = want[want.length - 1];
              if (last && cmpNH(naiveHand((s.sets[last[0]!] as Arrangement)[row]), naiveHand((s.sets[id] as Arrangement)[row])) === 0) last.push(id);
              else want.push([id]);
            }
            const got = (res as { rows: Record<RowKey, string[][]> }).rows[row];
            f.check(same(got.map((x) => [...x].sort()), want.map((x) => [...x].sort())), () => `${ctx}: ${row} ranking ${JSON.stringify(got)} vs oracle ${JSON.stringify(want)}`);
          }
          const input = { ...res, stake: pick([1, 3, 250], r) } as unknown as PusoyInput;
          const problems = pusoy.validate(setup, ids, input);
          if (problems.length) { f.add(`${ctx}: result invalid: ${problems} ${JSON.stringify(res)}`); continue; }
          const net = f.guard(`${ctx} score`, () => pusoy.score(setup, ids, input));
          if (net) {
            f.check(sum(net) === 0, () => `${ctx}: not zero-sum ${JSON.stringify(net)}`);
            f.check(Object.values(net).every((v) => Math.abs(v) <= MAX_AMOUNT), () => `${ctx}: over limit`);
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] pusoy: ${hands} hands (${withNatural} with a natural declared)`);
    f.done('pusoy simulation');
  });
});
