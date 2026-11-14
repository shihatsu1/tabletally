<script lang="ts">
  import { onDestroy } from 'svelte';
  import { PAUSE_WINDOW_MS, normalizeClock, remainingMs } from '../../core/clock';
  import type { RoomView } from '../../shared/protocol';
  import { pushBanners } from '../lib/banners.svelte';
  import { playBuzz, playPause, playTick, playTurn } from '../lib/effects.svelte';
  import { t } from '../lib/i18n.svelte';
  import { send, session } from '../lib/session.svelte';

  let { room, youId, isHost }: { room: RoomView; youId: string | null; isHost: boolean } = $props();

  let now = $state(Date.now());
  const timer = setInterval(() => (now = Date.now()), 250);
  onDestroy(() => clearInterval(timer));

  const serverNow = $derived(now + session.clockOffset);
  const clock = $derived(room.clock ? normalizeClock(room.clock, serverNow) : null);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? id;
  const left = $derived(clock ? remainingMs(clock, serverNow) : 0);
  const secs = $derived(Math.ceil(left / 1000));
  const current = $derived(clock ? (clock.order[clock.turn] as string) : null);
  const yourTurn = $derived(current !== null && current === youId);
  const share = $derived(clock ? Math.max(0, Math.min(1, left / clock.turnMs)) : 0);
  const waitingFor = $derived(
    clock?.pauseReq ? room.players.filter((p) => !p.manual && !clock.pauseReq!.agreed.includes(p.id)).map((p) => p.name) : [],
  );
  const iAgreed = $derived(!!(clock?.pauseReq && youId && clock.pauseReq.agreed.includes(youId)));
  const requestLeft = $derived(clock?.pauseReq ? Math.max(0, Math.ceil((clock.pauseReq.at + PAUSE_WINDOW_MS - serverNow) / 1000)) : 0);
  const timedOut = $derived(
    clock ? room.players.map((p) => ({ name: p.name, n: clock.timeouts?.[p.id] ?? 0 })).filter((x) => x.n > 0) : [],
  );

  // A pause request, or a paused game, blocks the whole screen for everyone until it is settled.
  const asking = $derived(!!clock && !clock.paused && !!clock.pauseReq);
  const paused = $derived(!!clock?.paused);
  const blocked = $derived(asking || paused);

  let dialog = $state<HTMLDialogElement | undefined>();
  $effect(() => {
    if (!dialog) return;
    if (blocked && !dialog.open) dialog.showModal();
    else if (!blocked && dialog.open) dialog.close();
  });

  let seconds = $state('30');
  let first = $state('0');

  // Timeout notice, and sound cues for turns, the last seconds, and pausing.
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let seenTimeouts: Record<string, number> | null = null;
  let lastTurnKey = '';
  let lastTick = -1;
  let wasPaused = false;
  let hadClock = false;

  $effect(() => {
    if (clock && !hadClock) pushBanners([{ text: t('banner.start'), tone: 'info' }]);
    hadClock = !!clock;
    if (!clock) {
      seenTimeouts = null;
      lastTurnKey = '';
      wasPaused = false;
      return;
    }
    // someone ran out of time
    const counts = clock.timeouts ?? {};
    if (seenTimeouts) {
      const hit = room.players.find((p) => (counts[p.id] ?? 0) > (seenTimeouts?.[p.id] ?? 0));
      if (hit) {
        toast = t('clock.timedOut', { name: hit.name });
        playBuzz();
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toast = null), 3500);
      }
    }
    seenTimeouts = { ...counts };

    if (clock.paused && !wasPaused) playPause();
    wasPaused = !!clock.paused;
    if (clock.paused) return;

    const key = `${clock.turn}:${clock.startedAt}`;
    if (key !== lastTurnKey) {
      lastTurnKey = key;
      lastTick = -1;
      if (yourTurn) {
        playTurn();
      }
    }
    if (yourTurn && secs <= 5 && secs > 0 && secs !== lastTick) {
      lastTick = secs;
      playTick();
    }
  });
  onDestroy(() => clearTimeout(toastTimer));
</script>

{#if toast}<div class="toast" role="status">{toast}</div>{/if}

{#if !clock}
  {#if isHost}
    <section class="card">
      <h2>{t('clock.title')}</h2>
      <p class="dim" style="margin-top: 0">{t('clock.intro')}</p>
      <div class="row">
        <div class="grow">
          <label for="clock-secs">{t('clock.seconds')}</label>
          <select id="clock-secs" bind:value={seconds}>
            {#each [15, 20, 30, 45, 60, 90] as s (s)}<option value={String(s)}>{s}</option>{/each}
          </select>
        </div>
        <div class="grow">
          <label for="clock-first">{t('clock.first')}</label>
          <select id="clock-first" bind:value={first}>
            {#each room.players as p, i (p.id)}<option value={String(i)}>{p.name}</option>{/each}
          </select>
        </div>
      </div>
      <button type="button" class="primary" style="width: 100%; margin-top: 14px" onclick={() => send({ t: 'clock', op: 'start', seconds: Number(seconds), first: Number(first) })}>
        {t('clock.start')}
      </button>
    </section>
  {/if}
{:else}
  <section class="card clock" class:mine={yourTurn} class:low={!clock.paused && secs <= 5} aria-live="polite">
    <div class="row">
      <h2 class="grow" style="margin: 0">{current ? nameOf(current) : ''}{yourTurn ? ` (${t('room.you')})` : ''}</h2>
      <span class="count num" aria-label={t('clock.left', { n: secs })}>{secs}</span>
    </div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share * 100)}>
      <div class="fill" style="width: {share * 100}%"></div>
    </div>

    <div class="row wrap" style="margin-top: 12px">
      {#if yourTurn || isHost}
        <button type="button" class="primary grow" onclick={() => send({ t: 'clock', op: 'done' })}>{t('clock.done')}</button>
      {/if}
      {#if youId}
        <button type="button" class="grow" onclick={() => send({ t: 'clock', op: 'pause' })}>{t('clock.askPause')}</button>
      {/if}
    </div>

    {#if timedOut.length > 0}
      <p class="dim timeouts">{t('clock.timeouts')}: {timedOut.map((x) => `${x.name} ×${x.n}`).join(', ')}</p>
    {/if}

    {#if isHost}
      <button type="button" class="ghost" style="margin-top: 12px" onclick={() => send({ t: 'clock', op: 'stop' })}>{t('clock.stop')}</button>
    {/if}
  </section>
{/if}

<!-- A native modal dialog: everything behind it is inert, so nobody can act while a pause is being decided. -->
<dialog bind:this={dialog} class="block" oncancel={(e) => e.preventDefault()} aria-labelledby="block-title">
  {#if toast}<p class="warn" role="status">{toast}</p>{/if}
  {#if clock && asking}
    <h2 id="block-title">{t('clock.pauseAsked', { name: clock.pauseReq ? nameOf(clock.pauseReq.by) : '' })}</h2>
    <p class="big num">{secs}</p>
    <p class="dim">{t('clock.stillRunning', { name: current ? nameOf(current) : '' })}</p>
    {#if waitingFor.length > 0}<p>{t('clock.waiting', { names: waitingFor.join(', ') })}</p>{/if}
    <p class="dim small">{t('clock.keepsRunning', { n: requestLeft })}</p>
    {#if youId}
      <div class="row wrap">
        {#if !iAgreed}<button type="button" class="primary grow" onclick={() => send({ t: 'clock', op: 'pause' })}>{t('clock.agree')}</button>{:else}<p class="grow ok">{t('clock.youAgreed')}</p>{/if}
        <button type="button" class="grow" onclick={() => send({ t: 'clock', op: 'decline' })}>{t('clock.decline')}</button>
      </div>
    {/if}
  {:else if clock && paused}
    <h2 id="block-title">{t('clock.paused')}</h2>
    <p class="big num">{secs}</p>
    <p class="dim">{t('clock.pausedNote', { name: current ? nameOf(current) : '', n: secs })}</p>
    <div class="row wrap">
      {#if youId}<button type="button" class="primary grow" onclick={() => send({ t: 'clock', op: 'resume' })}>{t('clock.resume')}</button>{/if}
      {#if isHost}<button type="button" class="ghost" onclick={() => send({ t: 'clock', op: 'stop' })}>{t('clock.stop')}</button>{/if}
    </div>
  {/if}
</dialog>

<style>
  .clock.mine { border-color: var(--brass); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brass) 45%, transparent); }
  .count { font-size: 2.6rem; line-height: 1; min-width: 2.2ch; text-align: right; }
  .low .count { color: var(--neg); }
  .bar { height: 10px; border-radius: 999px; background: var(--bg-deep); overflow: hidden; margin-top: 8px; }
  .fill { height: 100%; background: var(--brass); transition: width .25s linear; }
  .low .fill { background: var(--coral); }
  .timeouts { margin: 10px 0 0; font-size: .85rem; }
  .toast { position: fixed; top: calc(env(safe-area-inset-top) + 12px); left: 50%; transform: translateX(-50%); z-index: 60; background: var(--coral); color: #fff; padding: .6em 1.2em; border-radius: 999px; font-weight: 700; box-shadow: 0 6px 24px rgba(0,0,0,.4); animation: drop .3s ease-out; }
  .block { width: min(92vw, 420px); border: 2px solid var(--brass); border-radius: 18px; background: var(--bg-raised); color: var(--text); padding: 22px; text-align: center; }
  .block::backdrop { background: rgba(4, 20, 15, .82); backdrop-filter: blur(5px); }
  .block h2 { font-size: 1.4rem; }
  .big { font-size: 4rem; line-height: 1; margin: .1em 0; color: var(--accent); }
  .small { font-size: .85rem; }
  .warn { margin: 0 0 10px; padding: .4em .8em; border-radius: 999px; background: var(--coral); color: #fff; font-weight: 700; }
  .ok { color: var(--pos); margin: 0; font-weight: 700; }
  @keyframes drop { from { transform: translate(-50%, -30px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
</style>
