<script lang="ts">
  import { pusoyDos, MAX_STAKE, type PusoyDosInput, type PusoyDosSetup } from '../../../games/pusoy-dos';
  import { fmt } from '../../lib/format';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';

  interface Props {
    setup: PusoyDosSetup;
    players: { id: string; name: string }[];
    initial?: PusoyDosInput;
    submitLabel?: string;
    onsave: (input: PusoyDosInput) => void;
  }
  let { setup, players, initial, submitLabel, onsave }: Props = $props();

  const presets = [10, 20, 50, 100, 200, 300, 500];
  const saved = Number.parseInt(getItem('tt.stake.pusoy-dos') ?? '', 10);

  // The form only needs the starting values; later changes to `initial` must not overwrite typing.
  // svelte-ignore state_referenced_locally
  let winner = $state(initial?.winner ?? '');
  // svelte-ignore state_referenced_locally
  let stakeText = $state(String(initial?.stake ?? (Number.isSafeInteger(saved) && saved > 0 ? saved : 50)));
  // svelte-ignore state_referenced_locally
  let deuces = $state(initial?.deuces ?? 0);
  // svelte-ignore state_referenced_locally
  let left = $state<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.cardsLeft ?? {}).map(([k, v]) => [k, String(v)])),
  );
  // svelte-ignore state_referenced_locally
  let order = $state<string[]>(initial?.order ? [...initial.order] : []);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const stake = $derived(/^\d{1,8}$/.test(stakeText) ? Number.parseInt(stakeText, 10) : 0);

  // Placement: tap in finishing order. The last player is filled in automatically.
  const fullOrder = $derived(
    order.length === players.length - 1
      ? [...order, players.find((p) => !order.includes(p.id))!.id]
      : order,
  );

  const input = $derived.by((): PusoyDosInput | null => {
    if (setup.scoring === 'placement') {
      return fullOrder.length === players.length ? { stake, order: fullOrder } : null;
    }
    if (winner === '') return null;
    const base: PusoyDosInput = { winner, stake };
    if (setup.deuce !== 'off' && deuces > 0) base.deuces = deuces;
    if (setup.scoring === 'cards-left') {
      const cardsLeft: Record<string, number> = {};
      for (const p of players) {
        if (p.id === winner) continue;
        const raw = left[p.id] ?? '';
        if (!/^\d{1,2}$/.test(raw)) return null;
        cardsLeft[p.id] = Number.parseInt(raw, 10);
      }
      base.cardsLeft = cardsLeft;
    }
    return base;
  });

  const problems = $derived(input ? pusoyDos.validate(setup, players.map((p) => p.id), input) : ['incomplete']);
  const valid = $derived(input !== null && problems.length === 0);
  const preview = $derived(
    valid && input ? pusoyDos.score(setup, players.map((p) => p.id), input) : null,
  );

  function toggleOrder(id: string) {
    order = order.includes(id) ? order.filter((x) => x !== id) : order.length < players.length - 1 ? [...order, id] : order;
  }

  function save() {
    if (!valid || !input) return;
    setItem('tt.stake.pusoy-dos', String(stake));
    onsave(input);
    if (!initial) {
      winner = '';
      left = {};
      order = [];
      deuces = 0;
    }
  }
</script>

<div>
  {#if setup.scoring === 'placement'}
    <label for="order-group">{t('entry.order')}</label>
    <div id="order-group" class="winners">
      {#each players as p (p.id)}
        {@const pos = fullOrder.indexOf(p.id)}
        <button
          type="button"
          class:primary={pos >= 0}
          disabled={pos === players.length - 1 && order.length === players.length - 1}
          onclick={() => toggleOrder(p.id)}
        >
          {#if pos >= 0}<span class="pos">{pos + 1}</span>{/if}{p.name}
        </button>
      {/each}
    </div>
    <p class="dim hint">{t('entry.orderHint')}</p>
  {:else}
    <label for="winner-group">{t('entry.winner')}</label>
    <div id="winner-group" class="winners" role="radiogroup" aria-label={t('entry.winner')}>
      {#each players as p (p.id)}
        <button type="button" role="radio" aria-checked={winner === p.id} class:primary={winner === p.id} onclick={() => (winner = p.id)}>{p.name}</button>
      {/each}
    </div>
  {/if}

  {#if setup.scoring === 'cards-left' && winner !== ''}
    <label for="left-group">{t('entry.cardsLeft')}</label>
    <div id="left-group" class="lefts">
      {#each players.filter((p) => p.id !== winner) as p (p.id)}
        <div class="left-row">
          <span class="grow">{p.name}</span>
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="2"
            aria-label={t('entry.cardsLeftFor', { name: p.name })}
            placeholder="0"
            value={left[p.id] ?? ''}
            oninput={(e) => (left = { ...left, [p.id]: e.currentTarget.value.replace(/\D/g, '') })}
          />
        </div>
      {/each}
    </div>
  {/if}

  {#if setup.scoring !== 'placement' && setup.deuce !== 'off'}
    <label for="deuce-group">{t('entry.deuces')}</label>
    <div id="deuce-group" class="chips">
      {#each [0, 1, 2, 3, 4] as k (k)}
        <button type="button" class="ghost" class:primary={deuces === k} onclick={() => (deuces = k)}>{k}</button>
      {/each}
    </div>
  {/if}

  <label for="stake">{setup.scoring === 'winner-take-all' ? t('entry.stake') : t('entry.stakePerPoint')}</label>
  <input id="stake" type="text" inputmode="numeric" pattern="[0-9]*" bind:value={stakeText} />
  <div class="chips">
    {#each presets as v (v)}
      <button type="button" class="ghost" class:primary={stake === v} onclick={() => (stakeText = String(v))}>{v}</button>
    {/each}
  </div>
  {#if stake > MAX_STAKE || stakeText === '' || stake === 0}<p class="dim hint">{t('entry.stakeHint')}</p>{/if}

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
  {#if !valid}<p class="dim hint">{t(setup.scoring === 'placement' ? 'entry.pickOrder' : winner === '' ? 'entry.pickWinner' : 'entry.fillIn')}</p>{/if}
</div>

<style>
  .winners { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chips button { min-height: 40px; padding: .4em .8em; }
  .hint { margin: 8px 0 0; font-size: .85rem; }
  .pos { display: inline-block; min-width: 1.4em; margin-right: .4em; font-weight: 800; }
  .lefts { display: grid; gap: 8px; }
  .left-row { display: flex; align-items: center; gap: 10px; }
  .left-row input { width: 5em; text-align: center; font-size: 1.2rem; }
  .preview { list-style: none; margin: 14px 0 0; padding: 10px 12px; background: var(--bg-deep); border-radius: 12px; display: grid; gap: 4px; }
  .preview li { display: flex; gap: 10px; }
</style>
