<script lang="ts">
  import type { TongItsSetup } from '../../../games/tong-its';
  import type { RoomView } from '../../../shared/protocol';
  import { t } from '../../lib/i18n.svelte';
  import { potDealsSince } from './pot';

  let { room }: { room: RoomView } = $props();
  const setup = $derived(room.setup as TongItsSetup);
  const deals = $derived(potDealsSince(room.rounds) + 1);
  const chips = $derived(deals * setup.potAnte * room.players.length);

  // Two crowns, like a streak meter: the first lights when the last deal's winner has not yet collected the pot,
  // so winning the next deal as well takes it.
  const streak = $derived.by(() => {
    const last = room.rounds[room.rounds.length - 1];
    if (!last) return null;
    const input = last.input as { winner: string; potDeals?: number };
    if ((input.potDeals ?? 0) > 0) return null;
    return room.players.find((p) => p.id === input.winner)?.name ?? null;
  });
</script>

<div class="crowns" aria-hidden="true"><span class:lit={streak !== null}>&#9819;</span><span>&#9819;</span></div>
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
  .crowns { display: flex; gap: 6px; justify-content: center; font-size: 1.3rem; color: rgba(243, 233, 210, .3); }
  .crowns .lit { color: #e3c77f; filter: drop-shadow(0 0 6px rgba(227, 199, 127, .8)); animation: pop .45s ease-out; }
  .streak { margin: 0 0 2px; font-size: .75rem; color: #e3c77f; }
  @keyframes pop { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }
</style>
