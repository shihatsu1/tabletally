<script lang="ts">
  import { arrangementProblem, eval3, eval5, type Arrangement, type PsMove, type PsView } from '../../../games/pusoy/engine';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';
  import CardFan from '../../components/CardFan.svelte';
  import PlayingCard from '../../components/PlayingCard.svelte';

  interface Props {
    view: PsView;
    nameOf: (id: string) => string;
    onmove: (move: PsMove) => void;
  }
  let { view, nameOf, onmove }: Props = $props();

  type Row = 'front' | 'middle' | 'back';
  // Held like a hand of cards: the weakest row on top, the strongest at the bottom.
  const ROWS: Row[] = ['front', 'middle', 'back'];
  const SPAN: Record<Row, [number, number]> = { front: [0, 3], middle: [3, 8], back: [8, 13] };
  const KINDS = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];

  /** All 13 cards, always in the hand: slots 0-2 are the front, 3-7 the middle, 8-12 the back. */
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
      const layout = raw?.layout;
      return raw?.hand === hand.join(',') && Array.isArray(layout) && layout.length === 13 && hand.every((c) => (layout as number[]).includes(c)) ? (layout as number[]) : null;
    } catch {
      return null;
    }
  }
  const save = (hand: readonly number[], layout: readonly number[]): void => setItem(STORE, JSON.stringify({ hand: hand.join(','), layout }));

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
  const kindOf = (row: Row): string => {
    const e = row === 'front' ? eval3(rows.front) : eval5(rows[row]);
    return t(`pusoy.play.hand.${KINDS[e.cat]}`);
  };

  function tap(i: number) {
    if (sel === null) sel = i;
    else if (sel === i) sel = null;
    else {
      const next = [...layout];
      [next[sel], next[i]] = [next[i] as number, next[sel] as number];
      layout = next;
      sel = null;
      touched = true;
      save(view.hand, next);
    }
  }
  function confirm() {
    if (problem !== null) return;
    onmove({ t: 'set', back: rows.back, middle: rows.middle, front: rows.front });
  }
  const waiting = $derived(view.waiting.filter((id) => id !== view.you));
  const settled = $derived(view.mine !== null || view.myNatural !== null);

</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (rulesOpen = false)} />
<div class="ps">
  <button type="button" class="rules-toggle" aria-expanded={rulesOpen} aria-label={t('pusoy.play.rulesTitle')} onclick={() => (rulesOpen = !rulesOpen)}>?</button>
  {#if rulesOpen}
    <div class="rules" role="button" tabindex="0" aria-label={t('pusoy.play.rulesTitle')} onclick={() => (rulesOpen = false)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (rulesOpen = false)}>
      <strong>{t('pusoy.play.rulesTitle')}</strong>
      <ul>
        <li>{t('pusoy.play.rule.layout')}</li>
        <li>{t('pusoy.play.rule.swap')}</li>
        <li>{t('pusoy.play.rule.order')}</li>
        <li>{t('pusoy.play.rule.ranks')}</li>
        <li>{t('pusoy.play.rule.secret')}</li>
      </ul>
    </div>
  {/if}

  {#if view.done && view.reveal}
    <div class="grid">
      {#each view.players as id (id)}
        {@const r = view.reveal[id]}
        <div class="player" class:me={id === view.you}>
          <strong class="pn">{nameOf(id)}</strong>
          {#if r?.natural}
            <span class="nat">{t('pusoy.play.natural', { name: t(`pusoy.n.${r.natural}`) })}</span>
          {:else if r?.arrangement}
            {#each ROWS as row (row)}
              <span class="cards">{#each r.arrangement[row] as c (c)}<PlayingCard card={c} size={22} />{/each}</span>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
  {:else if settled}
    <div class="held">
      {#each ROWS as row (row)}
        {#if view.mine}<CardFan cards={(view.mine as Arrangement)[row]} tilt={3} maxW={40} fit />{/if}
      {/each}
    </div>
    <p class="dim small">{view.myNatural ? t('pusoy.play.declared', { name: t(`pusoy.n.${view.myNatural}`) }) : t('pusoy.play.setDone')}{#if waiting.length > 0} · {t('pusoy.play.waiting', { names: waiting.map(nameOf).join(', ') })}{/if}</p>
  {:else if view.you !== null && layout.length === 13}
    {#each view.eligible as key (key)}
      <button type="button" class="nat-btn" onclick={() => onmove({ t: 'natural', key })}>
        {t('pusoy.play.declare', { name: t(`pusoy.n.${key}`), n: view.naturalValues[key] ?? 0 })}
      </button>
    {/each}

    <div class="held" class:bad={touched && problem === 'order'}>
      {#each ROWS as row (row)}
        <div class="fanrow">
          <span class="kind">{kindOf(row)}</span>
          <CardFan cards={rows[row]} selected={sel === null ? [] : [layout[sel] as number]} onpick={(c) => tap(layout.indexOf(c))} tilt={3} maxW={40} fit />
        </div>
      {/each}
    </div>

    <div class="row">
      <button type="button" class="primary" disabled={problem !== null} onclick={confirm}>{t('pusoy.play.confirm')}</button>
    </div>
    {#if touched && problem === 'order'}<p class="hint">{t('pusoy.play.order')}</p>{/if}
    {#if waiting.length > 0}<p class="dim small">{t('pusoy.play.waiting', { names: waiting.map(nameOf).join(', ') })}</p>{/if}
  {/if}
</div>

<style>
  .ps { position: relative; display: flex; flex-direction: column; gap: 6px; padding-right: 34px; min-height: 0; flex: 0 1 auto; max-height: 100%; }
  .rules-toggle { position: absolute; right: 0; top: 0; width: 30px; min-height: 0; height: 30px; padding: 0; border-radius: 50%; font-weight: 700; z-index: 6; }
  /* an overlay on the whole screen (the screen is the containing block), so the play area never clips it */
  .rules { position: fixed; z-index: 25; right: 10px; top: 52px; max-height: calc(100% - 64px); overflow-y: auto; width: min(320px, calc(100% - 20px)); padding: 10px 14px; border-radius: 12px; border: 1px solid var(--brass); background: var(--felt-900, #0b2f25); color: var(--cream, #f3e9d2); box-shadow: 0 8px 24px rgba(0,0,0,.5); font-size: .85rem; }
  .rules ul { margin: 6px 0 0; padding-left: 1.1em; }
  .rules li { margin: .3em 0; }
  .held { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; flex: 1 1 auto; min-height: 0; }
  .held.bad .fanrow { outline: 2px solid color-mix(in srgb, var(--coral, #ff9a78) 70%, transparent); outline-offset: 2px; border-radius: 10px; }
  .fanrow { position: relative; flex: 1 1 74px; min-height: 36px; }
  .kind { position: absolute; left: 2px; top: 0; font-size: .68rem; color: var(--brass-soft, var(--brass)); z-index: 2; }
  .row { display: flex; gap: 8px; }
  .row button { flex: 1; }
  .nat-btn { width: 100%; }
  .hint { margin: 0; color: var(--coral, #ff9a78); font-size: .8rem; text-align: center; }
  .small { margin: 0; font-size: .78rem; text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .player { padding: 6px; border: 1px solid var(--line); border-radius: 10px; display: flex; flex-direction: column; gap: 3px; align-items: center; }
  .player.me { border-color: var(--brass); }
  .pn { font-size: .8rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cards { display: flex; gap: 1px; }
  .nat { color: var(--brass-soft, var(--brass)); font-size: .8rem; }
</style>
