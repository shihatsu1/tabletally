<script lang="ts">
  import { MAX_CHIPS, MAX_ENTRIES, analyze, poker, type PokerInput, type PokerSetup } from '../../../games/poker';
  import { fmt, plain } from '../../lib/format';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';

  interface Props {
    setup: PokerSetup;
    players: { id: string; name: string }[];
    initial?: PokerInput;
    submitLabel?: string;
    onsave: (input: PokerInput) => void;
  }
  let { setup, players, initial, submitLabel, onsave }: Props = $props();

  // A night takes hours and a refresh must not lose it, so a new night keeps a draft on this phone only.
  // svelte-ignore state_referenced_locally
  const draftKey = initial ? '' : `tt.poker.draft.${players.map((p) => p.id).join(',')}`;
  type Draft = { buy: Record<string, string[]>; out: Record<string, string>; adjust: string };

  function load(): Draft | null {
    try {
      const raw = JSON.parse(getItem(draftKey) ?? 'null') as Draft | null;
      return raw && typeof raw === 'object' && raw.buy && raw.out && typeof raw.adjust === 'string' ? raw : null;
    } catch {
      return null;
    }
  }

  const fromInitial = (): Draft => ({
    buy: Object.fromEntries(Object.entries(initial?.buyIns ?? {}).map(([k, v]) => [k, v.map(String)])),
    out: Object.fromEntries(Object.entries(initial?.cashOuts ?? {}).map(([k, v]) => [k, String(v)])),
    adjust: initial?.adjustTo ?? '',
  });

  // svelte-ignore state_referenced_locally
  const start: Draft = initial ? fromInitial() : load() ?? { buy: {}, out: {}, adjust: '' };
  // The form only needs the starting values; later changes to `initial` must not overwrite typing.
  // svelte-ignore state_referenced_locally
  let buy = $state<Record<string, string[]>>(start.buy);
  // svelte-ignore state_referenced_locally
  let out = $state<Record<string, string>>(start.out);
  // svelte-ignore state_referenced_locally
  let adjust = $state(start.adjust);

  $effect(() => {
    if (draftKey) setItem(draftKey, JSON.stringify({ buy, out, adjust }));
  });

  const entriesOf = (id: string): string[] => buy[id] ?? [String(setup.buyIn)];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const num = (s: string): number | null => (/^\d{1,10}$/.test(s) ? Number.parseInt(s, 10) : null);

  function setEntry(id: string, i: number, value: string) {
    const list = [...entriesOf(id)];
    list[i] = value.replace(/\D/g, '');
    buy = { ...buy, [id]: list };
  }
  function addRebuy(id: string) {
    const list = entriesOf(id);
    if (list.length < MAX_ENTRIES) buy = { ...buy, [id]: [...list, String(setup.buyIn)] };
  }
  function dropEntry(id: string, i: number) {
    const list = entriesOf(id).filter((_, k) => k !== i);
    buy = { ...buy, [id]: list.length ? list : [String(setup.buyIn)] };
  }

  const ids = $derived(players.map((p) => p.id));

  // Everything typed so far, as numbers (null while a field is empty or not a number).
  const parsed = $derived.by((): PokerInput | null => {
    const buyIns: Record<string, number[]> = {};
    const cashOuts: Record<string, number> = {};
    for (const id of ids) {
      const list = entriesOf(id).map(num);
      if (list.some((n) => n === null || n < 1 || n > MAX_CHIPS)) return null;
      buyIns[id] = list as number[];
      const o = num(out[id] ?? '');
      if (o === null) return null;
      cashOuts[id] = o;
    }
    return { buyIns, cashOuts };
  });

  const totals = $derived(parsed ? analyze(ids, parsed) : null);
  const input = $derived<PokerInput | null>(parsed && totals && totals.difference !== 0 && adjust ? { ...parsed, adjustTo: adjust } : parsed);
  const problems = $derived(input ? poker.validate(setup, ids, input) : ['incomplete']);
  const valid = $derived(input !== null && problems.length === 0);
  const preview = $derived(valid && input ? poker.score(setup, ids, input) : null);
  const chipsIn = $derived(totals?.chipsIn ?? 0);

  function save() {
    if (!valid || !input) return;
    onsave(input);
    if (!initial) {
      buy = {};
      out = {};
      adjust = '';
      setItem(draftKey, 'null');
    }
  }
</script>

<div>
  <p class="dim hint">{t('poker.entryHelp')}</p>

  {#each players as p (p.id)}
    <fieldset class="player">
      <legend>{p.name}</legend>
      {#each entriesOf(p.id) as e, i (i)}
        <div class="line">
          <span class="grow dim">{i === 0 ? t('poker.buyIn') : t('poker.rebuy', { n: i })}</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" aria-label={t('poker.buyInFor', { name: p.name })} value={e} oninput={(ev) => setEntry(p.id, i, ev.currentTarget.value)} />
          {#if i > 0}<button type="button" class="ghost x" aria-label={t('poker.removeRebuy')} onclick={() => dropEntry(p.id, i)}>×</button>{/if}
        </div>
      {/each}
      <div class="line">
        <button type="button" class="ghost" onclick={() => addRebuy(p.id)} disabled={entriesOf(p.id).length >= MAX_ENTRIES}>+ {t('poker.addRebuy', { n: plain(setup.buyIn) })}</button>
      </div>
      <div class="line">
        <label class="grow" for="out-{p.id}">{t('poker.cashOut')}</label>
        <input id="out-{p.id}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" placeholder="0" value={out[p.id] ?? ''} oninput={(ev) => (out = { ...out, [p.id]: ev.currentTarget.value.replace(/\D/g, '') })} />
      </div>
    </fieldset>
  {/each}

  {#if totals}
    <div class="totals" aria-live="polite">
      <div><small class="dim">{t('poker.chipsIn')}</small><b class="num">{plain(totals.chipsIn)}</b></div>
      <div><small class="dim">{t('poker.chipsOut')}</small><b class="num">{plain(totals.chipsOut)}</b></div>
      <div class:bad={totals.difference !== 0}><small class="dim">{t('poker.difference')}</small><b class="num">{fmt(-totals.difference)}</b></div>
    </div>
    {#if totals.difference !== 0}
      <p class="warn">{t(totals.difference > 0 ? 'poker.missing' : 'poker.extra', { n: plain(Math.abs(totals.difference)) })}</p>
      <label for="adjust">{t('poker.assignTo')}</label>
      <select id="adjust" value={adjust} onchange={(e) => (adjust = e.currentTarget.value)}>
        <option value="">{t('poker.assignNone')}</option>
        {#each players as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <p class="dim hint">{t('poker.assignHelp')}</p>
    {/if}
  {/if}

  {#if preview}
    <ul class="preview" aria-label={t('entry.preview')}>
      {#each players as p (p.id)}
        {@const v = preview[p.id] ?? 0}
        <li><span class="grow">{p.name}</span><span class="num" class:pos={v > 0} class:neg={v < 0}>{fmt(v)}</span></li>
      {/each}
    </ul>
  {/if}

  <div class="row" style="margin-top: 14px">
    <button type="button" class="primary grow" disabled={!valid} onclick={save}>{submitLabel ?? t('poker.save')}</button>
  </div>
  {#if !valid && chipsIn > 0}<p class="dim hint">{t(parsed ? 'poker.fixFirst' : 'entry.fillIn')}</p>{/if}
</div>

<style>
  .hint { margin: 8px 0 0; font-size: .85rem; }
  .player { border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px 12px; margin: 10px 0; }
  .player legend { padding: 0 6px; font-weight: 700; }
  .line { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .line input { width: 7.5em; text-align: right; font-size: 1.1rem; }
  .x { min-height: 40px; padding: .2em .7em; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; text-align: center; }
  .totals small { display: block; }
  .totals b { font-size: 1.2rem; }
  .totals .bad b { color: var(--neg); }
  .warn { color: var(--neg); margin: 8px 0 0; font-weight: 700; }
  .preview { list-style: none; margin: 14px 0 0; padding: 10px 12px; background: var(--bg-deep); border-radius: 12px; display: grid; gap: 4px; }
  .preview li { display: flex; gap: 10px; }
</style>
