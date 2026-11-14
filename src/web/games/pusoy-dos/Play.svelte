<script lang="ts">
  import type { PdMove, PdView } from '../../../games/pusoy-dos/engine';
  import { classify, playProblem } from '../../../games/pusoy-dos/engine';
  import { t } from '../../lib/i18n.svelte';
  import CardFan from '../../components/CardFan.svelte';

  interface Props {
    view: PdView;
    nameOf: (id: string) => string;
    onmove: (move: PdMove) => void;
  }
  let { view, nameOf, onmove }: Props = $props();

  let picked = $state<number[]>([]);
  // Drop any selection that is no longer in the hand (after a play or a new deal).
  $effect(() => {
    const have = new Set(view.hand);
    if (picked.some((c) => !have.has(c))) picked = picked.filter((c) => have.has(c));
  });

  const mine = $derived(view.you !== null && view.turn === view.you && !view.done);
  const chosen = $derived(view.hand.filter((c) => picked.includes(c)));
  const problem = $derived(chosen.length === 0 ? null : playProblem(view, chosen));
  const canPlay = $derived(mine && chosen.length > 0 && problem === null);
  const leadKind = $derived(view.lead ? classify(view.lead.cards)?.kind : null);

  function toggle(c: number) {
    if (!mine) return;
    picked = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
  }
  function play() {
    if (!canPlay) return;
    onmove({ t: 'play', cards: chosen });
    picked = [];
  }
  function pass() {
    onmove({ t: 'pass' });
    picked = [];
  }
  const status = $derived.by(() => {
    if (view.done) return t(view.scoring === 'placement' ? 'play.handOverPlace' : 'play.handOver', { name: nameOf(view.out[0] ?? '') });
    if (problem && mine) return t(problem === 'cannotBeat' ? 'play.cannotBeat' : problem === 'mustInclude' ? 'play.leadFirst' : 'play.notPlay');
    if (mine) return view.lead === null ? t(view.mustInclude !== null ? 'play.leadFirst' : 'play.lead') : t('play.beat', { name: nameOf(view.lead.by), what: t(`play.kind.${leadKind ?? 'single'}`) });
    return view.turn ? t('play.turnOf', { name: nameOf(view.turn) }) : '';
  });
  const passedNames = $derived(view.passed.map(nameOf).join(', '));
</script>

<div class="pd">
  <div class="status" class:mine aria-live="polite">{#if mine && !problem}<strong>{t('play.yourTurn')}</strong> · {/if}{status}</div>

  <div class="mat" aria-label={t('play.table')}>
    {#if view.lead}
      <span class="by">{nameOf(view.lead.by)} · {t(`play.kind.${leadKind ?? 'single'}`)}</span>
      <div class="pile"><CardFan cards={view.lead.cards} spread={view.lead.cards.length > 1 ? 10 : 0} maxW={70} label={t('play.table')} /></div>
      {#if passedNames}<span class="dim small">{t('play.passed')}: {passedNames}</span>{/if}
    {:else}
      <span class="dim">{t('play.nothing')}</span>
    {/if}
  </div>

  {#if view.done && view.hands}
    <div class="reveal">
      {#each view.players.filter((id) => id !== view.you && (view.hands?.[id]?.length ?? 0) > 0) as id (id)}
        <div class="rv"><span class="dim small who">{nameOf(id)}</span><div class="rvfan"><CardFan cards={view.hands[id] ?? []} spread={0} maxW={40} label={nameOf(id)} /></div></div>
      {/each}
    </div>
  {/if}

  {#if view.you !== null}
    <div class="hand"><CardFan cards={view.hand} selected={picked} onpick={toggle} maxW={124} label={t('play.yourHand')} /></div>
    <div class="row">
      <button type="button" class="primary" disabled={!canPlay} onclick={play}>{t('play.playBtn')}</button>
      <button type="button" disabled={!mine || view.lead === null} onclick={pass}>{t('play.passBtn')}</button>
      <button type="button" class="ghost" disabled={picked.length === 0} onclick={() => (picked = [])}>{t('play.clear')}</button>
    </div>
  {/if}
</div>

<style>
  .pd { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .row, .status { flex: none; }
  .status { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); font-size: var(--step--1); line-height: 1.3; }
  .status strong { font-family: var(--font-display); font-weight: 800; font-size: 1.05em; color: var(--accent); }
  .status.mine { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, transparent); }
  .mat { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; border-radius: 12px; border: 1px dashed var(--line); min-height: 90px; justify-content: center; flex: 0 1 150px; overflow: hidden; }
  .pile { width: 70%; flex: 1 1 auto; min-height: 60px; }
  .hand { flex: 1 1 0; min-height: 120px; max-height: 340px; }
  .by { font-size: .8rem; color: var(--text-dim); }
  .small { font-size: .75rem; }
  .reveal { display: flex; flex-direction: column; gap: 2px; }
  .rv { display: flex; align-items: center; gap: 6px; }
  .who { width: 64px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rvfan { flex: 1; height: 58px; }
  .row { display: flex; gap: 8px; }
  .row button { flex: 1; }
</style>
