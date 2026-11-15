<script lang="ts">
  import type { PkMove, PkView } from '../../../games/poker/engine';
  import { t } from '../../lib/i18n.svelte';
  import CardFan from '../../components/CardFan.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';
  import HowToPlay from '../../components/HowToPlay.svelte';

  interface Props {
    view: PkView;
    nameOf: (id: string) => string;
    onmove: (move: PkMove) => void;
  }
  let { view, nameOf, onmove }: Props = $props();

  const KINDS = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
  // On a very short screen (a phone on its side) the cards shrink so everything still fits without scrolling.
  let winH = $state(800);
  const board = $derived(winH < 460 ? 40 : winH < 700 ? 46 : 54);
  const me = $derived(view.you);
  const myTurn = $derived(me !== null && view.toAct === me && !view.done);
  const mySeat = $derived(me ? view.seat[me] : undefined);

  let raiseOpen = $state(false);
  let amount = $state(0);
  // A new turn or street starts with the raise panel closed and the slider at the smallest raise.
  $effect(() => {
    void view.street;
    void view.toAct;
    raiseOpen = false;
    amount = view.raise?.min ?? 0;
  });

  const bounds = $derived(view.raise);
  const clamp = (n: number): number => (bounds ? Math.max(bounds.min, Math.min(bounds.max, Math.round(n))) : n);
  const allIn = $derived(bounds !== null && amount >= bounds.max);
  const potFraction = (f: number): number => clamp((mySeat?.bet ?? 0) + view.toCall + (view.pot + view.toCall) * f);
  const blindLine = $derived(`${view.blinds.sb}/${view.blinds.bb}`);

  const status = $derived.by(() => {
    if (view.done) {
      const w = view.wins ?? [];
      return w.length === 0 ? t('poker.handOver') : w.map((x) => t('poker.wins', { name: nameOf(x.id), n: x.amount })).join(' · ');
    }
    if (myTurn) return view.toCall === 0 ? '' : t('poker.yourTurnCall', { n: view.toCall });
    return view.toAct ? t('play.turnOf', { name: nameOf(view.toAct) }) : '';
  });
  const slots = [0, 1, 2, 3, 4];
  const RULES = ['poker.rule.deal', 'poker.rule.act', 'poker.rule.win', 'poker.rule.chips'];
  // At the end the cards of every other player still in the hand are turned face up (yours stay in your hand below).
  const shown = $derived(view.done && view.reveal ? view.reveal.filter((r) => r.id !== me) : []);
  const wonBy = (id: string): number => (view.wins ?? []).filter((w) => w.id === id).reduce((a, w) => a + w.amount, 0);
</script>

<svelte:window bind:innerHeight={winH} />
<div class="pk">
  <div class="status" class:mine={myTurn} aria-live="polite">
    <span class="msg">{#if myTurn}<strong>{t('play.yourTurn')}</strong>{#if status}{' · '}{/if}{/if}{status}</span>
    <HowToPlay small title={t('play.howTo')} items={RULES.map((k) => t(k))} />
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex: showdown results can scroll on short screens -->
  <div class="felt" role="region" aria-label={t('poker.board')} tabindex="0">
    <div class="info">
      <span class="pot">{t('poker.pot')} <strong>{view.pot}</strong></span>
      <span class="dim small">{t(`poker.street.${view.street}`)} · {blindLine}</span>
    </div>
    <div class="board" role="group" aria-label={t('poker.board')}>
      {#each slots as i (i)}
        {#if view.board[i] !== undefined}<PlayingCard card={view.board[i] as number} size={board} />{:else}<span class="empty" style="width: {board}px; height: {Math.round(board * 1.4)}px"></span>{/if}
      {/each}
    </div>
    {#if shown.length > 0}
      <div class="reveal" class:two={shown.length > 3} role="list" aria-label={t('poker.allHands')}>
        {#each shown as r (r.id)}
          {@const won = wonBy(r.id)}
          <div class="rv" class:won={won > 0} role="listitem">
            <span class="cards">{#each r.hole as c (c)}<PlayingCard card={c} size={shown.length > 3 ? 24 : 30} />{/each}</span>
            <span class="who">
              <span class="nm">{nameOf(r.id)}{#if won > 0}<b>+{won}</b>{/if}</span>
              <span class="kd">{r.cat !== null ? t(`pusoy.play.hand.${KINDS[r.cat]}`) : ''}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if me !== null}
    <div class="hole">
      <div class="holefan" class:folded={mySeat?.folded}><CardFan cards={view.hole} spread={14} maxW={100} label={t('play.yourHand')} /></div>
      {#if mySeat?.folded}<span class="dim small">{t('poker.folded')}</span>{:else if mySeat?.allIn}<span class="small">{t('poker.allin')}</span>{/if}
    </div>

    {#if myTurn}
      {#if raiseOpen && bounds}
        <div class="raise">
          <div class="quick">
            <button type="button" class="ghost" onclick={() => (amount = bounds.min)}>{t('poker.min')}</button>
            <button type="button" class="ghost" aria-label={t('poker.halfPot')} onclick={() => (amount = potFraction(0.5))}>½</button>
            <button type="button" class="ghost" onclick={() => (amount = potFraction(1))}>{t('poker.potBtn')}</button>
            <button type="button" class="ghost" onclick={() => (amount = bounds.max)}>{t('poker.allinBtn')}</button>
          </div>
          <input type="range" min={bounds.min} max={bounds.max} step="1" value={amount} aria-label={t('poker.raiseTo')} oninput={(e) => (amount = clamp(Number(e.currentTarget.value)))} />
          <div class="row">
            <button type="button" class="ghost" onclick={() => (raiseOpen = false)}>{t('room.renameCancel')}</button>
            <button type="button" class="primary" onclick={() => onmove({ t: 'raise', to: clamp(amount) })}>{allIn ? t('poker.allinTo', { n: clamp(amount) }) : t('poker.raiseToBtn', { n: clamp(amount) })}</button>
          </div>
        </div>
      {:else}
        <div class="row">
          <button type="button" onclick={() => onmove({ t: 'fold' })}>{t('poker.fold')}</button>
          {#if view.toCall === 0}
            <button type="button" class="primary" onclick={() => onmove({ t: 'check' })}>{t('poker.check')}</button>
          {:else}
            <button type="button" class="primary" onclick={() => onmove({ t: 'call' })}>{t('poker.call', { n: view.toCall })}</button>
          {/if}
          <button type="button" disabled={bounds === null} onclick={() => (raiseOpen = true)}>{view.toCall === 0 ? t('poker.bet') : t('poker.raise')}</button>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .status { display: flex; align-items: center; gap: 6px; }
  .status .msg { flex: 1; min-width: 0; }
  .pk { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .row, .raise { flex: none; }
  .hole { flex: 1 1 0; min-height: 64px; max-height: 190px; }
  .holefan { width: min(240px, 100%); height: 100%; margin: 0 auto; }
  .holefan.folded { opacity: .5; }
  .status { flex: none; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); font-size: var(--step--1); line-height: 1.3; }
  .status strong { font-family: var(--font-display); font-weight: 800; font-size: 1.05em; color: var(--accent); }
  .status.mine { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, transparent); }
  .felt { padding: 8px; border-radius: 14px; border: 1px solid var(--line); background: radial-gradient(ellipse at 50% 40%, var(--felt-600, #1b6a50), var(--felt-700, #135340) 60%, var(--felt-900, #0b2f25)); display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .info { display: flex; gap: 10px; align-items: baseline; color: var(--cream, #f3e9d2); }
  .pot strong { font-family: var(--font-display); font-weight: 800; font-size: var(--step-2); font-variant-numeric: lining-nums; text-shadow: var(--sign-shadow); }
  .board { display: flex; gap: 4px; justify-content: center; }
  .empty { border-radius: 6px; border: 1px dashed rgba(243,233,210,.35); }
  .reveal { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; width: 100%; color: var(--cream, #f3e9d2); }
  .reveal.two { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 6px; }
  .rv { display: flex; align-items: center; gap: 5px; min-width: 0; max-width: 100%; padding: 1px 4px; border-radius: 8px; border: 1px solid transparent; }
  .rv.won { border-color: var(--brass-soft); background: rgba(0,0,0,.18); }
  .cards { display: inline-flex; flex: none; }
  .cards { gap: 2px; }
  .who { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
  .nm, .kd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm { font-size: .75rem; }
  .nm b { margin-left: .35em; color: var(--brass-soft); }
  .kd { font-size: .68rem; opacity: .8; }
  .hole { display: flex; flex-direction: column; gap: 2px; align-items: center; }
  .small { font-size: .75rem; }
  .row { display: flex; gap: 8px; }
  .row button { flex: 1; }
  .raise { display: flex; flex-direction: column; gap: 6px; }
  .quick { display: flex; gap: 6px; }
  .quick button { flex: 1; min-height: 44px; padding-inline: .3em; }
  input[type='range'] { width: 100%; min-height: 44px; }
  /* a phone on its side: the table and your cards on the left, the actions on the right, so nothing is pushed off screen */
  @media (orientation: landscape) and (max-height: 600px) {
    .pk { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr) minmax(180px, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 4px 8px; align-items: stretch; }
    .pk > .status { grid-column: 1 / -1; padding: 2px 6px; }
    .pk > .felt { grid-column: 1; grid-row: 2; justify-content: center; overflow-y: auto; }
    .pk > .hole { grid-column: 2; grid-row: 2; max-height: none; min-height: 0; }
    .pk > .row, .pk > .raise { grid-column: 3; grid-row: 2; align-self: center; }
    .pk > .row { flex-wrap: wrap; }
    .raise { gap: 2px; }
    .quick { flex-wrap: wrap; }
  }
</style>
