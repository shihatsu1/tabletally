import { getItem, setItem } from './storage';

/**
 * Sound and celebration. All optional and off by default, because phones at a table
 * should not make noise unless people choose it. Sounds are synthesised with the Web Audio API,
 * so there are no audio files to license or download. (Vibration was removed on request.)
 */
export const fx = $state({
  sound: getItem('tt.sound') === '1',
});

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!fx.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSound(on: boolean): void {
  fx.sound = on;
  setItem('tt.sound', on ? '1' : '0');
  if (on) playClink(); // a user gesture, so this also unlocks audio on iPhone
}

function tone(c: AudioContext, start: number, freq: number, length: number, peak: number, type: OscillatorType = 'triangle'): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Two quick chip clicks: a round was saved. */
export function playClink(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 2600, 0.09, 0.12);
  tone(c, t + 0.07, 2100, 0.1, 0.1);
  tone(c, t, 900, 0.06, 0.06, 'sine');
}

/** A soft tick for the last seconds of a turn. */
export function playTick(): void {
  const c = audio();
  if (!c) return;
  tone(c, c.currentTime, 1500, 0.04, 0.06, 'square');
}

/** A low double buzz: someone ran out of time. */
export function playBuzz(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 220, 0.16, 0.12, 'sawtooth');
  tone(c, t + 0.18, 180, 0.22, 0.12, 'sawtooth');
}

/** Two falling notes: the game was paused. */
export function playPause(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 784, 0.14, 0.09, 'sine');
  tone(c, t + 0.12, 523.25, 0.2, 0.09, 'sine');
}

/** Two notes: it is your turn. */
export function playTurn(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 659.25, 0.14, 0.1, 'sine');
  tone(c, t + 0.12, 880, 0.2, 0.1, 'sine');
}

/** A short rising arpeggio: you won the round. */
export function playWin(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, t + i * 0.09, f, 0.22, 0.12, 'sine'));
}

/** Brass-coloured confetti burst for the round winner. Loaded on demand; skipped for reduced motion. */
export async function confettiBurst(): Promise<void> {
  if (reducedMotion()) return;
  try {
    const { default: confetti } = await import('canvas-confetti');
    const colors = ['#c9a24b', '#e3c77f', '#f3e9d2', '#e4572e'];
    void confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.65 }, colors, disableForReducedMotion: true });
    setTimeout(() => void confetti({ particleCount: 40, spread: 100, origin: { y: 0.6 }, colors, disableForReducedMotion: true }), 180);
  } catch {
    /* decoration only */
  }
}

/** React to a newly saved round. `youWon` is true on the winner's own phone. */
export function celebrateRound(youWon: boolean): void {
  if (youWon) {
    playWin();
    void confettiBurst();
  } else {
    playClink();
  }
}
