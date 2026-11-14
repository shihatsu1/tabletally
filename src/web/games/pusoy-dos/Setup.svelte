<script lang="ts">
  import { setPlacementPoint, TIER_PRESETS, type PusoyDosSetup, type Scoring } from '../../../games/pusoy-dos';
  import { t } from '../../lib/i18n.svelte';

  interface Props {
    setup: PusoyDosSetup;
    playerCount: number;
    onchange: (next: PusoyDosSetup) => void;
  }
  let { setup, playerCount, onchange }: Props = $props();

  const systems: Scoring[] = ['winner-take-all', 'placement'];
  const penaltiesOn = $derived(setup.scoring === 'cards-left');
  const tierKey = $derived(
    Object.entries(TIER_PRESETS).find(([, tiers]) => JSON.stringify(tiers) === JSON.stringify(setup.tiers))?.[0] ?? 'custom',
  );

  const patch = (over: Partial<PusoyDosSetup>) => onchange({ ...setup, ...over });

  function setPoints(i: number, input: HTMLInputElement) {
    const v = Number.parseInt(input.value, 10);
    const next = setPlacementPoint(setup.placementPoints, i, Number.isSafeInteger(v) ? v : 0);
    input.value = String(next[i]); // show the value actually used, even when it was clamped
    patch({ placementPoints: next });
  }
</script>

<fieldset class="systems">
  <legend>{t('opt.scoring')}</legend>
  {#each systems as s (s)}
    <label class="opt" class:on={setup.scoring === s}>
      <input type="radio" name="scoring" value={s} checked={setup.scoring === s} onchange={() => patch({ scoring: s })} />
      <span><strong>{t(`opt.scoring.${s}`)}</strong><small class="dim">{t(`opt.scoring.${s}.help`)}</small></span>
    </label>
  {/each}
</fieldset>

{#if setup.scoring !== 'placement'}
  <label class="opt" class:on={penaltiesOn}>
    <input type="checkbox" checked={penaltiesOn} onchange={(e) => patch({ scoring: e.currentTarget.checked ? 'cards-left' : 'winner-take-all' })} />
    <span><strong>{t('opt.penalties')}</strong><small class="dim">{t('opt.penalties.help')}</small></span>
  </label>
{/if}

{#if setup.scoring !== 'placement'}
  <label for="deuce">{t('opt.deuce')}</label>
  <select id="deuce" value={setup.deuce} onchange={(e) => patch({ deuce: e.currentTarget.value as PusoyDosSetup['deuce'] })}>
    <option value="off">{t('opt.deuce.off')}</option>
    <option value="pow2">{t('opt.deuce.pow2')}</option>
    <option value="double-once">{t('opt.deuce.double-once')}</option>
  </select>
{/if}

{#if setup.scoring === 'cards-left'}
  <label for="tiers">{t('opt.tiers')}</label>
  <select id="tiers" value={tierKey} onchange={(e) => { const tiers = TIER_PRESETS[e.currentTarget.value]; if (tiers) patch({ tiers: tiers.map((x) => ({ ...x })) }); }}>
    <option value="standard">{t('opt.tiers.standard')}</option>
    <option value="tiered-8">{t('opt.tiers.tiered-8')}</option>
    <option value="flat">{t('opt.tiers.flat')}</option>
    {#if tierKey === 'custom'}<option value="custom" disabled>{t('opt.tiers.custom')}</option>{/if}
  </select>

  <label for="settlement">{t('opt.settlement')}</label>
  <select id="settlement" value={setup.settlement} onchange={(e) => patch({ settlement: e.currentTarget.value as PusoyDosSetup['settlement'] })}>
    <option value="winner-only">{t('opt.settlement.winner-only')}</option>
    <option value="pairwise">{t('opt.settlement.pairwise')}</option>
  </select>

  <label for="hand">{t('opt.hand')}</label>
  <select id="hand" value={String(setup.startingHand)} onchange={(e) => patch({ startingHand: Number.parseInt(e.currentTarget.value, 10) })}>
    {#each [13, 17].filter((n) => n * playerCount <= 52) as n (n)}<option value={String(n)}>{n}</option>{/each}
  </select>
{/if}

{#if setup.scoring === 'placement'}
  <label for="points-0">{t('opt.points')}</label>
  <div class="points">
    {#each setup.placementPoints as p, i (i)}
      <div>
        <small class="dim">{i + 1}</small>
        <input id="points-{i}" aria-label={`${t('opt.points')} ${i + 1}`} type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" value={String(p)} onchange={(e) => setPoints(i, e.currentTarget)} />
      </div>
    {/each}
  </div>
  <p class="dim note">{t('opt.points.help', { n: playerCount })}</p>
{/if}

<style>
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: .85rem; color: var(--text-dim); padding: 0; margin-bottom: 6px; }
  .points { display: flex; gap: 8px; }
  .points div { flex: 1; text-align: center; }
  .points input { text-align: center; }
</style>
