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

  const standard = $derived(setup.preset === 'tongits-go');

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

<p class="head"><span class="dim">{t('tong.preset')}:</span> <strong>{t(standard ? 'tong.preset.tongits-go' : 'tong.preset.custom')}</strong></p>
<p class="dim note">{t(standard ? 'tong.preset.tongits-go.help' : 'tong.preset.custom.help')}</p>
{#if !standard}<button type="button" class="ghost reset" onclick={() => onchange({ ...PRESETS['tongits-go'] })}>{t('tong.preset.reset')}</button>{/if}

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
    <fieldset><legend>{t(`tong.m.${key}`)}</legend>
      {#each ['replace', 'add'] as mode}<button type="button" class="ghost" aria-pressed={setup[key] === mode} onclick={() => setMode(key, mode as Mode)}>{t(`tong.mode.${mode}`)}</button>{/each}
    </fieldset>
  {/each}
</details>

<style>
  .head { margin: .9em 0 0; }
  .note { font-size: .85rem; margin: 6px 0 0; }
  .reset { margin-top: 8px; }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: var(--accent); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
</style>
