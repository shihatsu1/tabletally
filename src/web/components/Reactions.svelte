<script lang="ts">
  import { REACTIONS } from '../../shared/protocol';
  import { t } from '../lib/i18n.svelte';
  import { send } from '../lib/session.svelte';

  let cooling = $state(false);

  function react(emoji: string) {
    if (cooling) return;
    send({ t: 'react', emoji });
    cooling = true;
    setTimeout(() => (cooling = false), 900);
  }
</script>

<div class="bar" role="group" aria-label={t('react.title')}>
  {#each REACTIONS as e (e)}
    <button type="button" class="ghost e" disabled={cooling} aria-label={e} onclick={() => react(e)}>{e}</button>
  {/each}
</div>

<style>
  .bar { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin: 4px 0 0; }
  .e { min-height: 44px; min-width: 44px; padding: 0; font-size: 1.4rem; border-radius: 50%; }
  .e:active:not(:disabled) { transform: scale(1.2); }
</style>
