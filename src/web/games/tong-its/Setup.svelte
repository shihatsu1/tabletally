<script lang="ts">
  import { PRESETS, MAX_CHIPS, type Mode, type TongItsSetup } from '../../../games/tong-its';
  import { t } from '../../lib/i18n.svelte';

  interface Props {
    setup: TongItsSetup;
    playerCount: number;
    onchange: (next: TongItsSetup) => void;
  }
  let { setup, onchange }: Props = $props();

  type NumKey = 'winChips' | 'tongitsChips' | 'challengeChips' | 'burnedChips' | 'aceChips' | 'secretChips' | 'longRunChips' | 'sagasaChips' | 'potAnte';
  const fields: NumKey[] = ['winChips', 'tongitsChips', 'challengeChips', 'burnedChips', 'aceChips', 'secretChips', 'longRunChips', 'sagasaChips', 'potAnte'];

  function pickPreset(name: string) {
    if (name === 'pagat' || name === 'tongits-go') onchange({ ...PRESETS[name] });
  }

  function setNum(key: NumKey, input: HTMLInputElement) {
    const v = Number.parseInt(input.value, 10);
    const min = key === 'winChips' || key === 'potAnte' ? 1 : 0;
    const clamped = Math.max(min, Math.min(Number.isSafeInteger(v) ? v : min, MAX_CHIPS));
    input.value = String(clamped);
    onchange({ ...setup, preset: 'custom', [key]: clamped });
  }

  function setMode(key: 'tongitsMode' | 'challengeMode', mode: Mode) {
    onchange({ ...setup, preset: 'custom', [key]: mode });
  }
</script>

<label for="preset">{t('tong.preset')}</label>
<select id="preset" value={setup.preset} onchange={(e) => pickPreset(e.currentTarget.value)}>
  <option value="pagat">{t('tong.preset.pagat')}</option>
  <option value="tongits-go">{t('tong.preset.tongits-go')}</option>
  {#if setup.preset === 'custom'}<option value="custom" disabled>{t('tong.preset.custom')}</option>{/if}
</select>
<p class="dim note">{t(`tong.preset.${setup.preset}.help`)}</p>

<details>
  <summary>{t('tong.customize')}</summary>
  <div class="grid">
    {#each fields as key (key)}
      <div>
        <label for="f-{key}">{t(`tong.f.${key}`)}</label>
        <input id="f-{key}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" value={String(setup[key])} onchange={(e) => setNum(key, e.currentTarget)} />
      </div>
    {/each}
  </div>

  {#each ['tongitsMode', 'challengeMode'] as const as key (key)}
    <label for="m-{key}">{t(`tong.m.${key}`)}</label>
    <select id="m-{key}" value={setup[key]} onchange={(e) => setMode(key, e.currentTarget.value as Mode)}>
      <option value="replace">{t('tong.mode.replace')}</option>
      <option value="add">{t('tong.mode.add')}</option>
    </select>
  {/each}
</details>

<style>
  .note { font-size: .85rem; margin: 6px 0 0; }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: var(--accent); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
</style>
