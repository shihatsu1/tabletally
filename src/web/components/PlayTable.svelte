<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
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
  const stakeCfg = gameUis[room.gameId]?.stake;
  // svelte-ignore state_referenced_locally
  const saved = Number.parseInt(getItem(`tt.stake.${room.gameId}`) ?? '', 10);
  let stakeText = $state(String(Number.isSafeInteger(saved) && saved > 0 ? saved : stakeCfg?.start ?? 1));
  /** Time per turn: 30/45/60 seconds for one move, or the game's own choices (Pusoy sets a whole hand: 1-3 minutes). */
  // svelte-ignore state_referenced_locally
  const TURN_CHOICES: readonly number[] = [0, ...(gameUis[room.gameId]?.turnChoices ?? [30, 45, 60])];
  // svelte-ignore state_referenced_locally
  const inMinutes = gameUis[room.gameId]?.turnChoices !== undefined;
  // svelte-ignore state_referenced_locally
  const turnKey = `tt.turnSeconds.${room.gameId}`;
  const savedTurn = Number.parseInt(getItem(turnKey) ?? '0', 10);
  let turnSeconds = $state<number>(TURN_CHOICES.includes(savedTurn) ? savedTurn : 0);
  // Stakeless games (poker) still send a stake of 1; the server ignores it.
  const stake = $derived(!stakeCfg ? 1 : /^\d{1,8}$/.test(stakeText) ? Number.parseInt(stakeText, 10) : 0);

  function deal() {
    if (stake < 1) return;
    if (stakeCfg) setItem(`tt.stake.${room.gameId}`, String(stake));
    setItem(turnKey, String(turnSeconds));
    send({ t: 'deal', stake, turnSeconds });
  }

  // Keep the last finished hand so anyone can look at it again once the next one is dealt.
  let lastDone = $state<{ handNo: number; view: unknown; stake: number } | null>(null);
  let showLast = $state(false);
  $effect(() => {
    if (play && over && lastDone?.handNo !== play.handNo) lastDone = { handNo: play.handNo, view: play.view, stake: play.stake };
  });
  const canShowLast = $derived(lastDone !== null && play !== null && !over && lastDone.handNo !== play.handNo);

  // Countdown for a turn that has a time limit. Only ticks while one is running.
  let now = $state(Date.now());
  const deadline = $derived(play?.turnEndsAt ?? null);
  let visibleTurnMs = $state(1);
  let ticker: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(ticker);
    if (deadline !== null) {
      now = Date.now();
      // Start a fresh ring for each deadline, including when joining mid-turn.
      visibleTurnMs = Math.max(1, deadline - (Date.now() + untrack(() => session.clockOffset)));
      ticker = setInterval(() => (now = Date.now()), 100);
    }
    return () => clearInterval(ticker);
  });
  onDestroy(() => clearInterval(ticker));
  const remainingMs = $derived(deadline === null ? null : Math.max(0, deadline - (now + session.clockOffset)));
  const secondsLeft = $derived(remainingMs === null ? null : Math.ceil(remainingMs / 1000));
  const ringOffset = $derived(100 * (1 - Math.min(1, (remainingMs ?? 0) / visibleTurnMs)));
  const clock = $derived(secondsLeft === null ? '' : secondsLeft >= 60 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` : `${secondsLeft}s`);
  const urgency = $derived(secondsLeft === null ? '' : secondsLeft <= 10 ? 'low' : secondsLeft <= 30 ? 'warn' : '');
</script>

<div class="pt">
  {#if secondsLeft !== null && !over}
    <div class="timer {urgency}" role="timer" aria-label={t('play.timeLeft', { t: clock })}>
      {#key deadline}
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle class="timer-track" cx="32" cy="32" r="28" />
          <circle class="timer-ring" cx="32" cy="32" r="28" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset={ringOffset} />
        </svg>
      {/key}
      <span class="timer-number" aria-hidden="true">{clock}</span>
    </div>
  {/if}
  {#if canShowLast}<button type="button" class="ghost last" aria-expanded={showLast} onclick={() => (showLast = !showLast)}>{t('play.lastHand')}</button>{/if}
  {#if play?.unscored}<p class="error" role="alert">{t('play.unscored')}</p>{/if}

  {#if showLast && canShowLast && lastDone && gameUi}
    <div class="lastview" role="dialog" aria-label={t('play.lastHand')}>
      <div class="lasthead"><strong>{t('play.lastHand')}</strong><button type="button" class="ghost" onclick={() => (showLast = false)}>{t('room.closeMenu')}</button></div>
      <gameUi.Play view={lastDone.view} stake={lastDone.stake} {nameOf} {room} onmove={() => undefined} />
    </div>
  {:else if play && gameUi}
    <gameUi.Play view={play.view} stake={play.stake} {nameOf} {room} onmove={(move: unknown) => send({ t: 'move', move })} />
  {/if}

  {#if isHost && (!play || over)}
    <div class="deal" class:one={!stakeCfg}>
      <fieldset class="turns">
        <legend class="dim">{t('play.turnTime')}</legend>
        {#each TURN_CHOICES as s (s)}
          <label class="turn" class:on={turnSeconds === s}>
            <input type="radio" name="turn-time" value={s} bind:group={turnSeconds} />
            <span>{s === 0 ? t('play.turnTime.0') : inMinutes ? t('play.turnTime.m', { n: s / 60 }) : t('play.turnTime.s', { n: s })}</span>
          </label>
        {/each}
      </fieldset>
      {#if stakeCfg}
        <label class="f"><span class="dim">{t(stakeCfg.label)}</span>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" bind:value={stakeText} />
        </label>
      {/if}
      <button type="button" class="primary" disabled={stake < 1} onclick={deal}>{t(play ? 'play.dealNext' : 'play.deal')}</button>
    </div>
  {:else if !play}
    <p class="dim wait">{t('play.waitDeal')}</p>
  {:else if over}
    <p class="dim wait">{t('play.waitNext')}</p>
  {/if}
</div>

<style>
  .pt { position: relative; display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1 1 auto; max-height: 100%; }
  .timer { position: relative; align-self: center; flex: none; width: 92px; height: 92px; display: grid; place-items: center; color: var(--accent); border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--bg) 85%, transparent) 55%, transparent 72%); filter: drop-shadow(0 0 6px color-mix(in srgb, currentColor 45%, transparent)); }
  .timer svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); fill: none; stroke-width: 6; }
  .timer-track { stroke: currentColor; opacity: .2; }
  .timer-ring { stroke: currentColor; stroke-linecap: round; transition: stroke-dashoffset 100ms linear, stroke 300ms; }
  .timer-number { font-family: var(--font-display, var(--font-ui)); font-size: 1.6rem; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); }
  .timer.warn { color: var(--warn); }
  .timer.low { color: var(--neg); animation: timer-pulse 1s ease-in-out infinite; }
  .timer.low .timer-number { color: currentColor; }
  @keyframes timer-pulse { 50% { transform: scale(1.08); filter: drop-shadow(0 0 12px currentColor); } }
  @media (max-height: 700px) {
    .timer { width: 72px; height: 72px; }
    .timer-number { font-size: 1.25rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .timer.low { animation: none; }
    .timer-ring { transition: none; }
  }
  .last { position: absolute; left: 0; top: -24px; min-height: 0; padding: 2px 10px; font-size: .75rem; border-radius: 999px; z-index: 5; }
  .lastview { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; gap: 6px; background: var(--bg, #0b2f25); border-radius: 12px; }
  .lasthead { display: flex; justify-content: space-between; align-items: center; }
  .deal { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; align-items: end; }
  .deal.one { grid-template-columns: 1fr; }
  .deal.one button { grid-column: 1 / -1; }
  .turns { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0; padding: 0; border: 0; min-width: 0; }
  .turns legend { font-size: .75rem; padding: 0; margin-bottom: 2px; }
  .turn { position: relative; display: grid; place-items: center; min-height: 44px; padding: 0 4px; border: 1px solid var(--line); margin-left: -1px; font-size: .85rem; font-weight: 600; text-align: center; cursor: pointer; color: var(--text); }
  .turn:first-of-type { margin-left: 0; border-radius: 12px 0 0 12px; }
  .turn:last-of-type { border-radius: 0 12px 12px 0; }
  .turn.on { z-index: 1; background: linear-gradient(180deg, var(--brass-soft), var(--brass)); border-color: var(--brass); color: #1d1608; }
  .turn input { position: absolute; opacity: 0; inset: 0; margin: 0; width: 100%; height: 100%; min-height: 0; cursor: pointer; }
  .turn:has(input:focus-visible) { outline: 3px solid var(--brass-soft); outline-offset: 2px; z-index: 2; }
  .f { display: flex; flex-direction: column; gap: 2px; font-size: .75rem; margin: 0; }
  .f input { min-height: 44px; }
  .wait { margin: 0; text-align: center; }
</style>
