<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RoomView } from '../../shared/protocol';
  import { gameUis } from '../games';
  import { fmt } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import { session } from '../lib/session.svelte';
  import AnimatedNumber from './AnimatedNumber.svelte';
  import Icon from './Icon.svelte';

  let { room, youId }: { room: RoomView; youId: string | null } = $props();

  const gameUi = $derived(gameUis[room.gameId]);
  const pending = $derived(new Set(session.play?.pending ?? []));
  const view = $derived(session.play?.view ?? null);
  const leader = $derived.by(() => {
    const totals = room.players.map((p) => ({ id: p.id, v: room.totals[p.id] ?? 0 }));
    const top = Math.max(...totals.map((x) => x.v));
    const tied = totals.filter((x) => x.v === top);
    return top > 0 && tied.length === 1 ? tied[0]!.id : null;
  });

  // After a hand is recorded, show each seat's gain or loss for a moment.
  let deltas = $state<Record<string, number>>({});
  let seen: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const n = room.rounds.length;
    if (seen !== null && n === seen + 1 && room.history.at(-1)?.action === 'add') {
      deltas = { ...room.rounds[n - 1]!.delta };
      clearTimeout(timer);
      timer = setTimeout(() => (deltas = {}), 3500);
    }
    seen = n;
  });
  onDestroy(() => clearTimeout(timer));

  const BACKS_SHOWN = 5;
</script>

<div class="strip" class:two={room.players.length > 4} role="list" aria-label={t('room.score')}>
  {#each room.players as p (p.id)}
    {@const total = room.totals[p.id] ?? 0}
    {@const info = view ? gameUi?.seat?.(view, p.id, t) ?? null : null}
    <div class="seat" class:turn={pending.has(p.id)} class:mine={p.id === youId} class:out={info?.out} role="listitem"
      aria-label={`${p.name}${p.id === youId ? `, ${t('room.you')}` : ''}: ${fmt(total)} ${room.unit}${info?.cards !== undefined ? `, ${t('play.cardsLeft', { n: info.cards })}` : ''}${info?.text ? `, ${info.text}` : ''}`}>
      <span class="top">
        {#if leader === p.id}<span class="crown"><Icon name="crown" size={12} /></span>{/if}
        <span class="name">{p.name}</span>
        {#if info?.dealer}<span class="dealer" title={t('poker.dealer')}>D</span>{/if}
        <span class="dot" class:on={p.connected}></span>
      </span>
      <span class="live" aria-hidden="true">
        {#if info?.cards !== undefined}
          <span class="backs">
            {#each Array.from({ length: Math.min(info.cards, BACKS_SHOWN) }, (_, k) => k) as k (k)}
              <span class="back" style="--k: {k - (Math.min(info.cards, BACKS_SHOWN) - 1) / 2}"></span>
            {/each}
          </span>
          <b class="cnt">{info.cards}</b>
        {/if}
        {#if info?.text}<small>{info.text}</small>{/if}
      </span>
      <span class="total num" class:pos={total > 0} class:neg={total < 0} aria-hidden="true"><AnimatedNumber value={total} /></span>
      {#if deltas[p.id]}<span class="delta num" class:pos={deltas[p.id]! > 0} class:neg={deltas[p.id]! < 0} aria-hidden="true">{fmt(deltas[p.id]!)}</span>{/if}
      {#each session.reactions.filter((r) => r.from === p.id) as r (r.id)}<span class="react" aria-hidden="true">{r.emoji}</span>{/each}
    </div>
  {/each}
</div>

<style>
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
  .seat { position: relative; display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'top top' 'live total'; align-items: center; column-gap: 4px; padding: 4px 6px; border-radius: 10px; background: rgba(5, 30, 23, .9); border: 1px solid color-mix(in srgb, var(--brass) 40%, transparent); min-width: 0; min-height: 50px; }
  .seat.mine { border-color: var(--brass); }
  .seat.out { opacity: .55; }
  @media (max-width: 520px) { .strip.two { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .seat.turn { box-shadow: 0 0 0 2px var(--brass-soft, var(--brass)); animation: glow 1.4s ease-in-out infinite; }
  .top { grid-area: top; display: flex; align-items: center; gap: 3px; min-width: 0; }
  .crown { color: var(--brass-soft); display: inline-flex; }
  .name { flex: 1; min-width: 0; font-size: .74rem; font-weight: 700; color: var(--cream, #f3e9d2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dealer { flex: none; width: 15px; height: 15px; border-radius: 50%; background: var(--cream); color: #1d1608; font-size: .62rem; font-weight: 800; display: grid; place-items: center; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #777; }
  .dot.on { background: var(--mint, #6fd49a); }
  .live { grid-area: live; display: flex; align-items: center; gap: 4px; min-width: 0; height: 20px; }
  .backs { position: relative; width: 26px; height: 18px; flex: none; }
  .back { position: absolute; left: calc(50% - 6px + var(--k) * 3px); bottom: 0; width: 12px; height: 17px; border-radius: 2px; border: 1px solid var(--brass); transform: rotate(calc(var(--k) * 9deg)); transform-origin: 50% 130%;
    background: repeating-linear-gradient(45deg, rgba(201,162,75,.5) 0 1.5px, transparent 1.5px 4px), var(--felt-800); }
  .cnt { font-size: .85rem; color: var(--cream); font-variant-numeric: tabular-nums; }
  .live small { font-size: .66rem; color: var(--cream-dim, #cfc4aa); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .total { grid-area: total; font-size: .78rem; color: var(--cream-dim); }
  .total.pos { color: #7fe0a8; }
  .total.neg { color: #ff9a78; }
  .delta { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); font-weight: 800; font-size: 1rem; text-shadow: 0 2px 6px rgba(0,0,0,.8); animation: rise 3.5s ease-out forwards; pointer-events: none; z-index: 3; }
  .delta.pos { color: var(--mint, #6fd49a); }
  .delta.neg { color: #ff9a78; }
  .react { position: absolute; left: 50%; top: -22px; font-size: 1.6rem; pointer-events: none; animation: bubble 2.4s ease-out forwards; z-index: 4; }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 0 2px rgba(227,199,127,.9); } 50% { box-shadow: 0 0 0 5px rgba(227,199,127,0); } }
  @keyframes rise { 0% { opacity: 0; transform: translate(-50%, 8px); } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -10px); } }
  @keyframes bubble { 0% { transform: translate(-50%, 8px) scale(.4); opacity: 0; } 12% { transform: translate(-50%, -6px) scale(1.2); opacity: 1; } 80% { opacity: 1; } 100% { transform: translate(-50%, -26px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .seat.turn, .delta, .react { animation: none; } }
</style>
