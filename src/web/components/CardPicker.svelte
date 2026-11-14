<script lang="ts">
  import { RANK_LABELS, makeCard, rankOf, suitOf, type Card } from '../../games/cards';
  import { t } from '../lib/i18n.svelte';

  interface Props {
    /** The cards picked so far. */
    cards: Card[];
    max: number;
    onchange: (next: Card[]) => void;
  }
  let { cards, max, onchange }: Props = $props();

  const GLYPH = ['♠', '♥', '♦', '♣'];
  const RED = [false, true, true, false];
  const NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
  const speak = (c: Card) => `${RANK_LABELS[rankOf(c) - 1]} of ${NAMES[suitOf(c)]}`;

  function toggle(card: Card) {
    if (cards.includes(card)) onchange(cards.filter((c) => c !== card));
    else if (cards.length < max) onchange([...cards, card]);
  }
</script>

<div class="picker" role="group" aria-label={t('hand.pick')}>
  {#each [0, 1, 2, 3] as suit (suit)}
    <div class="suit-row">
      <span class="glyph" class:red={RED[suit]} aria-hidden="true">{GLYPH[suit]}</span>
      {#each RANK_LABELS as r, i (r)}
        {@const card = makeCard(suit, i + 1)}
        <button type="button" class="k" class:on={cards.includes(card)} class:red={RED[suit]} aria-pressed={cards.includes(card)} aria-label={speak(card)} onclick={() => toggle(card)}>{r}</button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .picker { display: grid; gap: 6px; }
  .suit-row { display: grid; grid-template-columns: 1.2em repeat(13, 1fr); gap: 3px; align-items: center; }
  .glyph { font-size: 1.1rem; text-align: center; }
  .k { min-height: 38px; padding: 0; font-size: .78rem; font-weight: 700; border-radius: 8px; }
  .k.on { background: var(--brass); color: #1d1608; border-color: var(--brass); }
  .red { color: var(--coral); }
  .k.on.red { color: #7a1d00; }
</style>
