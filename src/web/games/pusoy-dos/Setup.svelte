<script lang="ts">
  import type { PusoyDosSetup } from '../../../games/pusoy-dos';
  import { t } from '../../lib/i18n.svelte';
  let { setup, playerCount, onchange }: { setup: PusoyDosSetup; playerCount: number; onchange: (next: PusoyDosSetup) => void } = $props();
  const penaltiesOn = $derived(setup.scoring === 'cards-left');
</script>
<p>{t('opt.scoring.winner-take-all')}</p>
<label class="opt" class:on={penaltiesOn}>
  <input type="checkbox" checked={penaltiesOn} onchange={(e) => onchange({ ...setup, scoringVersion: 2, scoring: e.currentTarget.checked ? 'cards-left' : 'winner-take-all', deuce: 'off', settlement: 'winner-only' })} />
  <span><strong>{t('opt.penalties')}</strong><small class="dim">+1 / card</small></span>
</label>
{#if playerCount === 3}
  <fieldset><legend>{t('opt.hand')}</legend>
    {#each [13, 17] as n}<button type="button" class="ghost" aria-pressed={setup.startingHand === n} onclick={() => onchange({ ...setup, startingHand: n })}>{n}</button>{/each}
  </fieldset>
{/if}
