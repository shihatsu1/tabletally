/**
 * Shared turn clock. Pure functions over a plain JSON value, used by the Worker (authoritative) and by
 * the browser (to draw the countdown between messages). Time never ticks on the server: the clock stores
 * when the current turn started, and everyone derives "now" from that, so there is no tick traffic.
 *
 * Pausing needs everyone: a player asks, every other player has to agree within PAUSE_WINDOW_MS, and
 * if anyone declines or the window passes the request is dropped and the timer simply kept running.
 */
export const PAUSE_WINDOW_MS = 20_000;
export const MIN_TURN_SECONDS = 5;
export const MAX_TURN_SECONDS = 300;
/** Cap on the timeout counter so a timer left running overnight stays readable. */
export const MAX_TIMEOUTS = 99;

export interface Clock {
  /** Player ids in turn order. */
  order: string[];
  /** Index into `order` of whoever is on the clock. */
  turn: number;
  /** When the current turn started (ms). Meaningless while paused. */
  startedAt: number;
  turnMs: number;
  /** Set while the game is paused: how much of the current turn was left. */
  paused: { remainingMs: number } | null;
  /** An open pause request and who has agreed so far. */
  pauseReq: { by: string; at: number; agreed: string[] } | null;
  /** How many turns each player let run out. Absent in clocks saved before this existed. */
  timeouts?: Record<string, number>;
}

export type ClockResult = { ok: true; clock: Clock } | { ok: false; code: string; message: string };
const fail = (code: string, message: string): ClockResult => ({ ok: false, code, message });

export function startClock(order: readonly string[], turnSeconds: number, firstIndex: number, now: number): ClockResult {
  if (!Number.isSafeInteger(now) || now < 0) return fail('bad_clock', 'Bad time.');
  if (order.length < 2) return fail('bad_clock', 'The timer needs at least two players.');
  if (!Number.isInteger(turnSeconds) || turnSeconds < MIN_TURN_SECONDS || turnSeconds > MAX_TURN_SECONDS) {
    return fail('bad_clock', `Turn time must be ${MIN_TURN_SECONDS} to ${MAX_TURN_SECONDS} seconds.`);
  }
  if (!Number.isInteger(firstIndex) || firstIndex < 0 || firstIndex >= order.length) {
    return fail('bad_clock', 'Pick who goes first.');
  }
  return { ok: true, clock: { order: [...order], turn: firstIndex, startedAt: now, turnMs: turnSeconds * 1000, paused: null, pauseReq: null, timeouts: Object.fromEntries(order.map((id) => [id, 0])) } };
}

/** Bring the clock up to `now`: drop a stale pause request and roll over turns whose time ran out. */
export function normalizeClock(c: Clock, now: number): Clock {
  // A time that is not a sane whole number (or a clock saved with one) is left alone rather than
  // being rolled forward into nonsense.
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(c.startedAt)) return c;
  let next = c;
  if (next.pauseReq && now - next.pauseReq.at > PAUSE_WINDOW_MS) next = { ...next, pauseReq: null };
  if (!next.paused) {
    const elapsed = now - next.startedAt;
    if (elapsed >= next.turnMs) {
      const turns = Math.floor(elapsed / next.turnMs);
      const len = next.order.length;
      // Every turn that ran out counts against the player whose turn it was, then play moves on.
      const timeouts = { ...(next.timeouts ?? {}) };
      const full = Math.floor(turns / len);
      const rest = turns % len;
      next.order.forEach((id, i) => {
        const extra = (i - next.turn + len) % len < rest ? 1 : 0;
        timeouts[id] = Math.min(MAX_TIMEOUTS, (timeouts[id] ?? 0) + full + extra);
      });
      next = { ...next, turn: (next.turn + turns) % len, startedAt: next.startedAt + turns * next.turnMs, timeouts };
    }
  }
  return next;
}

export function remainingMs(c: Clock, now: number): number {
  if (c.paused) return c.paused.remainingMs;
  const n = normalizeClock(c, now);
  // Never more than a full turn, even if this phone's clock is a little behind the server's.
  return Math.min(n.turnMs, Math.max(0, n.turnMs - (now - n.startedAt)));
}

export const currentPlayer = (c: Clock, now: number): string => {
  const n = normalizeClock(c, now);
  return n.order[n.turn] as string;
};

/** The player on the clock finished (or the host moved it along). */
export function turnDone(c: Clock, now: number): ClockResult {
  const n = normalizeClock(c, now);
  if (n.paused) return fail('paused', 'The game is paused.');
  return { ok: true, clock: { ...n, turn: (n.turn + 1) % n.order.length, startedAt: now } };
}

/**
 * Ask to pause, or agree to an open request. `required` is everyone who must agree. The game only
 * pauses when all of them have.
 */
export function agreePause(c: Clock, by: string, required: readonly string[], now: number): ClockResult {
  const n = normalizeClock(c, now);
  if (n.paused) return fail('paused', 'Already paused.');
  const agreed = n.pauseReq ? [...new Set([...n.pauseReq.agreed, by])] : [by];
  const req = { by: n.pauseReq?.by ?? by, at: n.pauseReq?.at ?? now, agreed };
  if (required.every((id) => agreed.includes(id))) {
    return { ok: true, clock: { ...n, paused: { remainingMs: Math.max(0, n.turnMs - (now - n.startedAt)) }, pauseReq: null } };
  }
  return { ok: true, clock: { ...n, pauseReq: req } };
}

/** Anyone saying no ends the request. The timer never stopped, so nothing else changes. */
export function declinePause(c: Clock, now: number): ClockResult {
  const n = normalizeClock(c, now);
  return { ok: true, clock: { ...n, pauseReq: null } };
}

export function resumeClock(c: Clock, now: number): ClockResult {
  if (!c.paused) return fail('not_paused', 'The game is not paused.');
  return { ok: true, clock: { ...c, paused: null, pauseReq: null, startedAt: now - (c.turnMs - c.paused.remainingMs) } };
}
