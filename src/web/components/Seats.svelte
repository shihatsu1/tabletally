<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import { normalizeClock, remainingMs } from '../../core/clock';
  import type { RoomView } from '../../shared/protocol';
  import { reducedMotion } from '../lib/effects.svelte';
  import { fmt } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import { seatSlots } from '../lib/seats';
  import { send, session } from '../lib/session.svelte';
  import AnimatedNumber from './AnimatedNumber.svelte';

  let { room, youId, center }: { room: RoomView; youId: string | null; center?: Snippet } = $props();

  // You sit at the bottom of the table; everyone else is placed around you in turn order (any number of seats).
  const COLORS = ['#c9a24b', '#e4572e', '#6fd49a', '#6aa8ff'];

  const seated = $derived.by(() => {
    const ps = room.players;
    const me = youId ? ps.findIndex((p) => p.id === youId) : 0;
    const start = me < 0 ? 0 : me;
    const slots = seatSlots(ps.length);
    return ps.map((_, k) => {
      const p = ps[(start + k) % ps.length]!;
      return { p, slot: slots[k]!, color: COLORS[room.players.indexOf(p) % COLORS.length]! };
    });
  });

  const leader = $derived.by(() => {
    const totals = room.players.map((p) => ({ id: p.id, v: room.totals[p.id] ?? 0 }));
    const top = Math.max(...totals.map((x) => x.v));
    const tied = totals.filter((x) => x.v === top);
    return top > 0 && tied.length === 1 ? tied[0]!.id : null;
  });

  // --- turn ring: only ticks while a timer is running
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(ticker);
    if (room.clock) ticker = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(ticker);
  });
  onDestroy(() => clearInterval(ticker));

  // --- digital play: whose turn it is and how many cards each seat holds (counts are public)
  const playPending = $derived(new Set(room.mode === 'play' ? session.play?.pending ?? [] : []));
  const setsRows = $derived(room.gameId === 'pusoy');
  const counts = $derived(room.mode === 'play' && room.gameId !== 'pusoy' ? (session.play?.view as { counts?: Record<string, number> } | null | undefined)?.counts ?? null : null);

  // --- renaming: you can rename yourself; the host can rename computers and players it added by hand
  let editing = $state<string | null>(null);
  let draft = $state('');
  const canRename = (p: RoomView['players'][number]): boolean =>
    p.id === youId || (!!session.you?.isHost && (p.manual || p.bot !== undefined));
  function startRename(p: RoomView['players'][number]) {
    editing = p.id;
    draft = p.name;
  }
  function saveRename() {
    const target = room.players.find((p) => p.id === editing);
    if (target && draft.trim() !== '') {
      send(target.id === youId ? { t: 'rename', name: draft } : { t: 'rename', name: draft, playerId: target.id });
    }
    editing = null;
  }
  const editingPlayer = $derived(room.players.find((p) => p.id === editing));

  const clock = $derived(room.clock ? normalizeClock(room.clock, now + session.clockOffset) : null);
  const turnId = $derived(clock ? (clock.order[clock.turn] as string) : null);
  const share = $derived(clock ? Math.max(0, Math.min(1, remainingMs(clock, now + session.clockOffset) / clock.turnMs)) : 0);
  const lowTime = $derived(clock ? !clock.paused && share * clock.turnMs <= 5000 : false);
  const CIRC = 2 * Math.PI * 30;

  // --- on a new round: floating gains and losses, and chips flying to the winner
  let floaters = $state<{ id: string; v: number }[]>([]);
  let floatKey = $state(0);
  let tableEl = $state<HTMLElement | undefined>();
  // bind:this needs reactive storage; it is only read when chips fly, never to render
  let seatEls = $state<Record<string, HTMLElement | undefined>>({});
  let seenRounds: number | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const n = room.rounds.length;
    if (seenRounds !== null && n === seenRounds + 1) {
      const delta = room.rounds[n - 1]!.delta;
      floaters = room.players.map((p) => ({ id: p.id, v: delta[p.id] ?? 0 })).filter((f) => f.v !== 0);
      floatKey++;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (floaters = []), 2200);
      if (!reducedMotion()) flyChips(delta);
    }
    seenRounds = n;
  });
  onDestroy(() => clearTimeout(clearTimer));

  function centerOf(id: string): { x: number; y: number } | null {
    const el = seatEls[id];
    const box = tableEl?.getBoundingClientRect();
    if (!el || !box) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
  }

  function flyChips(delta: Record<string, number>): void {
    if (!tableEl) return;
    const winners = room.players.filter((p) => (delta[p.id] ?? 0) > 0).map((p) => p.id);
    const losers = room.players.filter((p) => (delta[p.id] ?? 0) < 0).map((p) => p.id);
    if (winners.length === 0) return;
    let k = 0;
    for (const from of losers) {
      const a = centerOf(from);
      if (!a) continue;
      for (let i = 0; i < 4; i++) {
        const b = centerOf(winners[(k + i) % winners.length]!);
        if (!b) continue;
        const chip = document.createElement('span');
        chip.className = 'flychip';
        chip.style.left = `${a.x}px`;
        chip.style.top = `${a.y}px`;
        tableEl.appendChild(chip);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const anim = chip.animate(
          [
            { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0 },
            { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 38}px)) scale(1.15)`, opacity: 1, offset: 0.5 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0 },
          ],
          { duration: 750, delay: 100 + i * 90, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' },
        );
        anim.onfinish = () => chip.remove();
      }
      k++;
    }
  }
</script>

<section class="table-wrap" aria-label={t('room.score')}>
  <h2 class="sr-only">{t('room.score')}</h2>
  <div class="table" class:dense={room.players.length > 6} bind:this={tableEl}>
    <div class="felt" aria-hidden="true"></div>
    <div class="middle">
      <span class="roundno">{room.rounds.length === 0 ? t('room.noRounds') : t('room.round', { n: room.rounds.length })}</span>
      {#if center}{@render center()}{/if}
    </div>

    {#each seated as { p, slot, color } (p.id)}
      {@const total = room.totals[p.id] ?? 0}
      {@const mine = p.id === youId}
      {@const onTurn = p.id === turnId}
      <div
        class="seat"
        class:mine
        class:turn={(onTurn && !!clock && !clock.paused) || playPending.has(p.id)}
        class:low={onTurn && lowTime}
        style={room.players.length > 6 ? undefined : `left: ${slot.x}%; top: ${slot.y}%`}
        bind:this={seatEls[p.id]}
        role="group"
        aria-label={`${p.name}${mine ? `, ${t('room.you')}` : ''}, ${fmt(total)} ${room.unit}`}
      >
        <div class="avatar" style="--c: {color}">
          {#if onTurn && clock}
            <svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="30" class="track" />
              <circle cx="32" cy="32" r="30" class="arc" stroke-dasharray={CIRC} stroke-dashoffset={CIRC * (1 - share)} />
            </svg>
          {/if}
          <span class="initial">{p.name.slice(0, 1).toUpperCase()}</span>
          {#if leader === p.id}<span class="crown" aria-hidden="true">♛</span>{/if}
          <span class="dot" class:on={p.connected || p.manual} title={p.connected ? '' : t('room.offline')}></span>
        </div>
        <div class="plate">
          <div class="name">{p.name}{#if mine}<small>&nbsp;({t('room.you')})</small>{/if}{#if canRename(p)}<button type="button" class="pen" aria-label={t('room.renameFor', { name: p.name })} onclick={() => startRename(p)}>&#9998;</button>{/if}</div>
          {#if p.bot}<div class="tag">{t('bot.tag', { level: t(`level.${p.bot}`) })}</div>{/if}
          <div class="total num"><AnimatedNumber value={total} /></div>
          {#if counts && counts[p.id] !== undefined}<div class="tag">{t('play.cardsLeft', { n: counts[p.id] ?? 0 })}</div>{/if}
          {#if setsRows && playPending.has(p.id)}<div class="tag">{t('pusoy.play.setting')}</div>{/if}
        </div>

        {#each session.reactions.filter((r) => r.from === p.id) as r (r.id)}
          <span class="react" aria-hidden="true">{r.emoji}</span>
        {/each}

        {#key floatKey}
          {#each floaters.filter((f) => f.id === p.id) as f (f.id)}
            <span class="float num" class:pos={f.v > 0} class:neg={f.v < 0}>{fmt(f.v)}</span>
          {/each}
        {/key}
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
  <p class="dim unit">{room.unit}</p>
</section>

<style>
  .table-wrap { margin: 14px 0; }
  .table { position: relative; height: 330px; }
  /* seven to ten seats do not fit around the oval on a phone: lay them out as a grid instead */
  .table.dense { height: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px 6px; padding: 8px 0; }
  .dense .felt { display: none; }
  .dense .middle { position: static; transform: none; width: auto; grid-column: 1 / -1; }
  .dense .seat { position: static; transform: none; width: auto; }
  .felt {
    position: absolute; inset: 9% 4%; border-radius: 50%;
    background: radial-gradient(ellipse at 50% 40%, var(--felt-600), var(--felt-700) 55%, var(--felt-900));
    border: 6px solid color-mix(in srgb, var(--brass) 70%, #000); box-shadow: inset 0 0 40px rgba(0,0,0,.45), 0 10px 30px rgba(0,0,0,.35);
  }
  :global(:root:not([data-theme='dark'])) .felt { box-shadow: inset 0 0 40px rgba(0,0,0,.35), 0 8px 22px rgba(0,0,0,.2); }
  .middle { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; width: 46%; color: var(--cream); }
  .roundno { font-family: var(--font-display); color: var(--cream-dim); font-size: .9rem; }
  .seat { position: absolute; transform: translate(-50%, -50%); width: 116px; text-align: center; }
  .avatar { position: relative; width: 56px; height: 56px; margin: 0 auto; border-radius: 50%; background: var(--c); display: grid; place-items: center; border: 3px solid #fff3c4; box-shadow: 0 4px 14px rgba(0,0,0,.45); }
  .mine .avatar { box-shadow: 0 0 0 3px var(--brass), 0 4px 14px rgba(0,0,0,.45); }
  .initial { font-family: var(--font-display); font-weight: 800; font-size: 1.5rem; color: #1d1608; }
  .crown { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 1.2rem; color: var(--brass-soft); text-shadow: 0 2px 6px rgba(0,0,0,.6); animation: bob 2s ease-in-out infinite; }
  .dot { position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%; background: #777; border: 2px solid var(--felt-900); }
  .dot.on { background: var(--mint); }
  .ring { position: absolute; inset: -9px; width: calc(100% + 18px); height: calc(100% + 18px); transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 4; }
  .track { stroke: rgba(255,255,255,.18); }
  .arc { stroke: var(--brass-soft); stroke-linecap: round; transition: stroke-dashoffset .25s linear; }
  .low .arc { stroke: var(--coral); }
  .turn .avatar { animation: glow 1.3s ease-in-out infinite; }
  .low .avatar { animation-duration: .5s; }
  .plate { margin-top: 6px; padding: 3px 10px 4px; border-radius: 12px; background: rgba(5, 30, 23, .88); border: 1px solid color-mix(in srgb, var(--brass) 55%, transparent); box-shadow: 0 3px 10px rgba(0,0,0,.35); }
  .name { font-weight: 700; font-size: .85rem; color: var(--cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name small { color: var(--cream-dim); font-weight: 400; }
  .total { font-size: 1.3rem; line-height: 1.15; }
  .tag { font-size: .7rem; color: var(--cream-dim); line-height: 1.2; }
  .pen { all: unset; cursor: pointer; margin-left: 4px; font-size: .8rem; color: var(--cream-dim); }
  .pen:focus-visible { outline: 2px solid var(--brass); border-radius: 4px; }
  .rename { margin-top: 8px; }
  .plate :global(.num) { color: var(--cream); }
  .plate :global(.num.pos) { color: #7fe0a8; }
  .plate :global(.num.neg) { color: #ff9a78; }
  .float { position: absolute; left: 50%; top: 4px; font-size: 1.5rem; font-weight: 800; pointer-events: none; text-shadow: 0 2px 8px rgba(0,0,0,.8); animation: rise 2s ease-out forwards; }
  .float.pos { color: var(--mint); }
  .float.neg { color: #ff9a78; }
  .react { position: absolute; left: 50%; top: -6px; font-size: 2rem; pointer-events: none; animation: bubble 2.4s ease-out forwards; filter: drop-shadow(0 3px 6px rgba(0,0,0,.5)); }
  .unit { text-align: right; margin: 0; font-size: .8rem; }
  :global(.flychip) { position: absolute; z-index: 5; width: 20px; height: 20px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle at 35% 30%, #f3e0a0, #c9a24b 60%, #8a6a1f); border: 2px dashed rgba(29,22,8,.55); box-shadow: 0 2px 6px rgba(0,0,0,.5); }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(227,199,127,.7), 0 4px 14px rgba(0,0,0,.45); } 50% { box-shadow: 0 0 0 9px rgba(227,199,127,0), 0 4px 14px rgba(0,0,0,.45); } }
  @keyframes rise { 0% { transform: translate(-50%, 10px) scale(.6); opacity: 0; } 15% { transform: translate(-50%, -6px) scale(1.2); opacity: 1; } 100% { transform: translate(-50%, -64px) scale(1); opacity: 0; } }
  @keyframes bubble { 0% { transform: translate(-50%, 8px) scale(.4); opacity: 0; } 12% { transform: translate(-50%, -14px) scale(1.25); opacity: 1; } 80% { transform: translate(-50%, -46px) scale(1); opacity: 1; } 100% { transform: translate(-50%, -64px) scale(.9); opacity: 0; } }
  @keyframes bob { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
</style>
