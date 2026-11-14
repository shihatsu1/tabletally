<script lang="ts">
  import { NATURAL_DEFAULTS, NATURAL_KEYS, NATURAL_WIKIPEDIA, ROYALTY_KEYS, ROYALTY_PRESETS, SYSTEMS, defaultSetup, type NaturalKey, type PusoySetup, type RoyaltyKey } from '../../../games/pusoy';
  import { t } from '../../lib/i18n.svelte';

  interface Props {
    setup: PusoySetup;
    playerCount: number;
    onchange: (next: PusoySetup) => void;
  }
  let { setup, onchange }: Props = $props();

  const patch = (over: Partial<PusoySetup>) => onchange({ ...setup, ...over });

  function num(input: HTMLInputElement, min: number, max: number): number {
    const v = Number.parseInt(input.value, 10);
    const clamped = Math.max(min, Math.min(Number.isSafeInteger(v) ? v : min, max));
    input.value = String(clamped);
    return clamped;
  }

  function pickSystem(name: '1-6' | '2-4') {
    patch({ system: name, ...SYSTEMS[name] });
  }

  function pickPreset(name: string) {
    if (name === 'classic' || name === 'wikipedia' || name === 'playtime') patch({ royaltyPreset: name, royalty: { ...ROYALTY_PRESETS[name] } });
  }

  function setRoyalty(key: RoyaltyKey, input: HTMLInputElement) {
    patch({ royaltyPreset: 'custom', royalty: { ...setup.royalty, [key]: num(input, 0, 50) } });
  }

  function setNatural(key: NaturalKey, input: HTMLInputElement) {
    patch({ natural: { ...setup.natural, [key]: num(input, 0, 200) } });
  }

  const reset = () => onchange(defaultSetup());
</script>

<fieldset class="systems">
  <legend>{t('pusoy.system')}</legend>
  {#each ['1-6', '2-4'] as const as s (s)}
    <label class="opt" class:on={setup.system === s}>
      <input type="radio" name="pusoy-system" value={s} checked={setup.system === s} onchange={() => pickSystem(s)} />
      <span><strong>{t(`pusoy.sys.${s}`)}</strong><small class="dim">{t(`pusoy.sys.${s}.help`)}</small></span>
    </label>
  {/each}
  {#if setup.system === 'custom'}<p class="dim note">{t('pusoy.sys.custom')}</p>{/if}
</fieldset>

<label class="check"><input type="checkbox" checked={setup.royalties} onchange={(e) => patch({ royalties: e.currentTarget.checked })} /> {t('pusoy.royalties.on')}</label>
{#if setup.royalties}
  <div class="indent">
    <label for="roy-preset">{t('pusoy.royaltyPreset')}</label>
    <select id="roy-preset" value={setup.royaltyPreset} onchange={(e) => pickPreset(e.currentTarget.value)}>
      <option value="classic">{t('pusoy.preset.classic')}</option>
      <option value="wikipedia">{t('pusoy.preset.wikipedia')}</option>
      <option value="playtime">{t('pusoy.preset.playtime')}</option>
      {#if setup.royaltyPreset === 'custom'}<option value="custom" disabled>{t('pusoy.preset.custom')}</option>{/if}
    </select>
    <label for="roy-mode">{t('pusoy.royaltyMode')}</label>
    <select id="roy-mode" value={setup.royaltyMode} onchange={(e) => patch({ royaltyMode: e.currentTarget.value === 'on-win' ? 'on-win' : 'all' })}>
      <option value="all">{t('pusoy.mode.all')}</option>
      <option value="on-win">{t('pusoy.mode.on-win')}</option>
    </select>
    <details>
      <summary>{t('pusoy.editTable')}</summary>
      <div class="grid">
        {#each ROYALTY_KEYS as k (k)}
          <div>
            <label for="r-{k}">{t(`pusoy.row.${k.split('.')[0]}`)}: {t(`pusoy.r.${k.split('.')[1]}`)}</label>
            <input id="r-{k}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value={String(setup.royalty[k])} onchange={(e) => setRoyalty(k, e.currentTarget)} />
          </div>
        {/each}
      </div>
    </details>
  </div>
{/if}

<label class="check"><input type="checkbox" checked={setup.naturals} onchange={(e) => patch({ naturals: e.currentTarget.checked })} /> {t('pusoy.naturals.on')}</label>
{#if setup.naturals}
  <div class="indent">
    <p class="dim note">{t('pusoy.naturals.help')}</p>
    <div class="row" style="gap: 8px; margin: 6px 0">
      <button type="button" class="ghost" onclick={() => patch({ natural: { ...NATURAL_DEFAULTS } })}>{t('pusoy.naturals.ph')}</button>
      <button type="button" class="ghost" onclick={() => patch({ natural: { ...NATURAL_WIKIPEDIA } })}>{t('pusoy.naturals.wiki')}</button>
    </div>
    <details>
      <summary>{t('pusoy.naturals.edit')}</summary>
      <div class="grid">
        {#each NATURAL_KEYS as k (k)}
          <div>
            <label for="n-{k}">{t(`pusoy.n.${k}`)}</label>
            <input id="n-{k}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value={String(setup.natural[k])} onchange={(e) => setNatural(k, e.currentTarget)} />
          </div>
        {/each}
      </div>
    </details>
  </div>
{/if}

<details class="bonus">
  <summary>{t('pusoy.bonuses')}</summary>
  <div class="grid">
    <div>
      <label for="majority">{t('pusoy.f.majorityBonus')}</label>
      <input id="majority" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value={String(setup.majorityBonus)} onchange={(e) => patch({ system: 'custom', majorityBonus: num(e.currentTarget, 0, 20) })} />
    </div>
    <div>
      <label for="scoop">{t('pusoy.f.scoopBonus')}</label>
      <input id="scoop" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value={String(setup.scoopBonus)} onchange={(e) => patch({ system: 'custom', scoopBonus: num(e.currentTarget, 0, 20) })} />
    </div>
  </div>
  <button type="button" class="ghost" style="margin-top: 10px" onclick={reset}>{t('pusoy.reset')}</button>
</details>

<style>
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: .85rem; color: var(--text-dim); padding: 0; margin-bottom: 6px; }
  .opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; margin: 6px 0; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; color: var(--text); font-size: 1rem; }
  .opt.on { background: color-mix(in srgb, var(--brass) 16%, transparent); border-color: var(--brass); }
  .opt input { width: auto; min-height: 0; margin-top: 4px; }
  .opt small { display: block; }
  .check { display: flex; gap: 10px; align-items: center; margin-top: 16px; color: var(--text); font-size: 1rem; }
  .check input { width: auto; min-height: 0; }
  .indent { margin-left: 10px; padding-left: 12px; border-left: 2px solid var(--line); }
  .note { font-size: .85rem; margin: 4px 0 0; }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: var(--accent); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
</style>
