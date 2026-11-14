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
    /** Indexes where a new group of cards starts (for example a meld); a small gap is left before each. */
    gaps?: readonly number[];
    label?: string;
  }
  let { cards, selected = [], onpick, maxW = 96, spread, gaps = [], label }: Props = $props();

  /**
   * Cards held in one hand: each card turns around a point below the hand, so the cards make an arc and the
   * top-left corner of every card stays visible. The hand always fits the box it is given (width and height),
   * shrinking the cards only when it must, so the screen never scrolls.
   */
  const RATIO = 1.4536; // card height / width
  const RADIUS = 3.2; // pivot distance below the hand, in card widths
  const LIFT = 0.2; // a selected card rises by this share of its width
  // px of each card left showing at the card's centre line. Turned cards overlap more near the bottom, so this is
  // set above WCAG's 24 px minimum target to keep every card's tappable strip at 24 px or more.
  const MIN_STRIP = 32;
  const MAX_DEG = 100;

  let W = $state(0);
  let H = $state(0);
  const n = $derived(cards.length);
  const GAP = 1.4; // a group gap, as a share of the space between two cards
  /** Where each card sits along the fan, counting group gaps; `span` is the position of the last card. */
  const pos = $derived(cards.map((_, i) => i + GAP * gaps.filter((g) => g > 0 && g <= i && g < n).length));
  const span = $derived(pos[n - 1] ?? 0);
  const baseDeg = $derived(n <= 1 ? 0 : (spread ?? Math.min(64, 6 + n * 4.5)));

  const layout = $derived.by(() => {
    if (W === 0 || H === 0 || n === 0) return null;
    // Pickable fans open wider when needed so every card keeps a MIN_STRIP-wide strip to tap.
    const stripDeg = (w: number): number => (onpick && n > 1 && baseDeg > 0 ? Math.min(MAX_DEG, ((MIN_STRIP / (w * RADIUS)) * 180 / Math.PI) * span) : 0);
    let deg = Math.max(baseDeg, stripDeg(maxW));
    let half = ((deg / 2) * Math.PI) / 180;
    // Height used by one card width: the card, the arc's drop at the edges, the turned corner, and the lift.
    const perW = (h: number): number => RATIO + RADIUS * (1 - Math.cos(h)) + 0.5 * Math.sin(h) + (RATIO / 2) * (1 - Math.cos(h)) + (onpick ? LIFT : 0); // only a pickable hand lifts a card
    let cw = Math.min(maxW, (H - 4) / perW(half));
    // Shrink until the hand fits both ways: the arc's chord plus the outer cards' turned edges, and the height.
    for (let k = 0; k < 60; k++) {
      deg = Math.max(baseDeg, stripDeg(cw));
      half = ((deg / 2) * Math.PI) / 180;
      const arcW = 2 * RADIUS * cw * Math.sin(half) + cw * Math.cos(half) + cw * RATIO * Math.sin(half);
      // A flat row (spread 0) still overlaps so a corner of each card shows.
      const flat = deg === 0 ? cw + span * Math.max(cw * 0.34, onpick ? MIN_STRIP : 0) : 0;
      if (Math.max(arcW, flat) <= W - 4 && cw * perW(half) <= H - 4) break;
      cw *= 0.95;
    }
    const ch = cw * RATIO;
    const R = cw * RADIUS;
    const drop = R * (1 - Math.cos(half)) + (cw / 2) * Math.sin(half) + (ch / 2) * (1 - Math.cos(half));
    const base = H - ch - drop - 2;
    const mid = span / 2;
    const step = span > 0 ? deg / span : 0;
    const flatStep = deg === 0 && span > 0 ? Math.min(cw * 1.04, (W - cw) / span) : 0;
    return cards.map((_, i) => {
      const p = pos[i] ?? i;
      const a = (p - mid) * step;
      const r = (a * Math.PI) / 180;
      const x = deg === 0 ? W / 2 + (p - mid) * flatStep - cw / 2 : W / 2 + R * Math.sin(r) - cw / 2;
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
