<script lang="ts">
  import {
    MAX_STAKE, NATURAL_KEYS, ROWS, pusoy, type NaturalKey, type PlayerRoyalties, type PusoyInput, type PusoySetup, type RowKey,
  } from '../../../games/pusoy';
  import { fmt } from '../../lib/format';
  import { t } from '../../lib/i18n.svelte';
  import { getItem, setItem } from '../../lib/storage';

  interface Props {
    setup: PusoySetup;
    players: { id: string; name: string }[];
    initial?: PusoyInput;
    submitLabel?: string;
    onsave: (input: PusoyInput) => void;
  }
  let { setup, players, initial, submitLabel, onsave }: Props = $props();

  const presets = [10, 20, 50, 100, 200, 500];
  const saved = Number.parseInt(getItem('tt.stake.pusoy') ?? '', 10);
  const CHOICES: Record<RowKey, string[]> = { front: ['trips'], middle: ['fullHouse', 'quads', 'straightFlush', 'royal'], back: ['quads', 'straightFlush', 'royal'] };

  // The form only needs the starting values; later changes to `initial` must not overwrite what is typed.
  // svelte-ignore state_referenced_locally
  let stakeText = $state(String(initial?.stake ?? (Number.isSafeInteger(saved) && saved > 0 ? saved : 10)));
  // svelte-ignore state_referenced_locally
  let fouls = $state<string[]>(initial?.fouls ? [...initial.fouls] : []);
  // svelte-ignore state_referenced_locally
  let naturals = $state<Record<string, NaturalKey>>({ ...(initial?.naturals ?? {}) });
  // svelte-ignore state_referenced_locally
  let royalties = $state<Record<string, PlayerRoyalties>>(structuredClone(initial?.royalties ?? {}));
  // svelte-ignore state_referenced_locally
  let groups = $state<Record<RowKey, string[][]>>({
    front: structuredClone(initial?.rows.front ?? []),
    middle: structuredClone(initial?.rows.middle ?? []),
    back: structuredClone(initial?.rows.back ?? []),
  });
  let tieNext = $state<Record<RowKey, boolean>>({ front: false, middle: false, back: false });

  const stake = $derived(/^\d{1,8}$/.test(stakeText) ? Number.parseInt(stakeText, 10) : 0);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  // Fouled players and players holding a natural are not ranked in the rows.
  const toRank = $derived(players.filter((p) => !fouls.includes(p.id) && !(p.id in naturals)));
  const valid = $derived(players.filter((p) => !fouls.includes(p.id) && !(p.id in naturals)));

  /** A row with the last unplaced player filled in for you. */
  function fullRow(row: RowKey): string[][] {
    const placed = groups[row].flat();
    const left = toRank.filter((p) => !placed.includes(p.id));
    return left.length === 1 ? [...groups[row], [left[0]!.id]] : groups[row];
  }

  function tap(row: RowKey, id: string) {
    const rows = groups[row];
    const at = rows.findIndex((g) => g.includes(id));
    if (at >= 0) {
      const next = rows.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0);
      groups = { ...groups, [row]: next };
    } else if (tieNext[row] && rows.length > 0) {
      groups = { ...groups, [row]: [...rows.slice(0, -1), [...rows[rows.length - 1]!, id]] };
    } else {
      groups = { ...groups, [row]: [...rows, [id]] };
    }
    tieNext = { ...tieNext, [row]: false };
  }

  function dropFromRows(id: string) {
    groups = Object.fromEntries(ROWS.map((r) => [r, groups[r].map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0)])) as Record<RowKey, string[][]>;
  }

  function toggleFoul(id: string) {
    if (fouls.includes(id)) fouls = fouls.filter((x) => x !== id);
    else {
      fouls = [...fouls, id];
      dropFromRows(id);
      const { [id]: _n, ...rest } = naturals;
      naturals = rest;
      const { [id]: _r, ...rr } = royalties;
      royalties = rr;
    }
  }

  function setNatural(id: string, key: string) {
    if (key === '') {
      const { [id]: _gone, ...rest } = naturals;
      naturals = rest;
    } else {
      naturals = { ...naturals, [id]: key as NaturalKey };
      dropFromRows(id);
      const { [id]: _r, ...rr } = royalties;
      royalties = rr;
    }
  }

  function setRoyalty(id: string, row: RowKey, pick: string) {
    const mine: Record<string, string> = { ...(royalties[id] ?? {}) };
    if (pick === '') delete mine[row];
    else mine[row] = pick;
    royalties = { ...royalties, [id]: mine as PlayerRoyalties };
  }

  const input = $derived.by((): PusoyInput | null => {
    const base: PusoyInput = { stake, rows: { front: fullRow('front'), middle: fullRow('middle'), back: fullRow('back') } };
    if (fouls.length) base.fouls = fouls;
    if (setup.naturals && Object.keys(naturals).length) base.naturals = naturals;
    if (setup.royalties) {
      const picked = Object.fromEntries(Object.entries(royalties).filter(([, r]) => Object.keys(r).length > 0));
      if (Object.keys(picked).length) base.royalties = picked;
    }
    return base;
  });

  const ids = $derived(players.map((p) => p.id));
  const problems = $derived(input ? pusoy.validate(setup, ids, input) : ['incomplete']);
  const ok = $derived(input !== null && problems.length === 0);
  const preview = $derived(ok && input ? pusoy.score(setup, ids, input) : null);

  function save() {
    if (!ok || !input) return;
    setItem('tt.stake.pusoy', String(stake));
    onsave(input);
    if (!initial) {
      groups = { front: [], middle: [], back: [] };
      fouls = [];
      naturals = {};
      royalties = {};
    }
  }
</script>

<div>
  <label for="foul-group">{t('pusoy.foul')}</label>
  <div id="foul-group" class="chips">
    {#each players as p (p.id)}
      <button type="button" class="ghost" class:primary={fouls.includes(p.id)} aria-pressed={fouls.includes(p.id)} onclick={() => toggleFoul(p.id)}>{p.name}</button>
    {/each}
  </div>
  <p class="dim hint">{t('pusoy.foulHint')}</p>

  {#if setup.naturals}
    <details class="sub">
      <summary>{t('pusoy.naturals')}</summary>
      {#each players.filter((p) => !fouls.includes(p.id)) as p (p.id)}
        <div class="line">
          <span class="grow">{p.name}</span>
          <select aria-label={t('pusoy.natural')} value={naturals[p.id] ?? ''} onchange={(e) => setNatural(p.id, e.currentTarget.value)}>
            <option value="">{t('pusoy.none')}</option>
            {#each NATURAL_KEYS.filter((k) => setup.natural[k] > 0) as k (k)}<option value={k}>{t(`pusoy.n.${k}`)} ({setup.natural[k]})</option>{/each}
          </select>
        </div>
      {/each}
    </details>
  {/if}

  {#each ROWS as row (row)}
    {@const shown = fullRow(row)}
    <div class="row-block">
      <div class="row">
        <strong class="grow">{t(`pusoy.row.${row}`)}</strong>
        <button type="button" class="ghost small" class:primary={tieNext[row]} disabled={groups[row].length === 0} aria-pressed={tieNext[row]} onclick={() => (tieNext = { ...tieNext, [row]: !tieNext[row] })}>{t('pusoy.tie')}</button>
        <button type="button" class="ghost small" disabled={groups[row].length === 0} onclick={() => (groups = { ...groups, [row]: [] })}>{t('pusoy.clearRow')}</button>
      </div>
      <div class="chips">
        {#each toRank as p (p.id)}
          {@const at = shown.findIndex((g) => g.includes(p.id))}
          <button type="button" class:primary={at >= 0} disabled={at >= 0 && !groups[row].flat().includes(p.id)} onclick={() => tap(row, p.id)}>
            {#if at >= 0}<span class="pos">{at + 1}</span>{/if}{p.name}
          </button>
        {/each}
      </div>
    </div>
  {/each}
  {#if toRank.length > 0}<p class="dim hint">{t('pusoy.rowHint')}</p>{/if}

  {#if setup.royalties}
    <details class="sub">
      <summary>{t('pusoy.royalties')}</summary>
      {#each valid as p (p.id)}
        <div class="roy">
          <strong>{p.name}</strong>
          <div class="three">
            {#each ROWS as row (row)}
              <select aria-label={`${p.name} ${t(`pusoy.row.${row}`)}`} value={royalties[p.id]?.[row] ?? ''} onchange={(e) => setRoyalty(p.id, row, e.currentTarget.value)}>
                <option value="">{t(`pusoy.row.${row}`)}: {t('pusoy.none')}</option>
                {#each CHOICES[row] as c (c)}<option value={c}>{t(`pusoy.row.${row}`)}: {t(`pusoy.r.${c}`)} ({setup.royalty[`${row}.${c}` as keyof typeof setup.royalty]})</option>{/each}
              </select>
            {/each}
          </div>
        </div>
      {/each}
    </details>
  {/if}

  <label for="stake">{t('pusoy.stake')}</label>
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
    <button type="button" class="primary grow" disabled={!ok} onclick={save}>{submitLabel ?? t('entry.save')}</button>
  </div>
  {#if !ok}<p class="dim hint">{t('pusoy.fillRows')}</p>{/if}
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chips button { min-height: 44px; padding: .4em .9em; }
  .row-block { margin-top: 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .small { min-height: 36px; padding: .3em .7em; font-size: .85rem; }
  .pos { display: inline-block; min-width: 1.3em; margin-right: .3em; font-weight: 800; }
  .hint { margin: 8px 0 0; font-size: .85rem; }
  .sub { margin-top: 12px; }
  .sub summary { cursor: pointer; color: var(--accent); }
  .line { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
  .line select { width: auto; max-width: 62%; }
  .roy { margin: 10px 0; }
  .three { display: grid; gap: 6px; margin-top: 4px; }
  .preview { list-style: none; margin: 14px 0 0; padding: 10px 12px; background: var(--bg-deep); border-radius: 12px; display: grid; gap: 4px; }
  .preview li { display: flex; gap: 10px; }
</style>
