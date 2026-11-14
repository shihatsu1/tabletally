import { describe, expect, it } from 'vitest';
import {
  bestDeadwood, cardLabel, countAces, discardAdvice, drawAdvice, isTongIts, makeCard, organize, pointsOf, rankOf, secretSets,
  validateHand, type Card,
} from '../src/games/tong-its/hand';

// suits: S=0 H=1 D=2 C=3
const c = (label: string): Card => {
  const suit = 'SHDC'.indexOf(label.slice(-1));
  const rankText = label.slice(0, -1);
  const rank = rankText === 'A' ? 1 : rankText === 'J' ? 11 : rankText === 'Q' ? 12 : rankText === 'K' ? 13 : Number(rankText);
  return makeCard(suit, rank);
};
const hand = (...labels: string[]) => labels.map(c);

/** Independent brute force: try every subset as a meld, using plain validity checks. */
function brute(cards: Card[]): number {
  const valid = (sub: Card[]): boolean => {
    if (sub.length < 3) return false;
    if (sub.length <= 4 && sub.every((x) => rankOf(x) === rankOf(sub[0] as Card))) return true;
    const suit = Math.floor((sub[0] as Card) / 13);
    if (!sub.every((x) => Math.floor(x / 13) === suit)) return false;
    const ranks = sub.map(rankOf).sort((a, b) => a - b);
    return ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1);
  };
  const go = (rest: Card[]): number => {
    if (rest.length === 0) return 0;
    const [first, ...others] = rest as [Card, ...Card[]];
    let best = pointsOf(first) + go(others);
    const n = others.length;
    for (let m = 1; m < 1 << n; m++) {
      const pick = [first, ...others.filter((_, i) => m & (1 << i))];
      if (pick.length > 6 || !valid(pick)) continue; // melds this small are enough for 9-card hands
      const left = others.filter((_, i) => !(m & (1 << i)));
      best = Math.min(best, go(left));
    }
    return best;
  };
  return go(cards);
}

describe('card basics', () => {
  it('points: ace 1, 2 to 10 face value, J/Q/K 10', () => {
    expect([c('AS'), c('2H'), c('9D'), c('10C'), c('JS'), c('QH'), c('KD')].map(pointsOf)).toEqual([1, 2, 9, 10, 10, 10, 10]);
    expect(cardLabel(c('10H'))).toBe('10H');
  });

  it('validates hands', () => {
    expect(validateHand(hand('AS', '2S'))).toEqual([]);
    expect(validateHand([1, 1]).length).toBe(1);
    expect(validateHand([52]).length).toBe(1);
    expect(validateHand(Array.from({ length: 15 }, (_, i) => i)).length).toBe(1);
  });
});

describe('melds follow the rules doc', () => {
  it('ace is low only: A-2-3 is a run, Q-K-A and K-A-2 are not', () => {
    expect(bestDeadwood(hand('AS', '2S', '3S'))).toBe(0);
    expect(bestDeadwood(hand('QS', 'KS', 'AS'))).toBe(21);
    expect(bestDeadwood(hand('KS', 'AS', '2S'))).toBe(13);
  });

  it('a set is three or four of a rank; two is not enough', () => {
    expect(bestDeadwood(hand('7S', '7H', '7D'))).toBe(0);
    expect(bestDeadwood(hand('7S', '7H', '7D', '7C'))).toBe(0);
    expect(bestDeadwood(hand('7S', '7H'))).toBe(14);
  });

  it('a run needs one suit', () => {
    expect(bestDeadwood(hand('4S', '5H', '6S'))).toBe(15);
    expect(bestDeadwood(hand('4S', '5S', '6S', '7S', '8S'))).toBe(0);
  });
});

describe('organize', () => {
  it('worked example: a set, a run and three loose cards', () => {
    const h = hand('7S', '7H', '7D', '4H', '5H', '6H', 'KS', '2C', '9D');
    const [best] = organize(h);
    expect(best?.points).toBe(21);
    expect(best?.deadwood.map(cardLabel).sort()).toEqual(['2C', '9D', 'KS']);
    expect(best?.melds.map((m) => m.kind).sort()).toEqual(['run', 'set']);
  });

  it('picks the better of a four-of-a-kind or a set plus a run', () => {
    const h = hand('5S', '5H', '5D', '5C', '6H', '7H');
    expect(bestDeadwood(h)).toBe(0); // 5S 5D 5C as a set, 5H 6H 7H as a run
    expect(organize(h)[0]?.points).toBe(0);
  });

  it('offers several different arrangements, best first, without repeats', () => {
    const h = hand('2S', '2H', '2D', '3H', '4H', 'KS', '9C');
    const list = organize(h, 3); // run 2H-3H-4H beats the set of 2s, but both are offered
    expect(list.length).toBeGreaterThan(1);
    expect(list[0]?.points).toBe(bestDeadwood(h));
    for (let i = 1; i < list.length; i++) expect(list[i]!.points).toBeGreaterThanOrEqual(list[i - 1]!.points);
    const keys = list.map((a) => JSON.stringify(a.melds.map((m) => [...m.cards].sort())));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every arrangement uses each card once, only valid melds, and adds up', () => {
    let seed = 5;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let t = 0; t < 60; t++) {
      const deck = Array.from({ length: 52 }, (_, i) => i).sort(() => rand() - 0.5);
      const h = deck.slice(0, 12 + Math.floor(rand() * 2));
      for (const a of organize(h, 3)) {
        const used = [...a.melds.flatMap((m) => m.cards), ...a.deadwood];
        expect([...used].sort((x, y) => x - y)).toEqual([...h].sort((x, y) => x - y));
        expect(a.points).toBe(a.deadwood.reduce((s, x) => s + pointsOf(x), 0));
        for (const m of a.melds) {
          expect(m.cards.length).toBeGreaterThanOrEqual(3);
          if (m.kind === 'set') expect(new Set(m.cards.map(rankOf)).size).toBe(1);
          else {
            const ranks = m.cards.map(rankOf).sort((x, y) => x - y);
            expect(new Set(m.cards.map((x) => Math.floor(x / 13))).size).toBe(1);
            expect(ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1)).toBe(true);
          }
        }
      }
    }
  });

  it('matches an independent brute-force search on random 9-card hands', () => {
    let seed = 11;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let t = 0; t < 80; t++) {
      // a narrow deck makes melds likely, so the comparison is not trivial
      const pool = Array.from({ length: 52 }, (_, i) => i).filter((x) => rankOf(x) <= 6).sort(() => rand() - 0.5);
      const h = pool.slice(0, 9);
      expect(bestDeadwood(h), h.map(cardLabel).join(' ')).toBe(brute(h));
    }
  });

  it('handles an empty hand', () => {
    expect(organize([])).toEqual([{ melds: [], deadwood: [], points: 0 }]);
  });
});

describe('tong-its detection and bonuses', () => {
  it('12 melded cards can call Tong-its; one loose card cannot', () => {
    const full = hand('AS', 'AH', 'AD', '2S', '2H', '2D', '3S', '3H', '3D', '4S', '4H', '4D');
    expect(isTongIts(full)).toBe(true);
    expect(isTongIts([...full.slice(0, 11), c('KC')])).toBe(false);
  });

  it('counts aces and four-of-a-kind secrets', () => {
    expect(countAces(hand('AS', 'AH', '5D', '6C'))).toBe(2);
    const four = hand('9S', '9H', '9D', '9C', '2S', '5H');
    const withFour = organize(four, 5).find((a) => a.melds.some((m) => m.cards.length === 4));
    expect(withFour && secretSets(withFour)).toBe(1);
  });
});

describe('advice', () => {
  it('discard: throws away the highest-value card that is not helping', () => {
    const h = hand('4S', '5S', '6S', '7H', '7D', '7C', '2H', '3D', '9C', 'AS', 'AD', 'QH', 'KC');
    const [top] = discardAdvice(h);
    expect(top?.deadwoodAfter).toBe(bestDeadwood(h.filter((x) => x !== top!.card)));
    expect(pointsOf(top!.card)).toBe(10);
    // no other discard does better
    for (const a of discardAdvice(h, 13)) expect(a.deadwoodAfter).toBeGreaterThanOrEqual(top!.deadwoodAfter);
  });

  it('draw: lists the cards that would complete a run, and none that do not help', () => {
    const h = hand('5H', '6H', 'KS', '2C', '9D', '3D', 'QC', '8S', 'JC', '4D', 'AC', '10S');
    const outs = drawAdvice(h);
    const labels = outs.map((o) => cardLabel(o.card));
    expect(labels).toContain('7H');
    expect(labels).toContain('4H');
    expect(outs.every((o) => o.deadwoodAfter < bestDeadwood(h))).toBe(true);
    expect(labels).not.toContain('5H'); // already in hand
  });

  it('draw: nothing helps a hand that is already all melds', () => {
    expect(drawAdvice(hand('AS', 'AH', 'AD', '2S', '2H', '2D', '3S', '3H', '3D'))).toEqual([]);
  });

  it('is fast enough to run on a phone for a 13-card hand', () => {
    const h = hand('4S', '5S', '6S', '7H', '7D', '7C', '2H', '3D', '9C', 'AS', 'AD', 'QH', 'KC');
    const t0 = performance.now();
    organize(h);
    discardAdvice(h);
    drawAdvice(h.slice(0, 12));
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('rejects invalid hands instead of guessing', () => {
    expect(() => organize([1, 1])).toThrow();
    expect(() => discardAdvice([60])).toThrow();
    expect(() => drawAdvice(Array.from({ length: 14 }, (_, i) => i))).toThrow();
  });
});
