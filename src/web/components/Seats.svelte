<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RoomView } from '../../shared/protocol';
  import { t } from '../lib/i18n.svelte';
  import { seatSlots } from '../lib/seats';
  import { send, session } from '../lib/session.svelte';
  import Icon from './Icon.svelte';

  /** The waiting room: who has sat down and which seats are still free. Hands are played on PlayScreen. */
  let { room, youId, center }: { room: RoomView; youId: string | null; center?: Snippet } = $props();

  const COLORS = ['#c9a24b', '#e4572e', '#6fd49a', '#6aa8ff', '#d98ad6', '#e8d27a'];
  const SEAT_HALF = 48; // half a seat's width in px; keeps the edge seats inside the screen

  // You sit at the bottom of the table; the others, then the free seats, follow around it.
  const seats = $derived.by(() => {
    const ps = room.players;
    const me = youId ? ps.findIndex((p) => p.id === youId) : 0;
    const start = me < 0 ? 0 : me;
    const slots = seatSlots(room.playerCount);
    return slots.map((slot, k) => {
      const p = k < ps.length ? ps[(start + k) % ps.length] : undefined;
      return { slot, p, color: p ? COLORS[ps.indexOf(p) % COLORS.length] : undefined };
    });
  });

  // You can rename yourself; the host can also rename computers.
  let editing = $state<string | null>(null);
  let draft = $state('');
  const canRename = (p: RoomView['players'][number]): boolean => p.id === youId || (!!session.you?.isHost && p.bot !== undefined);
  function saveRename() {
    const target = room.players.find((p) => p.id === editing);
    if (target && draft.trim() !== '') send(target.id === youId ? { t: 'rename', name: draft } : { t: 'rename', name: draft, playerId: target.id });
    editing = null;
  }
  const editingPlayer = $derived(room.players.find((p) => p.id === editing));
</script>

<section class="table-wrap" aria-label={t('room.seatsTitle')}>
  <h2 class="sr-only">{t('room.seatsTitle')}</h2>
  <div class="table">
    <div class="felt" aria-hidden="true"></div>
    <div class="middle">
      <span class="count">{t('room.seats', { n: room.players.length, total: room.playerCount })}</span>
      {#if center}{@render center()}{/if}
    </div>

    {#each seats as { slot, p, color }, i (p?.id ?? `free-${i}`)}
      <div class="seat" style="left: clamp({SEAT_HALF}px, {slot.x}%, calc(100% - {SEAT_HALF}px)); top: {slot.y}%">
        {#if p}
          {@const mine = p.id === youId}
          <div class="avatar" class:mine style="--c: {color}">
            <span class="initial" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
            <span class="dot" class:on={p.connected} title={p.connected ? '' : t('room.offline')}></span>
          </div>
          <div class="plate">
            <span class="name">{p.name}</span>
            {#if mine}<span class="tag">{t('room.you')}</span>{:else if p.bot}<span class="tag">{t('bot.tag', { level: t(`level.${p.bot}`) })}</span>{/if}
            {#if canRename(p)}
              <button type="button" class="pen" aria-label={t('room.renameFor', { name: p.name })} onclick={() => { editing = p.id; draft = p.name; }}><Icon name="pen" /></button>
            {/if}
          </div>
          {#each session.reactions.filter((r) => r.from === p.id) as r (r.id)}
            <span class="react" aria-hidden="true">{r.emoji}</span>
          {/each}
        {:else}
          <div class="avatar free" aria-hidden="true"></div>
          <div class="plate free"><span class="name">{t('room.freeSeat')}</span></div>
        {/if}
      </div>
    {/each}
  </div>
  {#if editingPlayer}
    <form class="rename" onsubmit={(e) => { e.preventDefault(); saveRename(); }}>
      <label for="rename-input">{t('room.renameFor', { name: editingPlayer.name })}</label>
      <div class="row">
        <input id="rename-input" bind:value={draft} maxlength="24" autocomplete="off" />
        <button type="submit" class="primary" disabled={draft.trim() === ''}>{t('room.renameSave')}</button>
        <button type="button" class="ghost" onclick={() => (editing = null)}>{t('room.renameCancel')}</button>
      </div>
    </form>
  {/if}
</section>

<style>
  .table-wrap { margin: 14px 0; }
  .table { position: relative; height: 300px; }
  .felt {
    position: absolute; inset: 10% 6%; border-radius: 50%;
    background: radial-gradient(ellipse at 50% 40%, var(--felt-600), var(--felt-700) 55%, var(--felt-900));
    border: 6px solid color-mix(in srgb, var(--brass) 70%, #000); box-shadow: inset 0 0 40px rgba(0,0,0,.45), 0 10px 30px rgba(0,0,0,.35);
  }
  .middle { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; width: 46%; color: var(--cream); }
  .count { font-family: var(--font-display); color: var(--cream); font-size: 1rem; }
  .seat { position: absolute; transform: translate(-50%, -50%); width: 96px; text-align: center; }
  .avatar { position: relative; width: 52px; height: 52px; margin: 0 auto; border-radius: 50%; background: var(--c); display: grid; place-items: center; border: 3px solid #fff3c4; box-shadow: 0 4px 14px rgba(0,0,0,.45); }
  .avatar.mine { box-shadow: 0 0 0 3px var(--brass), 0 4px 14px rgba(0,0,0,.45); }
  .avatar.free { background: transparent; border: 2px dashed color-mix(in srgb, var(--brass) 70%, transparent); box-shadow: none; }
  .initial { font-family: var(--font-display); font-weight: 800; font-size: 1.4rem; color: #1d1608; }
  .dot { position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%; background: #777; border: 2px solid var(--felt-900); }
  .dot.on { background: var(--mint); }
  .plate { margin-top: 6px; padding: 3px 6px 4px; border-radius: 12px; background: rgba(5, 30, 23, .9); border: 1px solid color-mix(in srgb, var(--brass) 55%, transparent); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; column-gap: 2px; }
  .plate.free { background: transparent; border-style: dashed; }
  .name { font-weight: 700; font-size: .85rem; color: var(--cream); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .free .name { font-weight: 400; color: var(--cream-dim); }
  .tag { width: 100%; font-size: .72rem; color: var(--cream-dim); line-height: 1.2; }
  /* 44 px hit area around a small pen */
  .pen { min-height: 0; width: 44px; height: 44px; margin: -12px -14px -12px -8px; padding: 0; border: 0; background: transparent; color: var(--cream-dim); display: inline-grid; place-items: center; }
  .rename { margin-top: 8px; }
  .react { position: absolute; left: 50%; top: -6px; font-size: 2rem; pointer-events: none; animation: bubble 2.4s ease-out forwards; filter: drop-shadow(0 3px 6px rgba(0,0,0,.5)); }
  @keyframes bubble { 0% { transform: translate(-50%, 8px) scale(.4); opacity: 0; } 12% { transform: translate(-50%, -14px) scale(1.25); opacity: 1; } 80% { transform: translate(-50%, -46px) scale(1); opacity: 1; } 100% { transform: translate(-50%, -64px) scale(.9); opacity: 0; } }
</style>
