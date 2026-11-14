<script lang="ts">
  import { tongIts, MAX_STAKE, type Ending, type TongItsInput, type TongItsSetup } from '../../../games/tong-its';
  import type { PublicRound } from '../../../shared/protocol';
  import { fmt } from '../../lib/format';
  import { t } from '../../lib/i18n.svelte';
  import { potDealsSince } from './pot';
  import { getItem, setItem } from '../../lib/storage';

  interface Props {
    setup: TongItsSetup;
    players: { id: string; name: string }[];
    rounds?: PublicRound[];
    initial?: TongItsInput;
    submitLabel?: string;
    onsave: (input: TongItsInput) => void;
  }
  let { setup, players, rounds = [], initial, submitLabel, onsave }: Props = $props();

  const presets = [1, 5, 10, 20, 50, 100];
  const saved = Number.parseInt(getItem('tt.stake.tong-its') ?? '', 10);
  const endings: Ending[] = ['normal', 'tongits', 'challenge'];

  // The form only needs the starting values; later changes to `initial` must not overwrite typing.
  // svelte-ignore state_referenced_locally
  let winner = $state(initial?.winner ?? '');
  // svelte-ignore state_referenced_locally
  let ending = $state<Ending>(initial?.ending ?? 'normal');
  // svelte-ignore state_referenced_locally
  let stakeText = $state(String(initial?.stake ?? (Number.isSafeInteger(saved) && saved > 0 ? saved : 10)));
  // svelte-ignore state_referenced_locally
  let burned = $state<string[]>(initial?.burned ? [...initial.burned] : []);
  // svelte-ignore state_referenced_locally
  let aces = $state(initial?.aces ?? 0);
  // svelte-ignore state_referenced_locally
  let secrets = $state(initial?.secrets ?? 0);
  // svelte-ignore state_referenced_locally
  let longRuns = $state(initial?.longRuns ?? 0);
  // svelte-ignore state_referenced_locally
  let sagasa = $state(initial?.sagasa ?? 0);
  // svelte-ignore state_referenced_locally
  let potDeals = $state(initial?.potDeals ?? 0);

  const stake = $derived(/^\d{1,8}$/.test(stakeText) ? Number.parseInt(stakeText, 10) : 0);
  const losers = $derived(players.filter((p) => p.id !== winner));

  // The pot goes to a player who wins two deals in a row and is then emptied. Count the deals it holds,
  // including this one. Suggest collecting it when the winner also took the previous deal and that deal did not collect.
  function hintFor(id: string): number | null {
    if (setup.potAnte === 0 || id === '') return null;
    const last = rounds[rounds.length - 1];
    if (!last) return null;
    const lastInput = last.input as TongItsInput;
    if (lastInput.winner !== id || (lastInput.potDeals ?? 0) > 0) return null;
    return potDealsSince(rounds) + 1;
  }
  const potHint = $derived(hintFor(winner));

  function pickWinner(id: string) {
    // Going back to the original winner of a round being edited keeps its saved pot; any other
    // winner gets their own suggestion (or none), so a pot can never follow the wrong player.
    potDeals = initial && id === initial.winner ? (initial.potDeals ?? 0) : (hintFor(id) ?? 0);
    winner = id;
  }

  const input = $derived.by((): TongItsInput | null => {
    if (winner === '') return null;
    const base: TongItsInput = { winner, ending, stake };
    const live = burned.filter((id) => id !== winner);
    if (live.length > 0) base.burned = live;
    if (aces > 0 && setup.aceChips > 0) base.aces = aces;
    if (secrets > 0 && setup.secretChips > 0) base.secrets = secrets;
    if (longRuns > 0 && setup.longRunChips > 0) base.longRuns = longRuns;
    if (sagasa > 0 && setup.sagasaChips > 0) base.sagasa = sagasa;
    if (potDeals > 0 && setup.potAnte > 0) base.potDeals = potDeals;
    return base;
  });

  const ids = $derived(players.map((p) => p.id));
  const problems = $derived(input ? tongIts.validate(setup, ids, input) : ['incomplete']);
  const valid = $derived(input !== null && problems.length === 0);
  const preview = $derived(valid && input ? tongIts.score(setup, ids, input) : null);

  function toggleBurned(id: string) {
    burned = burned.includes(id) ? burned.filter((x) => x !== id) : [...burned, id];
  }

  function save() {
    if (!valid || !input) return;
    setItem('tt.stake.tong-its', String(stake));
    onsave(input);
    if (!initial) {
      winner = '';
      ending = 'normal';
      burned = [];
      aces = secrets = longRuns = sagasa = potDeals = 0;
    }
  }
</script>

{#snippet counter(label: string, value: number, max: number, set: (n: number) => void)}
  <label for="c-{label}">{label}</label>
  <div id="c-{label}" class="chips">
    {#each Array.from({ length: max + 1 }, (_, i) => i) as k (k)}
      <button type="button" class="ghost" class:primary={value === k} onclick={() => set(k)}>{k}</button>
    {/each}
  </div>
{/snippet}

<div>
  <label for="winner-group">{t('entry.winner')}</label>
  <div id="winner-group" class="winners" role="radiogroup" aria-label={t('entry.winner')}>
    {#each players as p (p.id)}
      <button type="button" role="radio" aria-checked={winner === p.id} class:primary={winner === p.id} onclick={() => pickWinner(p.id)}>{p.name}</button>
    {/each}
  </div>

  <label for="ending-group">{t('tong.ending')}</label>
  <div id="ending-group" class="stack" role="radiogroup" aria-label={t('tong.ending')}>
    {#each endings as e (e)}
      <button type="button" role="radio" aria-checked={ending === e} class:primary={ending === e} onclick={() => (ending = e)}>{t(`tong.ending.${e}`)}</button>
    {/each}
  </div>

  {#if winner !== ''}
    <label for="burned-group">{t('tong.burned')}</label>
    <div id="burned-group" class="chips">
      {#each losers as p (p.id)}
        <button type="button" class="ghost" class:primary={burned.includes(p.id)} aria-pressed={burned.includes(p.id)} onclick={() => toggleBurned(p.id)}>{p.name}</button>
      {/each}
    </div>
  {/if}

  {#if setup.aceChips > 0}{@render counter(t('tong.aces'), aces, 4, (n) => (aces = n))}{/if}
  {#if setup.secretChips > 0}{@render counter(t('tong.secrets'), secrets, 3, (n) => (secrets = n))}{/if}
  {#if setup.longRunChips > 0}{@render counter(t('tong.longRuns'), longRuns, 2, (n) => (longRuns = n))}{/if}
  {#if setup.sagasaChips > 0}{@render counter(t('tong.sagasa'), sagasa, 3, (n) => (sagasa = n))}{/if}

  {#if setup.potAnte > 0}
    <label for="pot-deals">{t('tong.pot')}</label>
    <p class="dim hint" style="margin: 0 0 6px">{t('tong.potNow', { n: (potDealsSince(rounds) + 1) * setup.potAnte * players.length, deals: potDealsSince(rounds) + 1 })}</p>
    <div class="row">
      <input id="pot-deals" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value={String(potDeals)} oninput={(e) => (potDeals = Number.parseInt(e.currentTarget.value.replace(/\D/g, '') || '0', 10))} style="width: 5em; text-align: center" />
      {#if potHint !== null && potDeals !== potHint}
        <button type="button" class="ghost" onclick={() => (potDeals = potHint)}>{t('tong.potHint', { n: potHint })}</button>
      {/if}
    </div>
  {/if}

  <label for="stake">{t('tong.stake')}</label>
  <input id="stake" type="text" inputmode="numeric" pattern="[0-9]*" bind:value={stakeText} />
  <div class="chips">
    {#each presets as v (v)}
      <button type="button" class="ghost" class:primary={stake === v} onclick={() => (stakeText = String(v))}>{v}</button>
    {/each}
  </div>
  {#if stake > MAX_STAKE || stake === 0}<p class="dim hint">{t('entry.stakeHint')}</p>{/if}

  {#if preview}
    <ul class="preview" aria-label={t('entry.preview')}>
      {#each players as p (p.id)}
        {@const v = preview[p.id] ?? 0}
        <li><span class="grow">{p.name}</span><span class="num" class:pos={v > 0} class:neg={v < 0}>{fmt(v)}</span></li>
      {/each}
    </ul>
  {/if}

  <div class="row" style="margin-top: 14px">
    <button type="button" class="primary grow" disabled={!valid} onclick={save}>{submitLabel ?? t('entry.save')}</button>
  </div>
  {#if !valid}<p class="dim hint">{t(winner === '' ? 'entry.pickWinner' : 'entry.fillIn')}</p>{/if}
</div>

<style>
  .winners { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stack { display: grid; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chips button { min-height: 40px; padding: .4em .8em; }
  .hint { margin: 8px 0 0; font-size: .85rem; }
  .preview { list-style: none; margin: 14px 0 0; padding: 10px 12px; background: var(--bg-deep); border-radius: 12px; display: grid; gap: 4px; }
  .preview li { display: flex; gap: 10px; }
</style>
