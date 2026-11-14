<script lang="ts">
  import { onDestroy } from 'svelte';
  import { gameUis } from '../games';
  import type { RoomView } from '../../shared/protocol';
  import { t } from '../lib/i18n.svelte';
  import { send, session } from '../lib/session.svelte';
  import { getItem, setItem } from '../lib/storage';

  let { room, isHost }: { room: RoomView; isHost: boolean } = $props();

  const gameUi = $derived(gameUis[room.gameId]);
  const play = $derived(session.play);
  const over = $derived(play !== null && play.toAct === null);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? id;

  // svelte-ignore state_referenced_locally
  const saved = Number.parseInt(getItem(`tt.stake.${room.gameId}`) ?? '', 10);
  // svelte-ignore state_referenced_locally
  let stakeText = $state(String(Number.isSafeInteger(saved) && saved > 0 ? saved : room.gameId === 'tong-its' ? 10 : 50));
  let turnSeconds = $state(Number.parseInt(getItem('tt.turnSeconds') ?? '0', 10) || 0);
  const stake = $derived(/^\d{1,8}$/.test(stakeText) ? Number.parseInt(stakeText, 10) : 0);

  function deal() {
    if (stake < 1) return;
    setItem(`tt.stake.${room.gameId}`, String(stake));
    setItem('tt.turnSeconds', String(turnSeconds));
    send({ t: 'deal', stake, turnSeconds });
  }

  // Countdown for a turn that has a time limit. Only ticks while one is running.
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(ticker);
    if (play?.turnEndsAt) {
      now = Date.now();
      ticker = setInterval(() => (now = Date.now()), 500);
    }
    return () => clearInterval(ticker);
  });
  onDestroy(() => clearInterval(ticker));
  const secondsLeft = $derived(play?.turnEndsAt ? Math.max(0, Math.ceil((play.turnEndsAt - (now + session.clockOffset)) / 1000)) : null);
  const clock = $derived(secondsLeft === null ? '' : secondsLeft >= 60 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : `${secondsLeft}s`);
</script>

<div class="pt">
  {#if secondsLeft !== null && !over}<span class="timer" class:low={secondsLeft <= 5} aria-label={clock}>{clock}</span>{/if}
  {#if play?.unscored}<p class="error" role="alert">{t('play.unscored')}</p>{/if}
  {#if play && gameUi?.Play}
    <gameUi.Play view={play.view} {nameOf} onmove={(move: unknown) => send({ t: 'move', move })} />
  {/if}

  {#if isHost && (!play || over)}
    <div class="deal" class:one={room.gameId === 'poker'}>
      {#if room.gameId !== 'poker'}
        <label class="f"><span class="dim">{t(room.gameId === 'tong-its' ? 'tong.stake' : 'play.stake')}</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" bind:value={stakeText} />
        </label>
      {/if}
      <label class="f"><span class="dim">{t('play.turnTime')}</span>
        <select bind:value={turnSeconds}>
          {#each [0, 20, 30, 60] as s (s)}<option value={s}>{s === 0 ? t('play.turnTime.0') : t('play.turnTime.s', { n: s })}</option>{/each}
        </select>
      </label>
      <button type="button" class="primary" disabled={stake < 1} onclick={deal}>{t(play ? 'play.dealNext' : 'play.deal')}</button>
    </div>
  {:else if !play}
    <p class="dim wait">{t('play.waitDeal')}</p>
  {/if}
</div>

<style>
  .pt { position: relative; display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 0 1 auto; max-height: 100%; }
  .deal { flex: none; }
  .timer { position: absolute; right: 0; top: -22px; font-family: var(--font-display); font-size: .85rem; color: var(--text-dim); }
  .timer.low { color: var(--coral, #ff9a78); }
  .deal { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; align-items: end; }
  .deal.one { grid-template-columns: 1fr; }
  .deal button { grid-column: 1 / -1; }
  .f { display: flex; flex-direction: column; gap: 2px; font-size: .75rem; }
  .f input, .f select { min-height: 38px; }
  .wait { margin: 0; text-align: center; }
</style>
