<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RoomView } from '../../../shared/protocol';
  import type { TongItsSetup } from '../../../games/tong-its';
  import { potContender, potDealsSince } from './pot';
  import { canSapaw, keepsDiscardMeld, meldKind, meldsContaining, type TiMove, type TiView } from '../../../games/tong-its/engine';
  import { RANK_LABELS, bestDeadwood, organize, rankOf, suitOf } from '../../../games/tong-its/hand';
  import { t } from '../../lib/i18n.svelte';
  import CardFan from '../../components/CardFan.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';
  import HowToPlay from '../../components/HowToPlay.svelte';

  interface Props {
    timer?: Snippet;
    view: TiView;
    /** Points per chip for this hand. */
    stake?: number;
    nameOf: (id: string) => string;
    onmove: (move: TiMove) => void;
    room?: RoomView;
  }
  let { timer, view, stake = 1, nameOf, onmove, room }: Props = $props();

  // The pot on the table: one ante from each player for every deal since it was last collected, this deal included.
  // Only while the hand is on: once it is over the room history already holds it (and "Last hand" is an old view).
  const pot = $derived.by(() => {
    if (!room || view.done) return null;
    const ante = (room.setup as TongItsSetup).potAnte;
    if (!ante) return null;
    const chips = (potDealsSince(room.rounds) + 1) * ante * view.players.length;
    return { chips, value: chips * stake, unit: room.unit };
  });

  const contender = $derived(room ? potContender(room.rounds) : null);

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
  // Stock and discard cards shrink a little on narrow phones so the piles and the pot share one row.
  let winW = $state(400);
  let winH = $state(800);
  const pileSize = $derived(winW > winH && winH <= 600 ? 30 : winW < 400 ? 42 : 50);
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
  // Shown melds are drawn as large as the space allows: the cards of a meld overlap like a held hand (each shows its
  // corner), every player's melds wrap onto as few lines as fit, and the size is the largest at which all the lines
  // fit the height the table area has left for them (the table and your hand share the free height).
  const MELD_SHOW = 0.42; // share of a card's width left showing beside the next card
  const NAME_W = 58;
  let meldsW = $state(320);
  let meldsH = $state(120);
  const canAdd = (m: TiView['melds'][number]): boolean =>
    myTurn && view.phase === 'play' && one !== null && !m.hidden && canSapaw(m.kind, m.cards, one) && allowed([one]);
  const meldSize = $derived.by(() => {
    const budget = winW > winH && winH <= 600 ? Math.max(meldsH, 90) : meldsH;
    const width = (m: TiView['melds'][number], cw: number): number =>
      m.cards.length === 0 ? 86 : cw * (1 + (m.cards.length - 1) * MELD_SHOW);
    // Lines the melds take at card width cw, wrapping exactly as the flex row does: each player's row starts with
    // the name (NAME_W), items are 8 px apart, and an item that does not fit starts a new full-width line.
    // A meld wider than the whole area can never fit, so that size is rejected.
    const linesAt = (cw: number): number => {
      let lines = 0;
      for (const o of byOwner) {
        let used = NAME_W;
        lines++;
        for (const m of o.melds) {
          const w = width(m, cw);
          if (w > meldsW) return Infinity;
          if (used + 8 + w > meldsW) {
            lines++;
            used = w;
          } else used += 8 + w;
        }
      }
      return lines;
    };
    for (let cw = 52; cw > 14; cw -= 2) {
      const n = linesAt(cw);
      if (n * cw * 1.4536 + (n - 1) * 3 <= budget) return cw;
    }
    return 14;
  });
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
  /** A suggested meld you could lay down right now with ✓. */
  const canLay = (m: number[]): boolean => myTurn && view.phase === 'play' && !choosing && meldKind(m) !== null && allowed(m);
  const SUIT_MARK = ['\u2660\uFE0E', '\u2665\uFE0E', '\u2666\uFE0E', '\u2663\uFE0E'];
  const short = (c: number): string => `${RANK_LABELS[rankOf(c) - 1]}${SUIT_MARK[suitOf(c)]}`;
  const RULES = ['tong.rule.draw', 'tong.rule.meld', 'tong.rule.sapaw', 'tong.rule.discard', 'tong.rule.draw2', 'tong.rule.tongits', 'tong.rule.helper'];
  const byOwner = $derived(view.players.map((id) => ({ id, melds: view.melds.filter((m) => m.owner === id) })).filter((o) => o.melds.length > 0));
</script>

<svelte:window bind:innerWidth={winW} bind:innerHeight={winH} onkeydown={(e) => e.key === 'Escape' && (pileOpen = false)} />
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
    {#if timer}<span class="turn-timer">{@render timer()}</span>{/if}
    <HowToPlay small title={t('play.howTo')} items={RULES.map((k) => t(k))} />
  </div>

  <div class="mat">
    <div class="piles" style="--ps: {pileSize}px">
      <!-- the stock is a real stack of face-down cards; on your draw you tap it to draw -->
      {#snippet stack()}
        {#each Array.from({ length: Math.min(view.stockCount, 4) }, (_, k) => k) as k (k)}
          <span class="layer" style="--k: {k}"><PlayingCard card={null} size={pileSize} /></span>
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
            {#each view.discards.slice(-3, -1) as c, k (c)}<span class="under" style="--k: {k}"><PlayingCard card={c} size={pileSize} /></span>{/each}
            {#if canTakeNow}
              <button type="button" class="dtop live" class:on={choosing} aria-label={t('tong.play.takeDiscard')} aria-pressed={choosing} onclick={tapDiscard}><PlayingCard card={top} size={pileSize} /></button>
            {:else}
              <button type="button" class="dtop" aria-label={t('tong.play.seePile', { n: view.discards.length })} onclick={() => (pileOpen = true)}><PlayingCard card={top} size={pileSize} /></button>
            {/if}
            <button type="button" class="dcount" aria-label={t('tong.play.seePile', { n: view.discards.length })} onclick={() => (pileOpen = true)}>{view.discards.length}</button>
          </span>
        {:else}<span class="dim">—</span>{/if}
      </span>
      {#if pot}
        <span class="potbox" role="img" aria-label={`${t('tong.play.potIs', { n: pot.value, unit: pot.unit, chips: pot.chips })}. ${contender ? t('tong.streak', { name: nameOf(contender) }) : t('tong.noContender')}`}>
          <span class="dim small">{t('tong.potTitle')}</span>
          <strong class="potamt">{pot.value}</strong>
          <span class="potsub">{pot.unit} · {t('tong.play.potChips', { n: pot.chips })}</span>
          <span class="potsub">{contender ? t('tong.streak', { name: nameOf(contender) }) : t('tong.noContender')}</span>
        </span>
      {/if}
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex: shown melds can scroll in landscape -->
    <div class="melds" role="region" aria-label={t('tong.play.meld')} tabindex="0" bind:clientWidth={meldsW} bind:clientHeight={meldsH} style="--show: {MELD_SHOW}">
      {#each byOwner as o (o.id)}
        <div class="owner">
          <span class="dim small name">{nameOf(o.id)}</span>
          {#each o.melds as m (m.id)}
            {#snippet meldCards()}
              {#if m.cards.length === 0}<span class="dim small">{t('tong.play.hiddenSet', { n: m.size })}</span>{/if}
              {#each m.cards as c (c)}<PlayingCard card={c} size={meldSize} />{/each}
            {/snippet}
            {#if canAdd(m)}
              <button type="button" class="meld target" aria-label={`${t('tong.play.layoff')}: ${nameOf(o.id)}, ${m.cards.map(short).join(' ')}`} onclick={() => one !== null && send({ t: 'sapaw', meld: m.id, card: one })}>{@render meldCards()}</button>
            {:else}
              <span class="meld">{@render meldCards()}</span>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>

  {#if view.done && view.hands}
    <div class="reveal">
      {#each view.players.filter((id) => id !== me) as id (id)}
        <div class="rv"><span class="dim small who">{nameOf(id)}</span><div class="rvfan"><CardFan cards={[...(view.hands[id] ?? [])].sort(byRank)} spread={0} maxW={40} label={nameOf(id)} /></div><span class="card-count">{t('tong.play.points', { n: bestDeadwood(view.hands[id] ?? []) })}</span></div>
      {/each}
    </div>
  {/if}

  {#if me !== null}
    {#if !view.done && (held.melds.length > 0 || loose.length > 0 || points !== null)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex: the landscape region can scroll independently -->
      <div class="helper" role="region" aria-label={t('play.yourHand')} tabindex="0">
        {#each held.melds as m (m.join('.'))}
          <span class="chip">
            <span class="chipcards">{#each m as c (c)}<PlayingCard card={c} size={22} />{/each}</span>
            {#if canLay(m)}<button type="button" class="cbtn ok" aria-label={t('tong.play.layMeld', { cards: m.map(short).join(' ') })} onclick={() => send({ t: 'meld', cards: m })}>✓</button>{/if}
            <button type="button" class="cbtn" aria-label={t('tong.play.ungroup', { cards: m.map(short).join(' ') })} onclick={() => (loose = [...loose, ...m])}>✕</button>
          </span>
        {/each}
        {#if loose.length > 0}<button type="button" class="chip again" onclick={() => (loose = [])}>{t('tong.play.regroup')}</button>{/if}
        {#if points !== null}<span class="points" aria-live="polite"><span class="sr-only">{t('tong.play.points', { n: points })}</span><span aria-hidden="true">{points}</span></span>{/if}
      </div>
    {/if}
    <div class="hand"><CardFan cards={held.cards} spread={winW > winH && winH <= 600 ? 0 : undefined} gaps={held.gaps} selected={picked} hinted={useWith} onpick={toggle} maxW={124} label={t('play.yourHand')} />{#if view.done}<span class="card-count own-count">{t('tong.play.points', { n: bestDeadwood(view.hand) })}</span>{/if}</div>

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
  .turn-timer { position: relative; width: 36px; height: 36px; flex: none; }
  .status { display: flex; align-items: center; gap: 6px; }
  .status .msg { flex: 1; min-width: 0; }
  .ti { display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .row, .status { flex: none; }
  .hand { position: relative; flex: 1 1 0; min-height: 120px; max-height: 340px; }
  .helper { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .chip { min-height: 40px; padding: 2px 4px; border-radius: 999px; font-size: .78rem; display: inline-flex; gap: 2px; align-items: center; border: 1px solid var(--line); background: color-mix(in srgb, var(--brass) 12%, transparent); }
  .cbtn { width: 32px; min-height: 32px; height: 32px; padding: 0; border-radius: 50%; border: 0; background: none; color: var(--text-dim); font-size: .95rem; }
  .cbtn.ok { color: #1d1608; background: var(--pos); font-weight: 800; }
  .chipcards { display: inline-flex; pointer-events: none; }
  .chipcards > :global(* + *) { margin-left: -9px; }
  .chip.again { background: none; color: var(--accent); padding: 2px 12px; }
  .points { margin-left: auto; font-size: .78rem; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--accent); }
  .status { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); font-size: var(--step--1); line-height: 1.3; }
  .status strong { font-family: var(--font-display); font-weight: 800; font-size: 1.05em; color: var(--accent); }
  .status.mine { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 14%, transparent); }
  .mat { padding: 6px 8px; border-radius: 12px; border: 1px dashed var(--line); display: flex; flex-direction: column; gap: 6px; flex: 1.6 1 0; min-height: 0; overflow: hidden; }
  .piles { display: flex; gap: clamp(8px, 4vw, 22px); justify-content: center; align-items: center; min-width: 0; }
  .pile { display: inline-flex; gap: 6px; align-items: center; }
  /* on narrow phones the pile names go above the piles, so stock, discard and pot fit in one row */
  @media (max-width: 400px) { .pile { flex-direction: column; gap: 2px; } }
  /* the pot sits on the table with the two piles */
  .potbox { display: inline-flex; flex-direction: column; align-items: center; min-width: 0; max-width: 92px; line-height: 1.1; padding: 4px 8px; border: 1px dashed rgba(243, 233, 210, .5); border-radius: 14px; }
  .potamt { font-family: var(--font-display); font-size: var(--step-1); color: var(--brass-soft); font-variant-numeric: lining-nums; }
  .potsub { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: .66rem; color: var(--text-dim); white-space: nowrap; }
  .row { min-height: 44px; }
  /* the discard pile: up to two older cards peek out to the left of the top card */
  .dpile { position: relative; display: block; width: calc(var(--ps) + 16px); height: calc(var(--ps) * 1.4536); }
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
  .stock { position: relative; display: block; width: calc(var(--ps) + 8px); height: calc(var(--ps) * 1.4536 + 8px); padding: 0; min-height: 0; border: 0; background: none; border-radius: 6px; }
  .stock .layer { position: absolute; left: calc(var(--k) * 2px); top: calc(8px - var(--k) * 2px); }
  .stock .count { position: absolute; right: -8px; bottom: -6px; z-index: 5; min-width: 24px; padding: 1px 6px; border-radius: 999px; background: var(--bg-deep); border: 1px solid var(--line); font-size: .75rem; text-align: center; color: var(--accent); }
  .stock.live { cursor: pointer; animation: stock-glow 1.4s ease-in-out infinite; }
  .stock.live .layer:last-of-type :global(.card) { box-shadow: 0 0 0 3px var(--brass-soft), 0 6px 14px rgba(0,0,0,.5); }
  .stock.live:active { transform: translateY(1px); }
  @keyframes stock-glow { 50% { filter: drop-shadow(0 0 10px var(--brass)); } }
  @media (prefers-reduced-motion: reduce) { .stock.live { animation: none; } }
  /* fills what is left of the table area; its height decides how big the meld cards can be */
  .melds { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 3px; }
  .owner { display: flex; flex-wrap: wrap; gap: 3px 8px; align-items: center; }
  /* a fixed width that the meld-size estimate (NAME_W) relies on */
  .name { flex: none; width: 58px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meld { display: inline-flex; gap: 0; align-items: center; }
  /* each card covers most of the one before it, leaving its corner showing */
  .meld > :global(.card + .card) { margin-left: calc(var(--cw) * (var(--show) - 1)); }
  .target { min-height: 0; padding: 0; border: 0; border-radius: 5px; background: transparent; outline: 3px solid var(--pos); outline-offset: 2px; cursor: pointer; }
  .small { font-size: .75rem; }
  .reveal { display: flex; flex-direction: column; gap: 2px; }
  .rv { display: flex; align-items: center; gap: 6px; }
  .who { width: 64px; flex: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rvfan { flex: 1; min-width: 0; height: 58px; }
  .card-count { flex: none; color: var(--accent); font-size: .75rem; white-space: nowrap; }
  .own-count { position: absolute; right: 0; top: 0; }
  .row { display: flex; gap: 6px; }
  .row button { flex: 1; padding-inline: .4em; font-size: .9rem; }
  @media (orientation: landscape) and (max-height: 600px) {
    .ti { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) minmax(95px, 1.25fr) auto; gap: 2px 8px; }
    .status { grid-column: 1 / -1; padding: 2px 6px; }
    .mat { position: relative; grid-column: 1 / -1; grid-row: 2; overflow: visible; flex-direction: row; align-items: stretch; pointer-events: none; }
    .piles { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); gap: 5px; pointer-events: auto; }
    .pile .small { display: none; }
    .potbox { padding: 2px; max-width: 60px; }
    .melds { flex: 0 1 28%; min-width: 0; overflow-y: auto; pointer-events: auto; }
    .helper { grid-column: 2; grid-row: 2; margin-left: 45%; overflow-y: auto; align-content: start; }
    .hand { grid-column: 1 / -1; grid-row: 3; min-height: 0; height: 100%; }
    .row { grid-column: 1 / -1; grid-row: 4; }
    .reveal { grid-column: 2; grid-row: 2; overflow-y: auto; }
  }
</style>
