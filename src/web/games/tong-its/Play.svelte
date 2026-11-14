<script lang="ts">
  import { canSapaw, keepsDiscardMeld, meldKind, meldsContaining, type TiMove, type TiView } from '../../../games/tong-its/engine';
  import { RANK_LABELS, bestDeadwood, organize, rankOf, suitOf } from '../../../games/tong-its/hand';
  import { t } from '../../lib/i18n.svelte';
  import CardFan from '../../components/CardFan.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';
  import HowToPlay from '../../components/HowToPlay.svelte';

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
  const canDraw = $derived(myTurn && view.phase === 'draw' && view.stockCount > 0);
  const canTake = $derived(top !== undefined && meldsContaining(view.hand, top).length > 0);
  /** On your draw, when the top discard makes a meld with your cards: you may take it, and those cards light up. */
  const canTakeNow = $derived(myTurn && view.phase === 'draw' && canTake);
  const useWith = $derived(canTakeNow && top !== undefined ? [...new Set(meldsContaining(view.hand, top).flat())].filter((c) => c !== top) : []);
  let pileOpen = $state(false);
  /**
   * Taking the top discard always lays its meld down at once. With only one way to meld it (two matching cards)
   * that happens on the tap; with more, you first tap the cards to meld it with, then Show meld.
   */
  let choosing = $state(false);
  $effect(() => {
    if (!canTakeNow) choosing = false;
  });
  const takeMeld = $derived(choosing && top !== undefined && picked.length >= 2 ? [...picked, top] : null);
  const takeOk = $derived(takeMeld !== null && meldKind(takeMeld) !== null);
  function takeAndMeld(cards: number[]) {
    onmove({ t: 'draw', from: 'discard' });
    onmove({ t: 'meld', cards });
    picked = [];
    choosing = false;
  }
  function tapDiscard() {
    if (!canTakeNow || top === undefined) return;
    if (useWith.length === 2) takeAndMeld([...useWith, top]);
    else {
      choosing = true;
      picked = [];
    }
  }
  const kind = $derived(chosen.length >= 3 ? meldKind(chosen) : null);
  const iAmOpen = $derived(me !== null && view.opened.includes(me));
  const one = $derived(chosen.length === 1 ? (chosen[0] as number) : null);
  // After taking a discard, do not allow moves that would use up the cards its meld needs.
  const allowed = (used: number[]): boolean => keepsDiscardMeld(view.mustMeld, view.hand, view.melds, used);
  const meldOk = $derived(kind !== null && allowed(chosen));

  function toggle(c: number) {
    if (choosing) {
      if (useWith.includes(c)) picked = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
      return;
    }
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
    if (view.mustMeld !== null) return t('tong.play.mustMeld');
    return '';
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
  const RULES = ['tong.rule.draw', 'tong.rule.meld', 'tong.rule.sapaw', 'tong.rule.discard', 'tong.rule.draw2', 'tong.rule.tongits', 'tong.rule.helper'];
  const byOwner = $derived(view.players.map((id) => ({ id, melds: view.melds.filter((m) => m.owner === id) })).filter((o) => o.melds.length > 0));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (pileOpen = false)} />
<div class="ti">
  {#if pileOpen}
    <div class="pilelist" role="dialog" aria-label={t('tong.play.pileTitle', { n: view.discards.length })}>
      <strong>{t('tong.play.pileTitle', { n: view.discards.length })}</strong>
      <p class="dim small">{t('tong.play.pileOrder')}</p>
      <div class="pilecards">{#each view.discards as c (c)}<PlayingCard card={c} size={44} />{/each}</div>
      <button type="button" class="ghost" onclick={() => (pileOpen = false)}>{t('room.closeMenu')}</button>
    </div>
  {/if}
  <div class="status" class:mine={myTurn} aria-live="polite">
    <span class="msg">{#if myTurn}<strong>{t('play.yourTurn')}</strong>{#if status} · {/if}{/if}{status}</span>
    <HowToPlay small title={t('play.howTo')} items={RULES.map((k) => t(k))} />
  </div>

  <div class="mat">
    <div class="piles">
      <!-- the stock is a real stack of face-down cards; on your draw you tap it to draw -->
      {#snippet stack()}
        {#each Array.from({ length: Math.min(view.stockCount, 4) }, (_, k) => k) as k (k)}
          <span class="layer" style="--k: {k}"><PlayingCard card={null} size={50} /></span>
        {/each}
        <b class="count">{view.stockCount}</b>
      {/snippet}
      <span class="pile"><span class="dim small" aria-hidden="true">{t('tong.play.stock')}</span>
      {#if canDraw}
        <button type="button" class="stock live" aria-label={`${t('tong.play.drawStock')} (${view.stockCount})`} onclick={() => send({ t: 'draw', from: 'stock' })}>{@render stack()}</button>
      {:else}
        <span class="stock" role="img" aria-label={`${t('tong.play.stock')}: ${view.stockCount}`}>{@render stack()}</span>
      {/if}
      </span>
      <span class="pile"><span class="dim small" aria-hidden="true">{t('tong.play.discard')}</span>
        {#if top !== undefined}
          <!-- the discard pile: the top card in front of the last few; tap it to take the card when you can, otherwise to see the whole pile -->
          <span class="dpile">
            {#each view.discards.slice(-3, -1) as c, k (c)}<span class="under" style="--k: {k}"><PlayingCard card={c} size={50} /></span>{/each}
            {#if canTakeNow}
              <button type="button" class="dtop live" class:on={choosing} aria-label={t('tong.play.takeDiscard')} aria-pressed={choosing} onclick={tapDiscard}><PlayingCard card={top} size={50} /></button>
            {:else}
              <button type="button" class="dtop" aria-label={t('tong.play.seePile', { n: view.discards.length })} onclick={() => (pileOpen = true)}><PlayingCard card={top} size={50} /></button>
            {/if}
            <button type="button" class="dcount" aria-label={t('tong.play.seePile', { n: view.discards.length })} onclick={() => (pileOpen = true)}>{view.discards.length}</button>
          </span>
        {:else}<span class="dim">—</span>{/if}
      </span>
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
            <span class="chipcards">{#each m as c (c)}<PlayingCard card={c} size={22} />{/each}</span><span class="x" aria-hidden="true">✕</span>
          </button>
        {/each}
        {#if loose.length > 0}<button type="button" class="chip again" onclick={() => (loose = [])}>{t('tong.play.regroup')}</button>{/if}
        {#if points !== null}<span class="points" aria-live="polite">{t('tong.play.points', { n: points })}</span>{/if}
      </div>
    {/if}
    <div class="hand"><CardFan cards={held.cards} gaps={held.gaps} selected={picked} hinted={useWith} onpick={toggle} maxW={124} label={t('play.yourHand')} /></div>

    {#if myTurn && view.phase === 'draw' && choosing}
      <div class="row">
        <button type="button" class="primary" disabled={!takeOk} onclick={() => takeMeld && takeAndMeld(takeMeld)}>{t('tong.play.meld')}</button>
        <button type="button" class="ghost" onclick={() => { choosing = false; picked = []; }}>{t('tong.play.cancel')}</button>
      </div>
    {:else if myTurn && view.phase === 'draw'}
      <div class="row">
        {#if iAmOpen && me !== null && !view.drawBlocked.includes(me)}<button type="button" class="ghost" onclick={() => send({ t: 'fight' })}>{t('tong.play.callDraw')}</button>{/if}
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
  .status { display: flex; align-items: center; gap: 6px; }
  .status .msg { flex: 1; min-width: 0; }
  .ti { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .row, .status { flex: none; }
  .hand { flex: 1 1 0; min-height: 120px; max-height: 340px; }
  .helper { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .chip { min-height: 40px; padding: 2px 8px 2px 4px; border-radius: 999px; font-size: .78rem; display: inline-flex; gap: 3px; align-items: center; background: color-mix(in srgb, var(--brass) 12%, transparent); }
  .chipcards { display: inline-flex; pointer-events: none; }
  .chipcards > :global(* + *) { margin-left: -9px; }
  .chip .x { margin-left: 3px; color: var(--text-dim); }
  .chip.again { background: none; color: var(--accent); }
  .points { margin-left: auto; font-size: .78rem; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--accent); }
  .status { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); font-size: var(--step--1); line-height: 1.3; }
  .status strong { font-family: var(--font-display); font-weight: 800; font-size: 1.05em; color: var(--accent); }
  .status.mine { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, transparent); }
  .mat { padding: 6px 8px; border-radius: 12px; border: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; flex: 0 1 auto; min-height: 0; overflow: hidden; }
  .piles { display: flex; gap: 22px; justify-content: center; align-items: center; }
  .pile { display: inline-flex; gap: 6px; align-items: center; }
  .row { min-height: 44px; }
  /* the discard pile: up to two older cards peek out to the left of the top card */
  .dpile { position: relative; display: block; width: 66px; height: 73px; }
  .dpile .under { position: absolute; top: 0; left: calc(var(--k) * 8px); }
  .dtop { position: absolute; top: 0; left: 16px; padding: 0; min-height: 0; border: 0; background: none; border-radius: 6px; z-index: 3; }
  .dtop.live { animation: stock-glow 1.4s ease-in-out infinite; }
  .dtop.on { animation: none; transform: translateY(-6px); }
  .dtop.live :global(.card) { box-shadow: 0 0 0 3px var(--pos), 0 6px 14px rgba(0,0,0,.5); }
  .dcount { position: absolute; right: -10px; bottom: -8px; z-index: 5; min-width: 28px; min-height: 24px; padding: 1px 6px; border-radius: 999px; background: var(--bg-deep); border: 1px solid var(--line); font-size: .75rem; color: var(--accent); }
  @media (prefers-reduced-motion: reduce) { .dtop.live { animation: none; } }
  .pilelist { position: fixed; z-index: 25; left: 10px; right: 10px; top: 52px; max-height: calc(100% - 64px); overflow-y: auto; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--brass); background: var(--felt-900, #0b2f25); color: var(--cream, #f3e9d2); box-shadow: 0 8px 24px rgba(0,0,0,.5); }
  .pilecards { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
  .pilelist > button { min-height: 40px; padding: 6px 18px; }
  /* the stock: up to four face-down cards, each a little up and to the left of the one below */
  .stock { position: relative; display: block; width: 58px; height: 81px; padding: 0; min-height: 0; border: 0; background: none; border-radius: 6px; }
  .stock .layer { position: absolute; left: calc(var(--k) * 2px); top: calc(8px - var(--k) * 2px); }
  .stock .count { position: absolute; right: -8px; bottom: -6px; z-index: 5; min-width: 24px; padding: 1px 6px; border-radius: 999px; background: var(--bg-deep); border: 1px solid var(--line); font-size: .75rem; text-align: center; color: var(--accent); }
  .stock.live { cursor: pointer; animation: stock-glow 1.4s ease-in-out infinite; }
  .stock.live .layer:last-of-type :global(.card) { box-shadow: 0 0 0 3px var(--brass-soft), 0 6px 14px rgba(0,0,0,.5); }
  .stock.live:active { transform: translateY(1px); }
  @keyframes stock-glow { 50% { filter: drop-shadow(0 0 10px var(--brass)); } }
  @media (prefers-reduced-motion: reduce) { .stock.live { animation: none; } }
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
