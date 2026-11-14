<script lang="ts">
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    cards: readonly number[];
    selected?: readonly number[];
    onpick?: (card: number) => void;
    /** Widest a card may be, in px. */
    maxW?: number;
    /** Degrees of tilt between neighbours, for a held look. */
    tilt?: number;
    label?: string;
    /** Fill the height the parent gives it: cards shrink to fit instead of overflowing. */
    fit?: boolean;
  }
  let { cards, selected = [], onpick, maxW = 46, tilt = 0, label, fit = false }: Props = $props();

  // One row that always fits: cards overlap more as there are more of them, and shrink only if they must.
  const MIN_STEP = 0.42;
  let W = $state(0);
  let H = $state(0);
  const n = $derived(cards.length);
  const byWidth = $derived(n <= 1 || W === 0 ? maxW : W / (1 + (n - 1) * MIN_STEP));
  const byHeight = $derived(fit && H > 0 ? H / 1.7 : Infinity);
  const cw = $derived(Math.max(16, Math.min(maxW, byWidth, byHeight)));
  const step = $derived(n <= 1 ? 0 : Math.min(cw * 1.08, (W - cw) / (n - 1)));
  const left0 = $derived(Math.max(0, (W - (cw + step * Math.max(0, n - 1))) / 2));
  const mid = $derived((n - 1) / 2);
</script>

<div class="fan" class:fit bind:clientWidth={W} bind:clientHeight={H} style={fit ? undefined : `height: ${cw * 1.4 + cw * 0.3}px`} role="group" aria-label={label}>
  {#each cards as c, i (c)}
    <span class="slot" style="left: {left0 + i * step}px; transform: rotate({(i - mid) * tilt}deg) translateY({Math.abs(i - mid) * tilt * 0.5}px)">
      <PlayingCard card={c} size={cw} selected={selected.includes(c)} onclick={onpick ? () => onpick(c) : undefined} />
    </span>
  {/each}
</div>

<style>
  .fan { position: relative; width: 100%; }
  .fan.fit { height: 100%; min-height: 28px; }
  .slot { position: absolute; bottom: 0; transform-origin: 50% 120%; }
</style>
