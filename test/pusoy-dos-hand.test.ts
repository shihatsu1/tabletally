import { describe, expect, it } from 'vitest';
import { makeCard } from '../src/games/cards';
import { MAX_HAND, cardPower, countDeuces, organize, rankPower, sortHand, validateHand } from '../src/games/pusoy-dos/hand';

const R: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
const S: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const c = (s: string) => makeCard(S[s.slice(-1)] as number, R[s.slice(0, -1)] ?? Number(s.slice(0, -1)));
const hand = (s: string) => s.split(' ').map(c);
const kinds = (s: string) => organize(hand(s)).plays.map((p) => p.kind).sort();

describe('card order', () => {
  it('ranks 3 low and 2 high, with the Philippine suit order (diamonds highest, clubs lowest)', () => {
    expect(rankPower(c('3S'))).toBe(3);
    expect(rankPower(c('AS'))).toBe(14);
    expect(rankPower(c('2S'))).toBe(15);
    expect(cardPower(c('3D'))).toBeGreaterThan(cardPower(c('3H')));
    expect(cardPower(c('3H'))).toBeGreaterThan(cardPower(c('3S')));
    expect(cardPower(c('3S'))).toBeGreaterThan(cardPower(c('3C')));
    expect(sortHand(hand('2C AS 3D KH'))).toEqual(hand('3D KH AS 2C'));
  });
});

describe('fewest plays', () => {
  it('uses every card exactly once', () => {
    const h = hand('3C 3S 4D 5H 6C 7S 9D 9H 9S JC QD KS 2H');
    const plan = organize(h);
    const used = plan.plays.flatMap((p) => p.cards);
    expect([...used].sort((a, b) => a - b)).toEqual([...h].sort((a, b) => a - b));
  });

  it('finds a straight, a pair, a triple and lone cards', () => {
    const plan = organize(hand('3C 3S 4D 5H 6C 7S 9D 9H 9S JC QD KS 2H'));
    const k = plan.plays.map((p) => p.kind);
    expect(k).toContain('triple');
    expect(k).toContain('straight'); // 3-4-5-6-7
    expect(plan.plays).toHaveLength(7); // straight, the spare 3, the triple of 9s, and J Q K 2 alone
  });

  it('takes a flush, a full house, four plus one and a straight flush as single plays', () => {
    expect(kinds('3S 5S 8S JS KS')).toEqual(['flush']);
    expect(kinds('4S 4H 4D 9C 9S')).toEqual(['fullHouse']);
    expect(kinds('7S 7H 7D 7C 2S')).toEqual(['fourPlus']);
    expect(kinds('5S 6S 7S 8S 9S')).toEqual(['straightFlush']);
    expect(kinds('5S 6H 7S 8S 9S')).toEqual(['straight']);
  });

  it('lists the plays from weakest to strongest', () => {
    const powers = organize(hand('3C 3S 4D 5H 6C 7S 9D 9H 9S JC QD KS 2H')).plays.map((p) => p.power);
    expect(powers).toEqual([...powers].sort((a, b) => a - b));
  });

  it('a hand of unrelated cards is all singles; an empty or bad hand gives no plays', () => {
    expect(kinds('3C 5D 7H 9S JC')).toEqual(['single', 'single', 'single', 'single', 'single']);
    expect(organize([]).plays).toEqual([]);
    expect(organize([3, 3]).plays).toEqual([]);
    expect(organize([99]).plays).toEqual([]);
  });

  it('prefers fewer plays: a pair beats two singles, a straight beats five singles', () => {
    expect(organize(hand('4C 4D')).plays).toHaveLength(1);
    expect(organize(hand('4C 5D 6H 7S 8C')).plays).toHaveLength(1);
  });

  it('copes with a 17-card hand of many straights without freezing', () => {
    const t0 = Date.now();
    const h = hand('3C 3S 4C 4D 5H 5S 6C 6D 7H 7S 8C 8D 9H 9S 10C 10D JH');
    const plan = organize(h);
    expect(plan.plays.flatMap((p) => p.cards).sort((a, b) => a - b)).toEqual([...h].sort((a, b) => a - b));
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('hand checks', () => {
  it('flags duplicates, bad numbers and too many cards', () => {
    expect(validateHand([1, 1])).toContain('a card appears twice');
    expect(validateHand([52])).toContain('cards must be 0 to 51');
    expect(validateHand(Array.from({ length: MAX_HAND + 1 }, (_, i) => i))).toContain(`a hand has at most ${MAX_HAND} cards`);
    expect(validateHand(hand('3C 4D'))).toEqual([]);
  });
  it('counts the 2s', () => {
    expect(countDeuces(hand('2S 2H 3C AS'))).toBe(2);
  });
});

describe('review fixes: ordering of five-card plays', () => {
  it('a straight comes before a full house, and the triple decides between full houses', () => {
    const plan = organize(hand('3C 4D 5H 6S 7C 9C 9D 9S JH JC'));
    expect(plan.plays.map((p) => p.kind)).toEqual(['straight', 'fullHouse']);
    const two = organize(hand('4C 4D 4H 9S 9C 5C 5D 5S 8H 8C')).plays;
    expect(two.map((p) => p.kind)).toEqual(['fullHouse', 'fullHouse']);
    expect(rankPower(two[0]!.cards[2]!)).toBeLessThan(rankPower(two[1]!.cards[2]!)); // 4s full of 9s before 5s full of 8s
  });
});
