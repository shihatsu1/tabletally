<script lang="ts">
  import { MAX_CHIPS, blindsOf, defaultSetup, type PokerSetup } from '../../../games/poker';
  import { t } from '../../lib/i18n.svelte';

  interface Props {
    setup: PokerSetup;
    playerCount: number;
    onchange: (next: PokerSetup) => void;
  }
  let { setup, onchange }: Props = $props();

  const patch = (over: Partial<PokerSetup>) => onchange({ ...setup, ...over });
  const blinds = $derived(blindsOf(setup));

  function num(input: HTMLInputElement, min: number, max: number): number {
    const v = Number.parseInt(input.value, 10);
    const clamped = Math.max(min, Math.min(Number.isSafeInteger(v) ? v : min, max));
    input.value = String(clamped);
    return clamped;
  }
</script>

<p class="dim note">{t('poker.optHelp')}</p>

<div class="grid">
  <div>
    <label for="p-chips">{t('poker.opt.chips')}</label>
    <input id="p-chips" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value={String(setup.chips)} onchange={(e) => patch({ chips: num(e.currentTarget, 1, MAX_CHIPS) })} />
  </div>
  <div>
    <label for="p-units">{t('poker.opt.units')}</label>
    <input id="p-units" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value={String(setup.moneyUnits)} onchange={(e) => patch({ moneyUnits: num(e.currentTarget, 1, MAX_CHIPS) })} />
  </div>
</div>
<p class="dim note">{t('poker.opt.ratioLine', { chips: setup.chips, units: setup.moneyUnits })}</p>

<label for="p-buyin">{t('poker.opt.buyIn')}</label>
<input id="p-buyin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value={String(setup.buyIn)} onchange={(e) => patch({ buyIn: num(e.currentTarget, 1, MAX_CHIPS) })} />

<div class="grid">
  <div>
    <label for="p-sb">{t('poker.opt.sb')}</label>
    <input id="p-sb" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value={String(blinds.sb)} onchange={(e) => patch({ smallBlind: Math.min(num(e.currentTarget, 1, MAX_CHIPS), blinds.bb), bigBlind: blinds.bb })} />
  </div>
  <div>
    <label for="p-bb">{t('poker.opt.bb')}</label>
    <input id="p-bb" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" value={String(blinds.bb)} onchange={(e) => { const bb = Math.min(num(e.currentTarget, 1, MAX_CHIPS), setup.buyIn); patch({ bigBlind: bb, smallBlind: Math.min(blinds.sb, bb) }); }} />
  </div>
</div>
<p class="dim note">{t('poker.opt.blindsHelp')}</p>

<button type="button" class="ghost spaced" onclick={() => onchange(defaultSetup())}>{t('pusoy.reset')}</button>

<style>
  .note { font-size: .85rem; margin: 4px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
</style>
