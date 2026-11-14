<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getEngine } from '../../games/engines';
  import { gameUis } from '../games';
  import { clearBanners, pushBanners } from '../lib/banners.svelte';
  import { celebrateRound } from '../lib/effects.svelte';
  import { t } from '../lib/i18n.svelte';
  import { leaveRoomIfCurrent, openRoom, roomGeneration, send, session, sitDown } from '../lib/session.svelte';
  import { getItem } from '../lib/storage';
  import HostKey from './HostKey.svelte';
  import History from './History.svelte';
  import Invite from './Invite.svelte';
  import PlayScreen from './PlayScreen.svelte';
  import Banners from './Banners.svelte';
  import Reactions from './Reactions.svelte';
  import Seats from './Seats.svelte';

  let { code }: { code: string } = $props();

  let myGeneration = 0;
  onMount(() => {
    openRoom(code);
    myGeneration = roomGeneration();
  });
  onDestroy(() => {
    clearBanners();
    // Clear the session AFTER this page has finished tearing down: its children read `session.room` while they
    // unmount, and a null room there throws. Never clear a room opened in the meantime.
    const mine = myGeneration;
    setTimeout(() => leaveRoomIfCurrent(mine), 0);
  });

  // Celebrate when a hand is recorded (not on first load, a void or a restore).
  let seenRounds: number | null = null;
  $effect(() => {
    const r = session.room;
    if (!r) return;
    const n = r.rounds.length;
    if (seenRounds !== null && n === seenRounds + 1 && r.history.at(-1)?.action === 'add') {
      const last = r.rounds[n - 1];
      const winner = last ? gameUis[r.gameId]?.winnerOf(last, r.setup) ?? null : null;
      celebrateRound(winner !== null && winner === session.you?.playerId);
      const nameOf = (id: string) => r.players.find((p) => p.id === id)?.name ?? id;
      if (last) pushBanners(gameUis[r.gameId]?.banners(last, r.setup, nameOf, t) ?? []);
    }
    seenRounds = n;
  });

  const room = $derived(session.room);
  const isHost = $derived(session.you?.isHost ?? false);
  const full = $derived(room ? room.players.length >= room.playerCount : false);
  const gameUi = $derived(room ? gameUis[room.gameId] : undefined);
  const live = $derived(session.status === 'live');
  const errorText = $derived(session.error ? t(`error.${session.error.code}`) !== `error.${session.error.code}` ? t(`error.${session.error.code}`) : session.error.message || t('error.generic') : '');

  let joinName = $state(getItem('tt.name') ?? '');
  let keyText = $state('');
  const keyOk = $derived(/^[A-Z2-9]{12}$/.test(keyText.replace(/[\s-]/g, '').toUpperCase()));
  const reclaim = () => send({ t: 'reclaim', key: keyText.replace(/[\s-]/g, '').toUpperCase() });
  const handRunning = $derived(session.play !== null && session.play.toAct !== null);
  const levels = ['easy', 'normal', 'hard'] as const;
  // Hands that start from the last hand's chips (poker) cannot be voided.
  const linked = $derived(room !== null && getEngine(room.gameId)?.linkedHands === true);

  const expiry = $derived(
    room ? new Date(room.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '',
  );
</script>

<Banners />

{#if session.status === 'closed'}
  <section class="card">
    <h1>{t('room.status.closed')}</h1>
    <p>{t('room.expired')}</p>
    <a class="btn primary" href="#/">{t('room.home')}</a>
  </section>
{:else if !room && session.lobby}
  {@const lobby = session.lobby}
  <section class="card">
    <h1>{lobby.name}</h1>
    <p class="dim">{t(`game.${lobby.gameId}`)} · {t('room.seats', { n: lobby.seated, total: lobby.playerCount })}</p>
    {#if lobby.status === 'open'}
      {@render nameForm()}
      {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
    {:else}
      <p class="error" role="status">{t(lobby.status === 'full' ? 'lobby.full' : 'lobby.started')}</p>
      {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
      <a class="btn" href="#/">{t('room.home')}</a>
    {/if}
    <details class="hostback">
      <summary>{t('lobby.imHost')}</summary>
      <p class="dim note">{t('lobby.imHost.help')}</p>
      <label for="host-key">{t('room.hostKey')}</label>
      <div class="row">
        <input id="host-key" bind:value={keyText} maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false" />
        <button type="button" class="primary nowrap" disabled={!keyOk || !live} onclick={reclaim}>{t('lobby.reclaim')}</button>
      </div>
    </details>
  </section>
{:else if !room}
  <section class="card">
    <h1 class="sr-only">{t('app.name')}</h1>
    <p>{t(session.status === 'reconnecting' ? 'room.status.reconnecting' : 'room.status.connecting')}</p>
    {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
  </section>
{:else if full}
  <PlayScreen {room} {isHost}>
    {#snippet menu()}
      {@render botsCard()}
      {@render optionsCard()}
      {#if isHost}<HostKey code={room.code} />{/if}
      {@render rulesCard()}
      <History {room} canVoid={isHost && !linked && !handRunning} />
      {@render keepCard()}
    {/snippet}
  </PlayScreen>
{:else}
  <header class="head">
    <div class="grow">
      <h1>{room.name}</h1>
      <span class="dim">{t(`game.${room.gameId}`)} · {room.code}</span>
    </div>
    <span class="status" class:live>{t(`room.status.${live ? 'live' : 'reconnecting'}`)}</span>
  </header>

  {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}

  <Seats {room} youId={session.you?.playerId ?? null}>
    {#snippet center()}{#if gameUi?.Status}<gameUi.Status {room} />{/if}{/snippet}
  </Seats>
  {#if session.you?.playerId}<Reactions />{/if}

  {#if isHost}
    <Invite code={room.code} seated={room.players.length} total={room.playerCount} />
    <HostKey code={room.code} />
  {:else}
    <p class="dim center">{t('room.waitingFor', { n: room.playerCount - room.players.length })}</p>
  {/if}
  {@render botsCard()}
  {@render optionsCard()}
  {@render rulesCard()}
  {@render keepCard()}
{/if}

{#snippet botsCard()}
  {#if room && isHost && room.history.length === 0 && session.play === null}
    <section class="card">
      <h2>{t('room.seatsTitle')}</h2>
      {#if !full}
        <div class="row wrap">
          {#each levels as l (l)}<button type="button" disabled={!live} onclick={() => send({ t: 'addBot', level: l })}>{t(`level.${l}`)}</button>{/each}
        </div>
      {/if}
      {#each room.players.filter((p) => p.id !== session.you?.playerId) as p (p.id)}
        <div class="row item">
          <span class="grow">{p.name}{#if p.bot} · {t(`level.${p.bot}`)}{/if}</span>
          {#if !p.bot}<button type="button" class="ghost" disabled={!live} onclick={() => send({ t: 'makeHost', playerId: p.id })}>{t('room.makeHost')}</button>{/if}
          <button type="button" class="ghost" disabled={!live} onclick={() => send(p.bot ? { t: 'removeBot', playerId: p.id } : { t: 'removePlayer', playerId: p.id })}>{t('room.removeBot')}</button>
        </div>
      {/each}
    </section>
  {/if}
{/snippet}

{#snippet optionsCard()}
  {#if room && isHost && room.history.length === 0 && gameUi && !handRunning}
    <section class="card">
      <h2>{t('room.options')}</h2>
      <p class="dim note">{t('room.optionsNote')}</p>
      <gameUi.Setup setup={room.setup} playerCount={room.playerCount} onchange={(next: unknown) => send({ t: 'setup', setup: next })} />
    </section>
  {/if}
{/snippet}

{#snippet rulesCard()}
  {#if room && gameUi}
    <details class="card rules">
      <summary>{t('room.rules')}</summary>
      <ul>{#each gameUi.rules(room.setup, t) as line (line)}<li>{line}</li>{/each}</ul>
    </details>
  {/if}
{/snippet}

{#snippet keepCard()}
  {#if room}
    <section class="card">
      {#if isHost}
        <button type="button" class="ghost" disabled={room.keepDays === 30 || !live} onclick={() => send({ t: 'keep', days: 30 })}>
          {room.keepDays === 30 ? t('room.keepOn') : t('room.keep')}
        </button>
      {/if}
      <p class="dim note-end">{t('room.expires', { when: expiry })}</p>
    </section>
  {/if}
{/snippet}

{#snippet nameForm()}
  <label for="join-name">{t('home.yourName')}</label>
  <div class="row">
    <input id="join-name" bind:value={joinName} maxlength="24" autocomplete="nickname" onkeydown={(e) => e.key === 'Enter' && joinName.trim() && sitDown(joinName)} />
    <button type="button" class="primary nowrap" disabled={joinName.trim() === '' || !live} onclick={() => sitDown(joinName)}>{t('room.joinBtn')}</button>
  </div>
{/snippet}

<style>
  .head { display: flex; align-items: flex-start; gap: 12px; margin-top: 8px; }
  .head h1 { margin: 0; }
  .status { font-size: .8rem; padding: .25em .7em; border: 1px solid var(--line); border-radius: 999px; color: var(--text-dim); white-space: nowrap; }
  .status.live { color: var(--pos); border-color: var(--pos); }
  .rules summary { cursor: pointer; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent); min-height: 44px; display: flex; align-items: center; }
  .rules ul { margin: 10px 0 0; padding-left: 1.2em; }
  .rules li { margin: .35em 0; }
  .wrap { flex-wrap: wrap; }
  .item { margin-top: 8px; align-items: center; }
  .note { margin-top: 0; }
  .note-end { margin-bottom: 0; }
  .center { text-align: center; }
  .nowrap { white-space: nowrap; }
  .hostback { margin-top: 14px; }
  .hostback summary { cursor: pointer; color: var(--accent); min-height: 44px; display: flex; align-items: center; }
</style>
