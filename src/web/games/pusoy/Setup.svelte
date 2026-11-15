<script lang="ts">
  import type { PusoySetup } from '../../../games/pusoy';
  import { t } from '../../lib/i18n.svelte';
  let { setup }: { setup: PusoySetup; playerCount: number; onchange: (next: PusoySetup) => void } = $props();
</script>
<p>{t('game.pusoy')}: 1 / 2</p>
<p class="dim">{t('pusoy.royalties.on')}</p>
