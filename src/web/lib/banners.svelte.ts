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
const SHOW_MS = 1500;

function advance(): void {
  const next = queue.shift();
  banners.current = next ?? null;
  if (next) timer = setTimeout(advance, SHOW_MS);
}

export function pushBanners(items: { text: string; tone: Tone }[]): void {
  for (const it of items.slice(0, 4)) {
    if (queue.length < 6) queue.push({ id: nextId++, ...it });
  }
  if (!banners.current) advance();
}

export function clearBanners(): void {
  clearTimeout(timer);
  queue.length = 0;
  banners.current = null;
}
