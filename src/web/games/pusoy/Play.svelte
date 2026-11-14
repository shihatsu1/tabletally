<script lang="ts">
  import { arrangementProblem, eval3, eval5, type Arrangement, type PsMove, type PsView } from '../../../games/pusoy/engine';
  import { pairFor } from '../../../games/pusoy';
  import { fmt } from '../../lib/format';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';
  import CardFan from '../../components/CardFan.svelte';
  import HeldRows from '../../components/HeldRows.svelte';
  import Icon from '../../components/Icon.svelte';

  interface Props {
    view: PsView;
    /** The hand's stake, so the reveal can show points in the table's unit. */
    stake?: number;
    nameOf: (id: string) => string;
    onmove: (move: PsMove) => void;
  }
  let { view, stake = 1, nameOf, onmove }: Props = $props();

  type Row = 'front' | 'middle' | 'back';
  // Held like a hand of cards: the top row (3) at the back, the bottom row (5) in front.
  const ROWS: Row[] = ['front', 'middle', 'back'];
  const SPAN: Record<Row, [number, number]> = { front: [0, 3], middle: [3, 8], back: [8, 13] };
  const KINDS = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];

  /** All 13 cards, always in the hand: slots 0-2 are the top row, 3-7 the middle, 8-12 the bottom. */
  let layout = $state<number[]>([]);
  let sel = $state<number | null>(null);
  let rulesOpen = $state(false);
  /** The order warning only appears once you have started rearranging (a fresh deal is never in order). */
  let touched = $state(false);

  // The layout survives a refresh, but only for the hand now being played (one key, overwritten on each deal).
  const STORE = 'tt.pusoy.layout';
  const shuffled = (hand: readonly number[]): number[] => {
    const a = [...hand];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j] as number, a[i] as number];
    }
    return a;
  };
  function restore(hand: readonly number[]): number[] | null {
    try {
      const raw = JSON.parse(getItem(STORE) ?? 'null') as { hand?: string; layout?: unknown } | null;
      const saved = raw?.layout;
      return raw?.hand === hand.join(',') && Array.isArray(saved) && saved.length === 13 && hand.every((c) => (saved as number[]).includes(c)) ? (saved as number[]) : null;
    } catch {
      return null;
    }
  }
  const save = (hand: readonly number[], next: readonly number[]): void => setItem(STORE, JSON.stringify({ hand: hand.join(','), layout: next }));

  // A new deal arrives already held in a 3-5-5 split, in no particular order, like picking up your cards.
  let dealt = '';
  $effect(() => {
    const key = view.hand.join(',');
    if (key !== dealt && view.hand.length === 13) {
      dealt = key;
      const saved = restore(view.hand);
      layout = saved ?? shuffled(view.hand);
      if (!saved) save(view.hand, layout);
      sel = null;
      touched = false;
    }
  });

  const rows = $derived<Record<Row, number[]>>({
    front: layout.slice(...SPAN.front),
    middle: layout.slice(...SPAN.middle),
    back: layout.slice(...SPAN.back),
  });
  const problem = $derived(layout.length === 13 ? arrangementProblem(rows as Arrangement, view.hand) : 'sizes');
  const kindOf = (a: Record<Row, readonly number[]>, row: Row): string => {
    const e = row === 'front' ? eval3(a.front as number[]) : eval5(a[row] as number[]);
    return t(`pusoy.play.hand.${KINDS[e.cat]}`);
  };
  const labelsOf = (a: Record<Row, readonly number[]>): string[] => ROWS.map((r) => `${t(`pusoy.play.row.${r}`)} · ${kindOf(a, r)}`);

  function pick(card: number) {
    const i = layout.indexOf(card);
    if (i < 0) return;
    if (sel === null) sel = card;
    else if (sel === card) sel = null;
    else {
      const j = layout.indexOf(sel);
      const next = [...layout];
      [next[i], next[j]] = [next[j] as number, next[i] as number];
      layout = next;
      sel = null;
      touched = true;
      save(view.hand, next);
    }
  }
  /** Move the whole middle row to the bottom and the bottom row to the middle (both hold 5 cards). */
  function swapRows() {
    if (layout.length !== 13) return;
    const next = [...rows.front, ...rows.back, ...rows.middle];
    layout = next;
    sel = null;
    touched = true;
    save(view.hand, next);
  }
  function confirm() {
    if (problem !== null) return;
    onmove({ t: 'set', back: rows.back, middle: rows.middle, front: rows.front });
  }
  const waiting = $derived(view.waiting.filter((id) => id !== view.you));
  const settled = $derived(view.mine !== null || view.myNatural !== null);

  // --- the reveal: you first, then everyone else in seat order
  const order = $derived(view.you ? [view.you, ...view.players.filter((id) => id !== view.you)] : view.players);
  const MARK: Record<number, string> = { 1: '✓', [-1]: '✗', 0: '=' };
  const markName: Record<number, string> = { 1: 'pusoy.play.rowWon', [-1]: 'pusoy.play.rowLost', 0: 'pusoy.play.rowTie' };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (rulesOpen = false)} />
<div class="ps">
  <button type="button" class="ghost rules-toggle" aria-expanded={rulesOpen} aria-label={t('pusoy.play.rulesTitle')} onclick={() => (rulesOpen = !rulesOpen)}><Icon name="help" /></button>
  {#if rulesOpen}
    <div class="rules" role="dialog" aria-label={t('pusoy.play.rulesTitle')}>
      <strong>{t('pusoy.play.rulesTitle')}</strong>
      <ul>
        <li>{t('pusoy.play.rule.layout')}</li>
        <li>{t('pusoy.play.rule.swap')}</li>
        <li>{t('pusoy.play.rule.swapRows')}</li>
        <li>{t('pusoy.play.rule.order')}</li>
        <li>{t('pusoy.play.rule.ranks')}</li>
        <li>{t('pusoy.play.rule.secret')}</li>
      </ul>
      <button type="button" class="ghost" onclick={() => (rulesOpen = false)}>{t('room.closeMenu')}</button>
    </div>
  {/if}

  {#if view.done && view.reveal}
    <p class="dim small legend">{view.you ? t('pusoy.play.revealHelp') : t('pusoy.play.revealHelpAll')}</p>
    <div class="reveal">
      {#each order as id (id)}
        {@const r = view.reveal[id]}
        {@const pr = view.you && id !== view.you && view.outcome ? pairFor(view.outcome, view.you, id) : null}
        {@const units = view.outcome?.units[id] ?? 0}
        <div class="player" class:me={id === view.you}>
          <div class="phead">
            <strong class="pn">{id === view.you ? t('room.you') : nameOf(id)}</strong>
            {#if pr}<span class="vs dim">{t('pusoy.play.vsYou', { n: fmt(pr.units * stake) })}</span>{/if}
            <b class="num" class:pos={units > 0} class:neg={units < 0}>{fmt(units * stake)}</b>
          </div>
          {#if r?.natural}
            <span class="nat">{t('pusoy.play.natural', { name: t(`pusoy.n.${r.natural}`) })}</span>
          {:else if r?.arrangement}
            {@const arr = r.arrangement}
            <div class="rows3">
              {#each ROWS as row, k (row)}
                <div class="cell">
                  <span class="mk" class:w={pr?.how === 'rows' && pr.rows[k] === 1} class:l={pr?.how === 'rows' && pr.rows[k] === -1}>
                    {#if pr?.how === 'rows'}
                      <!-- marks are from your side: ✓ your row beat theirs -->
                      <span aria-hidden="true">{MARK[pr.rows[k] ?? 0]}</span><span class="sr-only">{t(markName[pr.rows[k] ?? 0] ?? '')}</span>
                    {/if}
                    {kindOf(arr, row)}
                  </span>
                  <div class="mini"><CardFan cards={arr[row]} spread={0} maxW={64} label={`${nameOf(id)}: ${t(`pusoy.play.row.${row}`)}`} /></div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if settled}
    {#if view.mine}
      {@const mine = view.mine as Arrangement}
      <div class="hand"><HeldRows rows={[mine.front, mine.middle, mine.back]} labels={labelsOf(mine)} label={t('play.yourHand')} /></div>
    {/if}
    <p class="dim small">{view.myNatural ? t('pusoy.play.declared', { name: t(`pusoy.n.${view.myNatural}`) }) : t('pusoy.play.setDone')}{#if waiting.length > 0} · {t('pusoy.play.waiting', { names: waiting.map(nameOf).join(', ') })}{/if}</p>
  {:else if view.you !== null && layout.length === 13}
    {#each view.eligible as key (key)}
      <button type="button" class="nat-btn" onclick={() => onmove({ t: 'natural', key })}>
        {t('pusoy.play.declare', { name: t(`pusoy.n.${key}`), n: view.naturalValues[key] ?? 0 })}
      </button>
    {/each}

    <div class="hand">
      <HeldRows rows={[rows.front, rows.middle, rows.back]} labels={labelsOf(rows)} selected={sel} onpick={pick} bad={touched && problem === 'order'} label={t('play.yourHand')} />
    </div>
    {#if touched && problem === 'order'}<p class="hint" role="alert">{t('pusoy.play.order')}</p>{/if}
    <div class="acts">
      <button type="button" onclick={swapRows}>⇅ {t('pusoy.play.swapRows')}</button>
      <button type="button" class="primary" disabled={problem !== null} onclick={confirm}>{t('pusoy.play.confirm')}</button>
    </div>
    {#if waiting.length > 0}<p class="dim small">{t('pusoy.play.waiting', { names: waiting.map(nameOf).join(', ') })}</p>{/if}
  {/if}
</div>

<style>
  .ps { position: relative; display: flex; flex-direction: column; gap: 6px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .rules-toggle { position: absolute; right: 0; top: -4px; width: 44px; min-height: 0; height: 44px; padding: 0; border-radius: 50%; z-index: 6; display: grid; place-items: center; color: var(--accent); border: 0; }
  /* an overlay on the whole screen (the screen is the containing block), so the play area never clips it */
  .rules { position: fixed; z-index: 25; right: 10px; top: 52px; max-height: calc(100% - 64px); overflow-y: auto; width: min(320px, calc(100% - 20px)); padding: 10px 14px; border-radius: 12px; border: 1px solid var(--brass); background: var(--felt-900, #0b2f25); color: var(--cream, #f3e9d2); box-shadow: 0 8px 24px rgba(0,0,0,.5); font-size: .85rem; }
  .rules ul { margin: 6px 0 8px; padding-left: 1.1em; }
  .rules li { margin: .3em 0; }
  .hand { flex: 1 1 0; min-height: 200px; padding-right: 2px; }
  .nat-btn { width: 100%; }
  .acts { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .acts button { min-height: 44px; padding: 6px 8px; line-height: 1.15; }
  .hint { margin: 0; color: #ffb79e; font-size: .8rem; text-align: center; }
  .small { margin: 0; font-size: .78rem; text-align: center; }
  .legend { padding-right: 44px; text-align: left; }
  .reveal { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 5px; overflow: hidden; }
  .player { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; padding: 4px 6px; border: 1px solid var(--line); border-radius: 10px; }
  .player.me { border-color: var(--brass); background: color-mix(in srgb, var(--brass) 8%, transparent); }
  .phead { display: flex; align-items: baseline; gap: 8px; font-size: .8rem; }
  .pn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vs { font-size: .72rem; }
  .rows3 { flex: 1; min-height: 0; display: grid; grid-template-columns: 3fr 4fr 4fr; gap: 6px; }
  .cell { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .mk { font-size: .66rem; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mk.w { color: var(--pos); }
  .mk.l { color: var(--neg); }
  .mk > span[aria-hidden] { font-weight: 800; margin-right: 3px; }
  .mini { flex: 1; min-height: 34px; }
  .nat { color: var(--brass-soft, var(--brass)); font-size: .85rem; }
</style>
