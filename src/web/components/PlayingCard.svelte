<script lang="ts">
  import { RANK_LABELS, rankOf, suitOf } from '../../games/cards';
  import { t } from '../lib/i18n.svelte';

  interface Props {
    /** 0..51, or null for a face-down card. */
    card: number | null;
    selected?: boolean;
    /** Lit up as a suggestion (for example the cards the top discard would meld with). */
    hint?: boolean;
    /** Width in px. Height follows the real card ratio. */
    size?: number;
    onclick?: () => void;
  }
  let { card, selected = false, hint = false, size = 46, onclick }: Props = $props();

  // Card suits are S H D C (the sprite's rows); ranks A..K are its columns.
  const GLYPH = ['♠', '♥', '♦', '♣'];
  const SUIT_KEY = ['spades', 'hearts', 'diamonds', 'clubs'];
  const rank = $derived(card === null ? '' : (RANK_LABELS[rankOf(card) - 1] ?? ''));
  const suit = $derived(card === null ? 0 : suitOf(card));
  const red = $derived(suit === 1 || suit === 2);
  const label = $derived(card === null ? t('card.back') : t('card.name', { rank, suit: t(`card.${SUIT_KEY[suit]}`) }));
  // Position in the 13 x 4 sprite, as background percentages.
  const pos = $derived(card === null ? '' : `${((rankOf(card) - 1) * 100) / 12}% ${(suit * 100) / 3}%`);
</script>

{#snippet face()}
  {#if card === null}
    <span class="back" aria-hidden="true"></span>
  {:else}
    <!-- every card, at any size, is the real card picture; the text index only shows if the image cannot load -->
    <span class="idx" class:red aria-hidden="true"><b>{rank}</b><i>{GLYPH[suit]}</i></span>
    <span class="art" style="background-position: {pos}" aria-hidden="true"></span>
  {/if}
{/snippet}

{#if onclick}
  <button type="button" class="card" class:selected class:hint style="--cw: {size}px" aria-pressed={selected} aria-label={label} {onclick}>{@render face()}</button>
{:else}
  <span class="card" class:selected class:hint style="--cw: {size}px" role="img" aria-label={label}>{@render face()}</span>
{/if}

<style>
  .card {
    /* margin: 0 because the page-wide .card panel style would otherwise push every playing card down 14 px */
    position: relative; display: block; flex: none; overflow: hidden; margin: 0;
    width: var(--cw); height: calc(var(--cw) * 1.4536); padding: 0; min-height: 0;
    border-radius: calc(var(--cw) * .065); border: 1px solid #b9b2a0; background: #fff;
    box-shadow: -1px 2px 5px rgba(0,0,0,.4); cursor: default; color: #1d1608;
  }
  button.card { cursor: pointer; }
  .hint { border-color: var(--pos); box-shadow: 0 0 0 3px var(--pos), 0 0 14px color-mix(in srgb, var(--pos) 70%, transparent); }
  .selected { border-color: var(--brass); box-shadow: 0 0 0 3px var(--brass), 0 6px 14px rgba(0,0,0,.5); }
  .idx { position: absolute; left: 6%; top: 3%; display: flex; flex-direction: column; align-items: center; line-height: .95; font-family: var(--font-display); }
  .idx b { font-size: calc(var(--cw) * .24); }
  .idx i { font-style: normal; font-size: calc(var(--cw) * .22); }
  .idx.red { color: #c0392b; }
  .art { position: absolute; inset: 0; background-image: url('/cards/deck.webp'); background-size: 1300% 400%; background-repeat: no-repeat; }
  .back {
    position: absolute; inset: 0; border-radius: inherit; border: calc(var(--cw) * .06) solid #fbf5e1;
    background:
      repeating-linear-gradient(45deg, rgba(201,162,75,.55) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(-45deg, rgba(201,162,75,.55) 0 2px, transparent 2px 7px),
      var(--felt-800, #0b3b2e);
  }
</style>
