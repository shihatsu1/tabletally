<script lang="ts">
  import PlayingCard from './PlayingCard.svelte';

  interface Props {
    /** Rows from the back of the hand to the front: in Pusoy the top 3, then the middle 5, then the bottom 5. */
    rows: readonly (readonly number[])[];
    /** A label for each row, shown beside it (for example "Top · pair of Ks"). */
    labels?: readonly string[];
    selected?: number | null;
    onpick?: (card: number) => void;
    /** Rows to outline as a problem. */
    bad?: boolean;
    label?: string;
  }
  let { rows, labels = [], selected = null, onpick, bad = false, label }: Props = $props();

  /**
   * Several rows held in one hand, each row in front of the one above it, the way Pusoy players hold their
   * three hands: every card overlaps its neighbour so its corner shows, and every row covers the lower part of
   * the row behind it. Cards are as large as the box allows; the screen never scrolls.
   */
  const RATIO = 1.4536;
  const OVERLAP = 0.3; // share of a card's width left showing beside the next card
  const MIN_SHOW = 0.3; // each row behind shows at least this share of its height
  const MAX_SHOW = 0.55;
  const LABEL_W = 70;

  let W = $state(0);
  let H = $state(0);
  const widest = $derived(Math.max(1, ...rows.map((r) => r.length)));
  const n = $derived(rows.length);

  const layout = $derived.by(() => {
    if (W === 0 || H === 0 || n === 0) return null;
    const room = W - (labels.length ? LABEL_W : 0) - 4;
    const cw = Math.max(20, Math.min(room / (1 + (widest - 1) * OVERLAP), (H - 4) / (RATIO * (1 + (n - 1) * MIN_SHOW))));
    const ch = cw * RATIO;
    const vstep = n > 1 ? Math.max(ch * MIN_SHOW, Math.min(ch * MAX_SHOW, (H - ch - 4) / (n - 1))) : 0;
    const top0 = H - ch - (n - 1) * vstep - 2;
    return { cw, ch, step: cw * OVERLAP, vstep, top0, labelX: cw + (widest - 1) * cw * OVERLAP + 8 };
  });
</script>

<div class="held" class:bad bind:clientWidth={W} bind:clientHeight={H} role="group" aria-label={label}>
  {#if layout}
    {#each rows as row, ri (ri)}
      {@const y = layout.top0 + ri * layout.vstep}
      {#each row as c, i (c)}
        <span class="slot" data-held-card={c} style="left: {i * layout.step}px; top: {y}px; z-index: {ri * 20 + i}">
          <PlayingCard card={c} size={layout.cw} selected={selected === c} onclick={onpick ? () => onpick(c) : undefined} />
        </span>
      {/each}
      {#if labels[ri]}<span class="lab" style="left: {layout.labelX}px; top: {y + 2}px">{labels[ri]}</span>{/if}
    {/each}
  {/if}
</div>

<style>
  /* isolation keeps the cards' z-index inside this box, so pop-ups and menus stay above the hand */
  .held { isolation: isolate; position: relative; width: 100%; height: 100%; min-height: 120px; border-radius: 12px; }
  .held.bad { outline: 2px solid color-mix(in srgb, #ff9a78 75%, transparent); outline-offset: 3px; }
  .slot { position: absolute; transition: left .14s ease, top .14s ease; }
  .lab { position: absolute; max-width: 70px; font-size: .74rem; line-height: 1.25; color: var(--brass-soft, var(--brass)); }
  @media (prefers-reduced-motion: reduce) { .slot { transition: none; } }
</style>
