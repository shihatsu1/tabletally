<script lang="ts">
  import { RANK_LABELS, rankOf, suitOf, type Card } from '../../../games/cards';
  import { MAX_HAND, countDeuces, organize, sortHand } from '../../../games/pusoy-dos/hand';
  import type { PusoyDosSetup } from '../../../games/pusoy-dos';
  import CardPicker from '../../components/CardPicker.svelte';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';

  let { code, setup }: { code: string; setup?: PusoyDosSetup } = $props();

  const GLYPH = ['♠', '♥', '♦', '♣'];
  const RED = [false, true, true, false];
  const NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

  // The component is created per table, so `code` never changes while it is alive.
  // svelte-ignore state_referenced_locally
  const storeKey = `tt.hand.${code}`;
  const max = $derived(Math.max(2, Math.min(setup?.startingHand ?? 13, MAX_HAND)));

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
  $effect(() => setItem(storeKey, JSON.stringify(hand)));

  const plan = $derived(hand.length > 0 ? organize(hand) : { plays: [] });
  const deuces = $derived(countDeuces(hand));
  const deuceOn = $derived(!!setup && setup.scoring !== 'placement' && setup.deuce !== 'off');

  const label = (c: Card) => `${RANK_LABELS[rankOf(c) - 1]}${GLYPH[suitOf(c)]}`;
  const speak = (c: Card) => `${RANK_LABELS[rankOf(c) - 1]} of ${NAMES[suitOf(c)]}`;
</script>

{#snippet chip(c: Card)}<span class="pcard" class:red={RED[suitOf(c)]} aria-label={speak(c)}>{label(c)}</span>{/snippet}

<details class="card helper">
  <summary>{t('hand.dos.title')}</summary>
  <p class="dim" style="margin: 8px 0">{t('hand.private')}</p>

  <CardPicker cards={hand} max={max} onchange={(next) => (hand = next)} />

  <div class="row" style="margin-top: 10px">
    <div class="point" aria-live="polite"><small>{t('hand.dos.cards')}</small><b class="num">{hand.length}</b></div>
    <span class="grow dim">{t('hand.count', { n: hand.length, max })}</span>
    <button type="button" class="ghost" disabled={hand.length === 0} onclick={() => (hand = [])}>{t('hand.clear')}</button>
  </div>

  {#if plan.plays.length > 0}
    <div class="result">
      <p class="turns"><strong>{t('hand.dos.turns', { n: plan.plays.length })}</strong></p>
      {#each plan.plays as p, i (i)}
        <div class="meld"><small class="dim">{t(`play.${p.kind}`)}</small> {#each sortHand(p.cards) as c (c)}{@render chip(c)}{/each}</div>
      {/each}
      <p class="dim tip">{t('hand.dos.order')}</p>
      {#if deuces > 0 && deuceOn}<p class="tip">{t('hand.dos.deuces', { n: deuces })}</p>{/if}
    </div>
  {/if}
</details>

<style>
  .helper summary { cursor: pointer; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent); }
  .point { display: grid; place-items: center; min-width: 4.2em; padding: 4px 10px; border-radius: 10px; background: var(--cream); color: #1b1b1b; border: 2px solid var(--brass); }
  .point small { font-size: .65rem; letter-spacing: .12em; font-weight: 800; color: #7a5a12; }
  .point b { font-size: 1.5rem; line-height: 1; }
  .result { margin-top: 12px; padding: 12px; background: var(--bg-deep); border-radius: 12px; }
  .meld { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
  .pcard { display: inline-block; min-width: 2.3em; text-align: center; padding: .25em .4em; background: var(--cream); color: #1b1b1b; border-radius: 7px; font-weight: 700; }
  .pcard.red { color: #c63a14; }
  .turns { margin: 0 0 6px; color: var(--pos); }
  .tip { font-size: .85rem; margin: 6px 0; }
</style>
