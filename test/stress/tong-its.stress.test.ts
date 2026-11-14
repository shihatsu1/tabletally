import { describe, it } from 'vitest';
import { mixSeed, shuffle } from '../../src/core/rng';
import { MAX_AMOUNT } from '../../src/core/integer';
import { rankOf, suitOf } from '../../src/games/cards';
import { PRESETS, tongIts, type TongItsInput, type TongItsSetup } from '../../src/games/tong-its';
import { bestDeadwood, pointsOf } from '../../src/games/tong-its/hand';
import { canSapaw, meldKind, tongItsEngine as E, type TiMove, type TiState } from '../../src/games/tong-its/engine';
import { Failures, N, garbage, pick, randLevels, range, roundTrip, same, seeded, sum } from './harness';

const players = ['A', 'B', 'C'];

// ---------------------------------------------------------------- independent brute force: fewest deadwood points
function isMeld(cards: number[]): boolean {
  if (cards.length < 3) return false;
  const ranks = cards.map(rankOf);
  if (cards.length <= 4 && new Set(ranks).size === 1 && new Set(cards.map(suitOf)).size === cards.length) return true;
  if (new Set(cards.map(suitOf)).size !== 1) return false;
  const sorted = [...ranks].sort((a, b) => a - b);
  return sorted.every((r, i) => i === 0 || r === (sorted[i - 1] as number) + 1);
}
function bruteDeadwood(cards: number[]): number {
  if (cards.length === 0) return 0;
  const [first, ...rest] = cards as [number, ...number[]];
  let best = pointsOf(first) + bruteDeadwood(rest);
  // every meld that contains `first`, built from subsets of the rest (hands are small, so 2^n is fine)
  const n = rest.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pickSet = [first, ...rest.filter((_, i) => mask & (1 << i))];
    if (pickSet.length >= 3 && isMeld(pickSet)) {
      const left = rest.filter((_, i) => !(mask & (1 << i)));
      best = Math.min(best, bruteDeadwood(left));
    }
  }
  return best;
}

// ---------------------------------------------------------------- every legal move (an exhaustive oracle for "is the player stuck?")
function legalMoves(s: TiState, who: string): TiMove[] {
  const out: TiMove[] = [];
  const hand = s.hands[who] as number[];
  const consider = (m: TiMove): void => { if (E.validate(s, who, m).length === 0) out.push(m); };
  if (s.phase === 'draw') {
    consider({ t: 'draw', from: 'stock' });
    consider({ t: 'draw', from: 'discard' });
    consider({ t: 'fight' });
  } else if (s.phase === 'fight') {
    consider({ t: 'respond', challenge: true });
    consider({ t: 'respond', challenge: false });
  } else if (s.phase === 'play') {
    for (const c of hand) consider({ t: 'discard', card: c });
    for (const m of s.melds) for (const c of hand) consider({ t: 'sapaw', meld: m.id, card: c });
    const k = hand.length;
    for (let size = 3; size <= Math.min(5, k); size++) {
      const idx: number[] = [];
      const go = (st: number): void => {
        if (idx.length === size) {
          const cards = idx.map((i) => hand[i] as number);
          if (isMeld(cards)) {
            consider({ t: 'meld', cards });
            if (size === 4 && meldKind(cards) === 'set') consider({ t: 'meld', cards, hidden: true });
          }
          return;
        }
        for (let i = st; i < k; i++) { idx.push(i); go(i + 1); idx.pop(); }
      };
      go(0);
    }
  }
  return out;
}

// ---------------------------------------------------------------- privacy
function scramble(s: TiState, viewer: string | null, r: () => number): TiState {
  const others = s.players.filter((id) => id !== viewer);
  const hiddenMelds = s.melds.filter((m) => m.hidden && m.owner !== viewer);
  const pool = [...others.flatMap((id) => s.hands[id] as number[]), ...s.stock, ...hiddenMelds.flatMap((m) => m.cards)];
  const mixed = shuffle(pool, r);
  let at = 0;
  const take = (k: number): number[] => { const x = mixed.slice(at, at + k); at += k; return x; };
  const hands = { ...s.hands };
  for (const id of others) hands[id] = take((s.hands[id] as number[]).length);
  const melds = s.melds.map((m) => (m.hidden && m.owner !== viewer ? { ...m, cards: take(m.cards.length) } : m));
  const stock = take(s.stock.length);
  return { ...s, hands, melds, stock };
}

describe('Tong-its stress', () => {
  it('deadwood solver and meld helpers agree with an independent brute force', () => {
    const f = new Failures();
    const r = seeded(202);
    for (let t = 0; t < N(1500); t++) {
      // heavily biased hands so melds actually exist
      const ranks = shuffle(range(13), r).slice(0, 3 + (r() % 3));
      const pool = range(52).filter((c) => ranks.includes(c % 13) || ranks.includes((c % 13) + 1) || r() % 8 === 0);
      const hand = shuffle(pool, r).slice(0, 5 + (r() % 7));
      f.check(bestDeadwood(hand) === bruteDeadwood(hand), () => `deadwood mismatch for ${hand}: ${bestDeadwood(hand)} vs ${bruteDeadwood(hand)}`);
    }
    for (let t = 0; t < N(4000); t++) {
      const cards = shuffle(range(52), r).slice(0, 3 + (r() % 4));
      const kind = meldKind(cards);
      f.check((kind !== null) === isMeld(cards), () => `meldKind mismatch for ${cards}`);
      if (kind) {
        const card = pick(range(52).filter((c) => !cards.includes(c)), r);
        f.check(canSapaw(kind, cards, card) === (meldKind([...cards, card]) === kind), () => `canSapaw mismatch for ${cards} + ${card}`);
      }
    }
    f.done('tong-its oracle');
  });

  it('plays thousands of hands: presets, custom payments, every bot mix, a random walker, deadlock and privacy checks', () => {
    const f = new Failures();
    const r0 = seeded(303);
    const custom = (): TongItsSetup => ({
      preset: 'custom', winChips: 1 + (r0() % 5), tongitsChips: r0() % 9, tongitsMode: pick(['replace', 'add'] as const, r0), challengeChips: r0() % 9,
      challengeMode: pick(['replace', 'add'] as const, r0), burnedChips: r0() % 5, aceChips: r0() % 4, secretChips: r0() % 6, longRunChips: r0() % 5,
      sagasaChips: r0() % 4, potAnte: 1 + (r0() % 5),
    });
    const configs: TongItsSetup[] = [PRESETS.pagat, PRESETS['tongits-go'], ...range(10).map(custom)];
    let hands = 0;
    let moves = 0;
    let walkerSteps = 0;
    for (const [ci, setup] of configs.entries()) {
      f.check(tongIts.validateSetup(setup, 3).length === 0, () => `setup invalid: ${JSON.stringify(setup)} ${tongIts.validateSetup(setup, 3)}`);
      const history: TongItsInput[] = [];
      const games = N(500);
      for (let g = 0; g < games; g++) {
        const seed = mixSeed(g + 1, ci * 7919 + 13);
        const r = seeded(seed);
        const walker = g % 3 === 0; // a third of the hands are played by a random walker over ALL legal moves
        const levels = randLevels(3, r);
        const ctx = `seed=${seed} cfg=${ci} ${walker ? 'walker' : levels.join(',')}`;
        let s: TiState | undefined = f.guard(ctx + ' start', () => E.start(setup, players, seed));
        if (!s) continue;
        let step = 0;
        while (s.phase !== 'over') {
          const who = E.toAct(s);
          if (!who) { f.add(`${ctx}: nobody to act in phase ${s.phase}`); break; }
          const view = E.viewFor(s, who);
          let move: TiMove | undefined;
          if (walker) {
            const legal = legalMoves(s, who);
            walkerSteps++;
            if (legal.length === 0) { f.add(`${ctx}: DEADLOCK, ${who} has no legal move in phase ${s.phase} (mustMeld=${s.mustMeld})`); break; }
            // lean toward drawing, melding and discarding so the hand finishes; sometimes a fight
            const weights = legal.map((m) => (m.t === 'fight' ? 0.3 : m.t === 'respond' ? 1 : m.t === 'discard' ? 1.2 : 1));
            let x = (r() % 10000) / 10000 * weights.reduce((a, b) => a + b, 0);
            move = legal[legal.length - 1];
            for (let i = 0; i < legal.length; i++) { x -= weights[i] as number; if (x <= 0) { move = legal[i]; break; } }
          } else {
            move = f.guard(`${ctx} bot`, () => E.bot(view, levels[players.indexOf(who)]!, mixSeed(seed, step)));
          }
          if (!move) break;
          const problems = E.validate(s, who, move);
          if (problems.length) { f.add(`${ctx}: illegal move ${JSON.stringify(move)} in phase ${s.phase}: ${problems}`); break; }
          const tmo = E.validate(s, who, f.guard(`${ctx} timeout`, () => E.timeoutMove(view)) ?? { t: 'bad' });
          if (tmo.length) f.add(`${ctx}: timeoutMove illegal in phase ${s.phase}: ${tmo}`);
          const before = JSON.stringify(s);
          for (let k = 0; k < 2; k++) {
            const junk = garbage(r);
            const res = f.guard(`${ctx} garbage ${JSON.stringify(junk)}`, () => E.validate(s!, who, junk));
            if (res && res.length === 0) f.add(`${ctx}: garbage accepted: ${JSON.stringify(junk)} in phase ${s.phase}`);
          }
          f.check(JSON.stringify(s) === before, () => `${ctx}: validate changed the state`);
          if (step % 5 === 0) {
            const viewer = pick([...players, null as unknown as string], r) || null;
            f.check(same(E.viewFor(s, viewer), E.viewFor(scramble(s, viewer, r), viewer)), () => `${ctx}: view for ${viewer} depends on hidden cards (phase ${s!.phase})`);
          }
          s = roundTrip(E.apply(s, who, move));
          step++;
          moves++;
          const all = [...players.flatMap((id) => s!.hands[id] as number[]), ...s.stock, ...s.discards, ...s.melds.flatMap((m) => m.cards)];
          if (all.length !== 52 || new Set(all).size !== 52) { f.add(`${ctx}: cards lost or duplicated (${all.length} cards, ${new Set(all).size} distinct)`); break; }
          if (s.melds.some((m) => meldKind(m.cards) !== m.kind)) { f.add(`${ctx}: an exposed meld is not a valid ${s.melds.find((m) => meldKind(m.cards) !== m.kind)?.kind}`); break; }
          if (step > 1500) { f.add(`${ctx}: hand did not end in 1500 moves`); break; }
        }
        if (s.phase !== 'over') continue;
        hands++;
        const res0 = E.result(s);
        if (!res0) { f.add(`${ctx}: over but no result`); continue; }
        const finalized = E.finalize(res0, setup, history);
        // pot oracle: collected when the same player wins two in a row and the last hand did not collect
        const prev = history[history.length - 1];
        let since = 0;
        for (let i = history.length - 1; i >= 0 && !((history[i]!.potDeals ?? 0) > 0); i--) since++;
        const expectPot = prev && prev.winner === res0.winner && !(prev.potDeals ?? 0) ? since + 1 : undefined;
        f.check(((finalized as { potDeals?: number }).potDeals ?? undefined) === expectPot, () => `${ctx}: pot ${JSON.stringify((finalized as { potDeals?: number }).potDeals)} expected ${expectPot}`);
        const input = { ...finalized, stake: pick([1, 5, 100], r) } as unknown as TongItsInput;
        const problems = tongIts.validate(setup, players, input);
        if (problems.length) { f.add(`${ctx}: result invalid: ${problems} ${JSON.stringify(input)}`); continue; }
        const net = f.guard(`${ctx} score`, () => tongIts.score(setup, players, input));
        if (net) {
          f.check(sum(net) === 0, () => `${ctx}: not zero-sum ${JSON.stringify(net)}`);
          f.check(Object.values(net).every((v) => Math.abs(v) <= MAX_AMOUNT), () => `${ctx}: over the amount limit`);
        }
        history.push(input);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[stress] tong-its: ${hands} hands, ${moves} moves, ${walkerSteps} exhaustively checked walker steps`);
    f.done('tong-its simulation');
  });
});
