<script lang="ts">
  import { canSapaw, keepsDiscardMeld, meldKind, meldsContaining, type TiMove, type TiView } from '../../../games/tong-its/engine';
  import { RANK_LABELS, bestDeadwood, organize, rankOf, suitOf } from '../../../games/tong-its/hand';
  import { t } from '../../lib/i18n.svelte';
  import CardFan from '../../components/CardFan.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';

  interface Props {
    view: TiView;
    nameOf: (id: string) => string;
    onmove: (move: TiMove) => void;
  }
  let { view, nameOf, onmove }: Props = $props();

  let picked = $state<number[]>([]);
  // Drop any selection that is no longer in the hand (after a move or a new deal).
  $effect(() => {
    const have = new Set(view.hand);
    if (picked.some((c) => !have.has(c))) picked = picked.filter((c) => have.has(c));
  });

  const me = $derived(view.you);
  const myTurn = $derived(me !== null && view.toAct === me && !view.done);
  const chosen = $derived(view.hand.filter((c) => picked.includes(c)));
  const top = $derived(view.discards[view.discards.length - 1]);
  const canTake = $derived(top !== undefined && meldsContaining(view.hand, top).length > 0);
  const kind = $derived(chosen.length >= 3 ? meldKind(chosen) : null);
  const iAmOpen = $derived(me !== null && view.opened.includes(me));
  const one = $derived(chosen.length === 1 ? (chosen[0] as number) : null);
  // After taking a discard, do not allow moves that would use up the cards its meld needs.
  const allowed = (used: number[]): boolean => keepsDiscardMeld(view.mustMeld, view.hand, view.melds, used);
  const meldOk = $derived(kind !== null && allowed(chosen));

  function toggle(c: number) {
    if (!myTurn || view.phase !== 'play') return;
    picked = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
  }
  function send(move: TiMove) {
    onmove(move);
    picked = [];
  }
  const status = $derived.by(() => {
    if (view.done) return t('tong.play.over', { name: nameOf(view.end?.winner ?? '') });
    if (view.phase === 'fight' && view.fight) {
      return view.toAct === me ? t('tong.play.answer', { name: nameOf(view.fight.caller) }) : t('tong.play.called', { name: nameOf(view.fight.caller) });
    }
    if (!myTurn) return t('play.turnOf', { name: nameOf(view.toAct ?? view.turn) });
    if (view.phase === 'draw') return t('tong.play.draw');
    if (view.mustMeld !== null) return t('tong.play.mustMeld');
    return view.firstTurn ? t('tong.play.first') : t('tong.play.act');
  });
  // However many melds there are, they shrink to fit; the hand and the buttons below are never squeezed out.
  const meldCards = $derived(view.melds.reduce((a, m) => a + m.size, 0));
  const meldSize = $derived(meldCards <= 10 ? 24 : meldCards <= 18 ? 18 : 14);
  // Points the cards in hand would count if the hand ended now (the lowest after the best melds).
  const points = $derived(view.hand.length > 0 && view.hand.length <= 13 ? bestDeadwood(view.hand) : null);
  /**
   * Your hand as a player would hold it: the melds you could lay down first, each kept together with a gap
   * after it, then the other cards in order of rank (A, 2, 3 ... K), not by suit.
   */
  const byRank = (a: number, b: number): number => rankOf(a) - rankOf(b) || a - b;
  /** Cards you put back into your hand: they are never grouped into a suggested meld again while you hold them. */
  let loose = $state<number[]>([]);
  $effect(() => {
    const have = new Set(view.hand);
    if (loose.some((c) => !have.has(c))) loose = loose.filter((c) => have.has(c));
  });
  const held = $derived.by(() => {
    const plain = { cards: [...view.hand].sort(byRank), gaps: [] as number[], melds: [] as number[][] };
    if (view.hand.length === 0 || view.hand.length > 14) return plain;
    const free = view.hand.filter((c) => !loose.includes(c));
    const best = free.length > 0 ? organize(free, 1)[0] : undefined;
    if (!best) return plain;
    const cards: number[] = [];
    const gaps: number[] = [];
    const melds: number[][] = [];
    for (const m of [...best.melds].sort((x, y) => Math.min(...x.cards.map(rankOf)) - Math.min(...y.cards.map(rankOf)))) {
      if (cards.length > 0) gaps.push(cards.length);
      const group = [...m.cards].sort(byRank);
      melds.push(group);
      cards.push(...group);
    }
    const rest = [...best.deadwood, ...view.hand.filter((c) => loose.includes(c))].sort(byRank);
    if (cards.length > 0 && rest.length > 0) gaps.push(cards.length);
    cards.push(...rest);
    return { cards, gaps, melds };
  });
  // \uFE0E keeps phones from drawing the suits as coloured emoji
  const SUIT_MARK = ['\u2660\uFE0E', '\u2665\uFE0E', '\u2666\uFE0E', '\u2663\uFE0E'];
  const short = (c: number): string => `${RANK_LABELS[rankOf(c) - 1]}${SUIT_MARK[suitOf(c)]}`;
  const byOwner = $derived(view.players.map((id) => ({ id, melds: view.melds.filter((m) => m.owner === id) })).filter((o) => o.melds.length > 0));
</script>

<div class="ti">
  <div class="status" class:mine={myTurn} aria-live="polite">{#if myTurn}<strong>{t('play.yourTurn')}</strong> · {/if}{status}</div>

  <div class="mat">
    <div class="piles">
      <span class="pile"><span class="dim small">{t('tong.play.stock')}</span><strong>{view.stockCount}</strong></span>
      <span class="pile"><span class="dim small">{t('tong.play.discard')}</span>{#if top !== undefined}<PlayingCard card={top} size={44} />{:else}<span class="dim">—</span>{/if}</span>
    </div>
    <div class="melds">
      {#each byOwner as o (o.id)}
        <div class="owner">
          <span class="dim small name">{nameOf(o.id)}</span>
          {#each o.melds as m (m.id)}
            <span class="meld">
              {#if m.cards.length === 0}<span class="dim small">{t('tong.play.hiddenSet', { n: m.size })}</span>{/if}
              {#each m.cards as c (c)}<PlayingCard card={c} size={meldSize} />{/each}
              {#if myTurn && view.phase === 'play' && one !== null && !m.hidden && canSapaw(m.kind, m.cards, one) && allowed([one])}
                <button type="button" class="add" aria-label={t('tong.play.layoff')} onclick={() => send({ t: 'sapaw', meld: m.id, card: one })}>+</button>
              {/if}
            </span>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  {#if view.done && view.hands}
    <div class="reveal">
      {#each view.players.filter((id) => id !== me && (view.hands?.[id]?.length ?? 0) > 0) as id (id)}
        <div class="rv"><span class="dim small who">{nameOf(id)}</span><div class="rvfan"><CardFan cards={[...(view.hands[id] ?? [])].sort(byRank)} spread={0} maxW={40} label={nameOf(id)} /></div></div>
      {/each}
    </div>
  {/if}

  {#if me !== null}
    {#if !view.done && (held.melds.length > 0 || loose.length > 0 || points !== null)}
      <div class="helper">
        {#each held.melds as m (m.join('.'))}
          <button type="button" class="chip" aria-label={t('tong.play.ungroup', { cards: m.map(short).join(' ') })} onclick={() => (loose = [...loose, ...m])}>
            {#each m as c (c)}<span class:red={suitOf(c) === 1 || suitOf(c) === 2}>{short(c)}</span>{/each}<span class="x" aria-hidden="true">✕</span>
          </button>
        {/each}
        {#if loose.length > 0}<button type="button" class="chip again" onclick={() => (loose = [])}>{t('tong.play.regroup')}</button>{/if}
        {#if points !== null}<span class="points" aria-live="polite">{t('tong.play.points', { n: points })}</span>{/if}
      </div>
    {/if}
    <div class="hand"><CardFan cards={held.cards} gaps={held.gaps} selected={picked} onpick={toggle} maxW={124} label={t('play.yourHand')} /></div>

    {#if myTurn && view.phase === 'draw'}
      <div class="row">
        <button type="button" class="primary" onclick={() => send({ t: 'draw', from: 'stock' })}>{t('tong.play.drawStock')}</button>
        <button type="button" disabled={!canTake} onclick={() => send({ t: 'draw', from: 'discard' })}>{t('tong.play.takeDiscard')}</button>
        {#if iAmOpen}<button type="button" class="ghost" onclick={() => send({ t: 'fight' })}>{t('tong.play.callDraw')}</button>{/if}
      </div>
    {:else if myTurn && view.phase === 'play'}
      <div class="row">
        <button type="button" class="primary" disabled={!meldOk} onclick={() => send({ t: 'meld', cards: chosen })}>{t('tong.play.meld')}</button>
        <button type="button" disabled={!(kind === 'set' && chosen.length === 4 && meldOk)} onclick={() => send({ t: 'meld', cards: chosen, hidden: true })}>{t('tong.play.meldSecret')}</button>
        <button type="button" disabled={one === null || view.mustMeld !== null} onclick={() => one !== null && send({ t: 'discard', card: one })}>{t('tong.play.discardBtn')}</button>
      </div>
    {:else if myTurn && view.phase === 'fight'}
      <div class="row">
        <button type="button" onclick={() => send({ t: 'respond', challenge: false })}>{t('tong.play.fold')}</button>
        <button type="button" class="primary" onclick={() => send({ t: 'respond', challenge: true })}>{t('tong.play.challenge')}</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .ti { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .row, .status { flex: none; }
  .hand { flex: 1 1 0; min-height: 120px; max-height: 340px; }
  .helper { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .chip { min-height: 32px; padding: 2px 8px; border-radius: 999px; font-size: .78rem; display: inline-flex; gap: 3px; align-items: center; background: color-mix(in srgb, var(--brass) 12%, transparent); }
  .chip .red { color: var(--neg); }
  .chip .x { margin-left: 3px; color: var(--text-dim); }
  .chip.again { background: none; color: var(--accent); }
  .points { margin-left: auto; font-size: .78rem; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--accent); }
  .status { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); font-size: var(--step--1); line-height: 1.3; }
  .status strong { font-family: var(--font-display); font-weight: 800; font-size: 1.05em; color: var(--accent); }
  .status.mine { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, transparent); }
  .mat { padding: 6px 8px; border-radius: 12px; border: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; flex: 0 1 auto; min-height: 0; overflow: hidden; }
  .piles { display: flex; gap: 22px; justify-content: center; align-items: center; }
  .pile { display: inline-flex; gap: 6px; align-items: center; }
  .melds { display: flex; flex-direction: column; gap: 3px; }
  .owner { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
  .name { min-width: 4.5em; max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meld { display: inline-flex; gap: 0; align-items: center; }
  .meld > :global(* + *) { margin-left: -3px; }
  .add { min-height: 0; width: 32px; height: 32px; padding: 0; border-radius: 50%; margin-left: 3px; font-weight: 800; }
  .small { font-size: .75rem; }
  .reveal { display: flex; flex-direction: column; gap: 2px; }
  .rv { display: flex; align-items: center; gap: 6px; }
  .who { width: 64px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rvfan { flex: 1; height: 58px; }
  .row { display: flex; gap: 6px; }
  .row button { flex: 1; padding-inline: .4em; font-size: .9rem; }
</style>
