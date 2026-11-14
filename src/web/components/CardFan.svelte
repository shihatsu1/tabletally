<script lang="ts">
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    /** Cards to show; null entries are face-down. */
    cards: readonly (number | null)[];
    selected?: readonly number[];
    onpick?: (card: number) => void;
    /** Widest a card may be, in px. */
    maxW?: number;
    /** Degrees from the first card to the last. Defaults to a natural spread for the number of cards; 0 = a flat row. */
    spread?: number;
    label?: string;
  }
  let { cards, selected = [], onpick, maxW = 96, spread, label }: Props = $props();

  /**
   * Cards held in one hand: each card turns around a point below the hand, so the cards make an arc and the
   * top-left corner of every card stays visible. The hand always fits the box it is given (width and height),
   * shrinking the cards only when it must, so the screen never scrolls.
   */
  const RATIO = 1.4536; // card height / width
  const RADIUS = 3.2; // pivot distance below the hand, in card widths
  const LIFT = 0.2; // a selected card rises by this share of its width

  let W = $state(0);
  let H = $state(0);
  const n = $derived(cards.length);
  const deg = $derived(n <= 1 ? 0 : (spread ?? Math.min(64, 6 + n * 4.5)));

  const layout = $derived.by(() => {
    if (W === 0 || H === 0 || n === 0) return null;
    const half = ((deg / 2) * Math.PI) / 180;
    // Height used by one card width: the card, the arc's drop at the edges, the turned corner, and the lift.
    const perW = RATIO + RADIUS * (1 - Math.cos(half)) + 0.5 * Math.sin(half) + (RATIO / 2) * (1 - Math.cos(half)) + LIFT;
    let cw = Math.min(maxW, (H - 4) / perW);
    // Width: the arc's chord plus the outer cards' turned edges.
    for (let k = 0; k < 60; k++) {
      const span = 2 * RADIUS * cw * Math.sin(half) + cw * Math.cos(half) + cw * RATIO * Math.sin(half);
      // A flat row (spread 0) still overlaps so a corner of each card shows.
      const flat = deg === 0 ? cw + (n - 1) * cw * 0.34 : 0;
      if (Math.max(span, flat) <= W - 4) break;
      cw *= 0.95;
    }
    const ch = cw * RATIO;
    const R = cw * RADIUS;
    const drop = R * (1 - Math.cos(half)) + (cw / 2) * Math.sin(half) + (ch / 2) * (1 - Math.cos(half));
    const base = H - ch - drop - 2;
    const mid = (n - 1) / 2;
    const step = n > 1 ? deg / (n - 1) : 0;
    const flatStep = deg === 0 && n > 1 ? Math.min(cw * 1.04, (W - cw) / (n - 1)) : 0;
    return cards.map((_, i) => {
      const a = (i - mid) * step;
      const r = (a * Math.PI) / 180;
      const x = deg === 0 ? W / 2 + (i - mid) * flatStep - cw / 2 : W / 2 + R * Math.sin(r) - cw / 2;
      const y = deg === 0 ? H - ch - 2 : base + R * (1 - Math.cos(r));
      return { x, y, a, cw };
    });
  });
</script>

<div class="fan" bind:clientWidth={W} bind:clientHeight={H} role="group" aria-label={label}>
  {#if layout}
    {#each cards as c, i (c ?? `b${i}`)}
      {@const p = layout[i]!}
      {@const sel = c !== null && selected.includes(c)}
      <span class="slot" style="width: {p.cw}px; transform: translate({p.x}px, {p.y - (sel ? p.cw * LIFT : 0)}px) rotate({p.a}deg); z-index: {i}">
        <PlayingCard card={c} size={p.cw} selected={sel} onclick={onpick && c !== null ? () => onpick(c) : undefined} />
      </span>
    {/each}
  {/if}
</div>

<style>
  .fan { position: relative; width: 100%; height: 100%; min-height: 40px; }
  .slot { position: absolute; left: 0; top: 0; transform-origin: 50% 50%; transition: transform .14s ease; }
  @media (prefers-reduced-motion: reduce) { .slot { transition: none; } }
</style>
