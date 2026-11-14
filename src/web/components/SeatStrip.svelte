<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RoomView } from '../../shared/protocol';
  import { fmt } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import { session } from '../lib/session.svelte';
  import AnimatedNumber from './AnimatedNumber.svelte';

  let { room, youId }: { room: RoomView; youId: string | null } = $props();

  const COLORS = ['#c9a24b', '#e4572e', '#6fd49a', '#6aa8ff'];
  const pending = $derived(new Set(session.play?.pending ?? []));
  const counts = $derived(room.gameId === 'pusoy' ? null : (session.play?.view as { counts?: Record<string, number> } | null | undefined)?.counts ?? null);
  const leader = $derived.by(() => {
    const totals = room.players.map((p) => ({ id: p.id, v: room.totals[p.id] ?? 0 }));
    const top = Math.max(...totals.map((x) => x.v));
    const tied = totals.filter((x) => x.v === top);
    return top > 0 && tied.length === 1 ? tied[0]!.id : null;
  });

  // After a hand is scored, show each seat's gain or loss for a moment.
  let deltas = $state<Record<string, number>>({});
  let seen: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const n = room.rounds.length;
    if (seen !== null && n === seen + 1) {
      deltas = { ...room.rounds[n - 1]!.delta };
      clearTimeout(timer);
      timer = setTimeout(() => (deltas = {}), 3500);
    }
    seen = n;
  });
  onDestroy(() => clearTimeout(timer));

  type PokerSeat = { stack: number; bet: number; folded: boolean; allIn: boolean; dealer: boolean };
  const pokerSeats = $derived(room.gameId === 'poker' ? (session.play?.view as { seat?: Record<string, PokerSeat> } | null | undefined)?.seat ?? null : null);
  const sub = (p: RoomView['players'][number]): string => {
    const ps = pokerSeats?.[p.id];
    if (ps) return `${ps.dealer ? 'D ' : ''}${ps.stack}${ps.folded ? ' · ' + t('poker.folded') : ps.allIn ? ' · ' + t('poker.allin') : ps.bet > 0 ? ' · ' + t('poker.seatBet', { n: ps.bet }) : ''}`;
    if (room.gameId === 'pusoy' && pending.has(p.id)) return t('pusoy.play.setting');
    if (counts && counts[p.id] !== undefined) return t('play.cardsLeft', { n: counts[p.id] ?? 0 });
    return p.bot ? t(`level.${p.bot}`) : '';
  };
</script>

<div class="strip" class:two={room.players.length > 4} role="list" aria-label={t('room.score')}>
  {#each room.players as p, i (p.id)}
    {@const total = room.totals[p.id] ?? 0}
    <div class="seat" class:turn={pending.has(p.id)} class:mine={p.id === youId} class:out={pokerSeats?.[p.id]?.folded} role="listitem">
      <span class="avatar" style="--c: {COLORS[i % COLORS.length]}">
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <span class="dot" class:on={p.connected || p.manual}></span>
      <span class="txt">
        <span class="name">{#if leader === p.id}<span class="crown" aria-label="leader">♛</span> {/if}{p.name}</span>
        <span class="line"><span class="num total"><AnimatedNumber value={total} /></span>{#if sub(p)}<small>{sub(p)}</small>{/if}</span>
      </span>
      {#if deltas[p.id]}<span class="delta num" class:pos={deltas[p.id]! > 0} class:neg={deltas[p.id]! < 0}>{deltas[p.id]! > 0 ? '+' : ''}{fmt(deltas[p.id]!)}</span>{/if}
      {#each session.reactions.filter((r) => r.from === p.id) as r (r.id)}<span class="react" aria-hidden="true">{r.emoji}</span>{/each}
    </div>
  {/each}
</div>

<style>
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
  .seat { position: relative; display: flex; align-items: center; gap: 5px; padding: 4px 5px; border-radius: 10px; background: rgba(5, 30, 23, .88); border: 1px solid color-mix(in srgb, var(--brass) 40%, transparent); min-width: 0; }
  .seat.mine { border-color: var(--brass); }
  .seat.out { opacity: .55; }
  /* five or six seats need two rows on a narrow phone, but fit in one row on a wider screen */
  @media (max-width: 520px) { .strip.two { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .seat.turn { box-shadow: 0 0 0 2px var(--brass-soft, var(--brass)); animation: glow 1.4s ease-in-out infinite; }
  .avatar { position: relative; flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--c); display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: .85rem; color: #1d1608; border: 2px solid #fff3c4; }
  .crown { color: var(--brass-soft, var(--brass)); }
  .dot { position: absolute; right: 4px; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: #777; }
  .dot.on { background: var(--mint, #6fd49a); }
  .txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
  .name { font-size: .72rem; font-weight: 700; color: var(--cream, #f3e9d2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
  .total { font-size: .95rem; color: var(--cream, #f3e9d2); }
  .line small { font-size: .6rem; color: var(--cream-dim, #cfc4aa); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .delta { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); font-weight: 800; font-size: 1rem; text-shadow: 0 2px 6px rgba(0,0,0,.8); animation: rise 3.5s ease-out forwards; pointer-events: none; z-index: 3; }
  .delta.pos { color: var(--mint, #6fd49a); }
  .delta.neg { color: #ff9a78; }
  .react { position: absolute; left: 50%; top: -22px; font-size: 1.6rem; pointer-events: none; animation: bubble 2.4s ease-out forwards; z-index: 4; }
  /* Four seats on a phone: drop the avatar circles so names fit. */
  @media (max-width: 460px) { .avatar { display: none; } .seat { padding: 4px 8px 4px 6px; } }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 0 2px rgba(227,199,127,.9); } 50% { box-shadow: 0 0 0 5px rgba(227,199,127,0); } }
  @keyframes rise { 0% { opacity: 0; transform: translate(-50%, 8px); } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -10px); } }
  @keyframes bubble { 0% { transform: translate(-50%, 8px) scale(.4); opacity: 0; } 12% { transform: translate(-50%, -6px) scale(1.2); opacity: 1; } 80% { opacity: 1; } 100% { transform: translate(-50%, -26px); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .seat.turn, .delta, .react { animation: none; } }
</style>
