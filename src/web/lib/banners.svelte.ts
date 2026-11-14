/** Big event banners ("TONG-ITS!", "SUNOG!") shown one after another over the table. */
export type Tone = 'win' | 'bad' | 'info';
export interface Banner {
  id: number;
  text: string;
  tone: Tone;
}

export const banners = $state<{ current: Banner | null }>({ current: null });

const queue: Banner[] = [];
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const SHOW_MS = 1200;
/** At most this many callouts per hand, so the table is never covered for long. */
const PER_HAND = 3;

function advance(): void {
  const next = queue.shift();
  banners.current = next ?? null;
  if (next) timer = setTimeout(advance, SHOW_MS);
}

/** Show the callouts for a newly recorded hand. Anything still queued from an older hand is dropped. */
export function pushBanners(items: { text: string; tone: Tone }[]): void {
  clearTimeout(timer);
  queue.length = 0;
  for (const it of items.slice(0, PER_HAND)) queue.push({ id: nextId++, ...it });
  advance();
}

export function clearBanners(): void {
  clearTimeout(timer);
  queue.length = 0;
  banners.current = null;
}
