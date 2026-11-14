<script lang="ts">
  import { RANK_LABELS, rankOf, suitOf } from '../../games/cards';

  interface Props {
    card: number;
    selected?: boolean;
    /** Smaller card for melds and reveals. */
    small?: boolean;
    /** Exact width in px (overrides `small`). Height follows. */
    size?: number;
    onclick?: () => void;
  }
  let { card, selected = false, small = false, size, onclick }: Props = $props();

  // Card suits are S H D C.
  const GLYPH = ['♠', '♥', '♦', '♣'];
  const NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
  const red = $derived(suitOf(card) === 1 || suitOf(card) === 2);
  const label = $derived(`${RANK_LABELS[rankOf(card) - 1]} of ${NAME[suitOf(card)]}`);
  const w = $derived(size ?? (small ? 30 : 46));
  const rank = $derived(RANK_LABELS[rankOf(card) - 1]);
  const glyph = $derived(GLYPH[suitOf(card)]);
</script>

{#if onclick}
  <button type="button" class="card-face" class:red class:selected style="--cw: {w}px" aria-pressed={selected} aria-label={label} {onclick}>
    <span class="idx"><b>{rank}</b><i>{glyph}</i></span><span class="pip">{glyph}</span>
  </button>
{:else}
  <span class="card-face" class:red style="--cw: {w}px" role="img" aria-label={label}>
    <span class="idx"><b>{rank}</b><i>{glyph}</i></span><span class="pip">{glyph}</span>
  </span>
{/if}

<style>
  .card-face {
    position: relative; display: inline-block; flex: none;
    width: var(--cw); height: calc(var(--cw) * 1.4); padding: 0; border-radius: calc(var(--cw) * .14);
    border: 1px solid #b9ad8a; background: #fbf5e1; color: #1d1608; font-family: var(--font-display);
    box-shadow: 0 2px 6px rgba(0,0,0,.35); transition: transform .12s ease; min-height: 0; cursor: default;
  }
  button.card-face { cursor: pointer; }
  .red { color: #c0392b; }
  .idx { position: absolute; left: calc(var(--cw) * .09); top: calc(var(--cw) * .05); display: flex; flex-direction: column; align-items: center; line-height: .95; }
  .idx b { font-size: calc(var(--cw) * .32); font-weight: 800; }
  .idx i { font-style: normal; font-size: calc(var(--cw) * .28); }
  .pip { position: absolute; right: calc(var(--cw) * .1); bottom: calc(var(--cw) * .06); font-size: calc(var(--cw) * .5); line-height: 1; opacity: .9; }
  .selected { transform: translateY(calc(var(--cw) * -.22)); border-color: var(--brass); box-shadow: 0 0 0 2px var(--brass), 0 6px 12px rgba(0,0,0,.45); }
  @media (prefers-reduced-motion: reduce) { .card-face { transition: none; } }
</style>
