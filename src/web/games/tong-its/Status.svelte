<script lang="ts">
  import type { TongItsSetup } from '../../../games/tong-its';
  import type { RoomView } from '../../../shared/protocol';
  import { t } from '../../lib/i18n.svelte';
  import { potContender, potDealsSince } from './pot';

  let { room }: { room: RoomView } = $props();
  const setup = $derived(room.setup as TongItsSetup);
  const deals = $derived(potDealsSince(room.rounds) + 1);
  const chips = $derived(deals * setup.potAnte * room.players.length);

  const contender = $derived(potContender(room.rounds));
  const streak = $derived(room.players.find((p) => p.id === contender)?.name ?? null);
</script>

{#if streak}<p class="streak">{t('tong.streak', { name: streak })}</p>{/if}
<div class="pot" aria-label={t('tong.potTitle')}>
  <span class="label">{t('tong.potTitle')}</span>
  {#key chips}<span class="num amt">{chips}</span>{/key}
  <span class="small">{t('tong.potChips', { deals })}</span>
</div>

<style>
  /* Sits on the green felt, so it uses fixed light colours in both themes. */
  .pot { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 4px 8px; margin: 8px 0 0; padding: 6px 12px; border: 1px dashed rgba(243, 233, 210, .55); border-radius: 18px; background: rgba(5, 30, 23, .45); color: #f3e9d2; }
  .label { font-family: var(--font-display); color: #e3c77f; }
  .amt { font-size: 1.5rem; animation: pop .45s ease-out; color: #f3e9d2; }
  .small { font-size: .75rem; color: #cfc4aa; }
  .streak { margin: 0 0 2px; font-size: .75rem; color: #e3c77f; }
  @keyframes pop { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }
</style>
