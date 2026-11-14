import { describe, expect, it } from 'vitest';
import {
  agreePause, currentPlayer, declinePause, normalizeClock, PAUSE_WINDOW_MS, remainingMs, resumeClock, startClock, turnDone, type Clock,
} from '../src/core/clock';

const T0 = 1_000_000;
const order = ['p1', 'p2', 'p3'];
const make = (secs = 30, first = 0): Clock => {
  const r = startClock(order, secs, first, T0);
  if (!r.ok) throw new Error(r.message);
  return r.clock;
};
const ok = (r: ReturnType<typeof turnDone>): Clock => {
  if (!r.ok) throw new Error(r.message);
  return r.clock;
};

describe('turn clock', () => {
  it('counts down from the turn start and starts with the chosen player', () => {
    const c = make(30, 1);
    expect(currentPlayer(c, T0)).toBe('p2');
    expect(remainingMs(c, T0)).toBe(30_000);
    expect(remainingMs(c, T0 + 12_000)).toBe(18_000);
  });

  it('rolls to the next player when time runs out, including several turns at once', () => {
    const c = make(30, 0);
    expect(currentPlayer(c, T0 + 30_000)).toBe('p2');
    expect(remainingMs(c, T0 + 30_000)).toBe(30_000);
    expect(currentPlayer(c, T0 + 95_000)).toBe('p1'); // 3 turns later wraps back to p1
    expect(remainingMs(c, T0 + 95_000)).toBe(25_000);
    expect(normalizeClock(c, T0 + 95_000).startedAt).toBe(T0 + 90_000);
  });

  it('turnDone hands over and restarts the full time', () => {
    const c = ok(turnDone(make(), T0 + 8_000));
    expect(currentPlayer(c, T0 + 8_000)).toBe('p2');
    expect(remainingMs(c, T0 + 8_000)).toBe(30_000);
    expect(currentPlayer(ok(turnDone(c, T0 + 9_000)), T0 + 9_000)).toBe('p3');
  });

  it('validates start options', () => {
    expect(startClock(['p1'], 30, 0, T0).ok).toBe(false);
    expect(startClock(order, 2, 0, T0).ok).toBe(false);
    expect(startClock(order, 301, 0, T0).ok).toBe(false);
    expect(startClock(order, 30.5, 0, T0).ok).toBe(false);
    expect(startClock(order, 30, 3, T0).ok).toBe(false);
  });
});

describe('pause needs everyone', () => {
  const all = ['p1', 'p2', 'p3'];

  it('does not pause until every required player agrees, and the timer keeps running meanwhile', () => {
    let c = ok(agreePause(make(), 'p1', all, T0 + 5_000));
    expect(c.paused).toBeNull();
    expect(c.pauseReq?.agreed).toEqual(['p1']);
    expect(remainingMs(c, T0 + 10_000)).toBe(20_000); // still counting

    c = ok(agreePause(c, 'p2', all, T0 + 10_000));
    expect(c.paused).toBeNull();
    c = ok(agreePause(c, 'p3', all, T0 + 12_000));
    expect(c.paused).toEqual({ remainingMs: 18_000 });
    expect(c.pauseReq).toBeNull();
    expect(remainingMs(c, T0 + 999_000)).toBe(18_000); // frozen
  });

  it('agreeing twice does not count twice', () => {
    let c = ok(agreePause(make(), 'p1', all, T0));
    c = ok(agreePause(c, 'p1', all, T0 + 1000));
    expect(c.pauseReq?.agreed).toEqual(['p1']);
    expect(c.paused).toBeNull();
  });

  it('one player saying no cancels it and the timer carries on', () => {
    let c = ok(agreePause(make(), 'p1', all, T0 + 2_000));
    c = ok(agreePause(c, 'p2', all, T0 + 3_000));
    c = ok(declinePause(c, T0 + 4_000));
    expect(c.pauseReq).toBeNull();
    expect(c.paused).toBeNull();
    expect(remainingMs(c, T0 + 10_000)).toBe(20_000);
  });

  it('a request nobody completes expires after the window', () => {
    const c = ok(agreePause(make(), 'p1', all, T0));
    expect(normalizeClock(c, T0 + PAUSE_WINDOW_MS).pauseReq).not.toBeNull();
    expect(normalizeClock(c, T0 + PAUSE_WINDOW_MS + 1).pauseReq).toBeNull();
    // and a late "agree" starts a fresh request instead of completing the stale one
    const late = ok(agreePause(c, 'p2', all, T0 + PAUSE_WINDOW_MS + 5_000));
    expect(late.paused).toBeNull();
    expect(late.pauseReq?.agreed).toEqual(['p2']);
  });

  it('works when only some players have phones (the others are covered by the host)', () => {
    const phones = ['p1', 'p2'];
    let c = ok(agreePause(make(), 'p1', phones, T0));
    c = ok(agreePause(c, 'p2', phones, T0 + 1));
    expect(c.paused).not.toBeNull();
  });

  it('resume continues from exactly where the turn was frozen', () => {
    let c = ok(agreePause(make(), 'p1', ['p1'], T0 + 10_000)); // single required player pauses at once
    expect(c.paused).toEqual({ remainingMs: 20_000 });
    c = ok(resumeClock(c, T0 + 500_000));
    expect(remainingMs(c, T0 + 500_000)).toBe(20_000);
    expect(remainingMs(c, T0 + 505_000)).toBe(15_000);
    expect(resumeClock(c, T0 + 600_000).ok).toBe(false);
  });

  it('turns cannot be passed while paused, and pausing twice is refused', () => {
    const c = ok(agreePause(make(), 'p1', ['p1'], T0));
    expect(turnDone(c, T0 + 1).ok).toBe(false);
    expect(agreePause(c, 'p2', all, T0 + 1).ok).toBe(false);
  });
});

describe('hardening (from code review)', () => {
  it('refuses nonsense start times and leaves nonsense "now" values alone', () => {
    expect(startClock(order, 30, 0, -1e308).ok).toBe(false);
    expect(startClock(order, 30, 0, 1.5).ok).toBe(false);
    const c = make();
    expect(normalizeClock(c, 1e308)).toEqual(c);
    expect(normalizeClock(c, NaN)).toEqual(c);
    expect(Number.isFinite(remainingMs(c, 1e308))).toBe(true);
  });

  it('never reports more than a full turn when this phone clock is behind', () => {
    expect(remainingMs(make(30), T0 - 10_000)).toBe(30_000);
  });
});

describe('timeouts', () => {
  it('a turn that runs out is counted against that player and play moves on', () => {
    const c = normalizeClock(make(30, 0), T0 + 31_000);
    expect(c.timeouts).toEqual({ p1: 1, p2: 0, p3: 0 });
    expect(currentPlayer(c, T0 + 31_000)).toBe('p2');
  });

  it('several missed turns are shared out in order, including full laps', () => {
    // 3 turns = one each; 5 turns starting at p1 = p1,p2,p3,p1,p2
    expect(normalizeClock(make(30, 0), T0 + 3 * 30_000).timeouts).toEqual({ p1: 1, p2: 1, p3: 1 });
    expect(normalizeClock(make(30, 0), T0 + 5 * 30_000).timeouts).toEqual({ p1: 2, p2: 2, p3: 1 });
    expect(normalizeClock(make(30, 1), T0 + 4 * 30_000).timeouts).toEqual({ p1: 1, p2: 2, p3: 1 });
  });

  it('passing the turn in time is not a timeout, and a pause never causes one', () => {
    let c = ok(turnDone(make(), T0 + 10_000));
    expect(normalizeClock(c, T0 + 10_000).timeouts).toEqual({ p1: 0, p2: 0, p3: 0 });
    c = ok(agreePause(c, 'p1', ['p1'], T0 + 20_000));
    expect(normalizeClock(c, T0 + 9_999_999).timeouts).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('normalising twice never counts a timeout twice', () => {
    const once = normalizeClock(make(), T0 + 95_000);
    expect(normalizeClock(once, T0 + 95_000).timeouts).toEqual(once.timeouts);
  });

  it('works on a clock saved before timeouts existed, and caps a timer left running overnight', () => {
    const legacy: Clock = { ...make(), timeouts: undefined };
    expect(normalizeClock(legacy, T0 + 31_000).timeouts?.p1).toBe(1);
    expect(normalizeClock(make(), T0 + 30_000 * 100_000).timeouts?.p1).toBe(99);
  });
});
