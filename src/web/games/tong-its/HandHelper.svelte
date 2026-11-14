<script lang="ts">
  import {
    MAX_HAND, RANK_LABELS, countAces, discardAdvice, drawAdvice, makeCard, organize, pointsOf, rankOf, secretSets, suitOf,
    type Advice, type Card,
  } from '../../../games/tong-its/hand';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';

  let { code }: { code: string } = $props();

  const GLYPH = ['♠', '♥', '♦', '♣'];
  const RED = [false, true, true, false];
  const NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

  // The component is created per table, so `code` never changes while it is alive.
  // svelte-ignore state_referenced_locally
  const storeKey = `tt.hand.${code}`;
  function load(): Card[] {
    try {
      const raw = JSON.parse(getItem(storeKey) ?? '[]') as unknown;
      return Array.isArray(raw) && raw.every((c) => Number.isInteger(c) && c >= 0 && c <= 51) ? [...new Set(raw as number[])].slice(0, MAX_HAND) : [];
    } catch {
      return [];
    }
  }

  // The hand lives only in this browser. It is never sent to the table.
  let hand = $state<Card[]>(load());
  let which = $state(0);
  let outs = $state<Advice[] | null>(null);

  $effect(() => setItem(storeKey, JSON.stringify(hand)));

  const sorted = $derived([...hand].sort((a, b) => a - b));
  const arrangements = $derived(hand.length >= 3 ? organize(hand, 3) : []);
  const shown = $derived(arrangements[Math.min(which, Math.max(0, arrangements.length - 1))]);
  const discards = $derived(hand.length >= 13 ? discardAdvice(hand, 3) : []);
  const aces = $derived(countAces(hand));
  // Points of the cards not in a meld (or of every card until there are enough to group), like a live score for your hand.
  const pointsNow = $derived(shown ? shown.points : hand.reduce((sum, c) => sum + pointsOf(c), 0));

  function toggle(card: Card) {
    hand = hand.includes(card) ? hand.filter((c) => c !== card) : hand.length < MAX_HAND ? [...hand, card] : hand;
    which = 0;
    outs = null;
  }

  function clear() {
    hand = [];
    which = 0;
    outs = null;
  }

  function showOuts() {
    outs = drawAdvice(hand);
  }

  const label = (c: Card) => `${RANK_LABELS[rankOf(c) - 1]}${GLYPH[suitOf(c)]}`;
  const speak = (c: Card) => `${RANK_LABELS[rankOf(c) - 1]} of ${NAMES[suitOf(c)]}`;
</script>

{#snippet chip(c: Card)}<span class="pcard" class:red={RED[suitOf(c)]} aria-label={speak(c)}>{label(c)}</span>{/snippet}

<details class="card helper">
  <summary>{t('hand.title')}</summary>
  <p class="dim" style="margin: 8px 0">{t('hand.private')}</p>

  <div class="picker" role="group" aria-label={t('hand.pick')}>
    {#each [0, 1, 2, 3] as suit (suit)}
      <div class="suit-row">
        <span class="glyph" class:red={RED[suit]} aria-hidden="true">{GLYPH[suit]}</span>
        {#each RANK_LABELS as r, i (r)}
          {@const card = makeCard(suit, i + 1)}
          <button type="button" class="k" class:on={hand.includes(card)} class:red={RED[suit]} aria-pressed={hand.includes(card)} aria-label={speak(card)} onclick={() => toggle(card)}>{r}</button>
        {/each}
      </div>
    {/each}
  </div>

  <div class="row" style="margin-top: 10px">
    <div class="point" aria-live="polite"><small>{t('hand.point')}</small><b class="num">{pointsNow}</b></div>
    <span class="grow dim">{t('hand.count', { n: hand.length, max: MAX_HAND })}</span>
    <button type="button" class="ghost" disabled={hand.length === 0} onclick={clear}>{t('hand.clear')}</button>
  </div>

  {#if shown}
    <div class="result">
      {#if shown.points === 0}<p class="ready"><strong>{t('hand.ready')}</strong></p>{/if}

      {#each shown.melds as m, i (i)}
        <div class="meld"><small class="dim">{t(m.kind === 'set' ? 'hand.set' : 'hand.run')}</small> {#each m.cards as c (c)}{@render chip(c)}{/each}</div>
      {/each}
      {#if shown.deadwood.length > 0}
        <div class="meld"><small class="dim">{t('hand.loose', { n: shown.points })}</small> {#each shown.deadwood as c (c)}{@render chip(c)}{/each}</div>
      {/if}

      {#if secretSets(shown) > 0}<p class="tip">{t('hand.secret')}</p>{/if}
      {#if aces > 0}<p class="tip">{t('hand.aces', { n: aces })}</p>{/if}

      {#if arrangements.length > 1}
        <button type="button" class="ghost" onclick={() => (which = (which + 1) % arrangements.length)}>{t('hand.another', { n: (which % arrangements.length) + 1, of: arrangements.length })}</button>
      {/if}

      {#if discards.length > 0}
        <h3>{t('hand.discard')}</h3>
        <ul class="adv">{#each discards as d (d.card)}<li>{@render chip(d.card)} <span class="dim">{t('hand.leaves', { n: d.deadwoodAfter })}</span></li>{/each}</ul>
      {:else if hand.length >= 6 && hand.length < MAX_HAND}
        {#if outs === null}
          <button type="button" class="ghost" onclick={showOuts}>{t('hand.showOuts')}</button>
        {:else if outs.length === 0}
          <p class="dim">{t('hand.noOuts')}</p>
        {:else}
          <h3>{t('hand.outs')}</h3>
          <div class="meld">{#each outs.slice(0, 12) as o (o.card)}{@render chip(o.card)}{/each}</div>
          <p class="dim tip">{t('hand.outsNote')}</p>
        {/if}
      {/if}
    </div>
  {:else if hand.length > 0}
    <p class="dim">{t('hand.few')}</p>
  {/if}
</details>

<style>
  .helper summary { cursor: pointer; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent); }
  .picker { display: grid; gap: 6px; }
  .suit-row { display: grid; grid-template-columns: 1.2em repeat(13, 1fr); gap: 3px; align-items: center; }
  .glyph { font-size: 1.1rem; text-align: center; }
  .k { min-height: 38px; padding: 0; font-size: .78rem; font-weight: 700; border-radius: 8px; }
  .k.on { background: var(--brass); color: #1d1608; border-color: var(--brass); }
  .red { color: var(--coral); }
  .k.on.red { color: #7a1d00; }
  .point { display: grid; place-items: center; min-width: 4.2em; padding: 4px 10px; border-radius: 10px; background: var(--cream); color: #1b1b1b; border: 2px solid var(--brass); }
  .point small { font-size: .65rem; letter-spacing: .12em; font-weight: 800; color: #7a5a12; }
  .point b { font-size: 1.5rem; line-height: 1; }
  .result { margin-top: 12px; padding: 12px; background: var(--bg-deep); border-radius: 12px; }
  .meld { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
  .pcard { display: inline-block; min-width: 2.3em; text-align: center; padding: .25em .4em; background: var(--cream); color: #1b1b1b; border-radius: 7px; font-weight: 700; }
  .pcard.red { color: #c63a14; }
  .ready { color: var(--pos); margin: 0 0 6px; }
  .tip { font-size: .85rem; margin: 6px 0; }
  h3 { font-size: 1rem; margin: 12px 0 4px; color: var(--accent); }
  .adv { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
</style>
