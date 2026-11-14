<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getEngine } from '../../games/engines';
  import { gameUis } from '../games';
  import { clearBanners, pushBanners } from '../lib/banners.svelte';
  import { celebrateRound } from '../lib/effects.svelte';
  import { t } from '../lib/i18n.svelte';
  import { leaveRoomIfCurrent, openRoom, roomGeneration, send, session, sitDown } from '../lib/session.svelte';
  import { getItem } from '../lib/storage';
  import History from './History.svelte';
  import Invite from './Invite.svelte';
  import PlayScreen from './PlayScreen.svelte';
  import Banners from './Banners.svelte';
  import Reactions from './Reactions.svelte';
  import Seats from './Seats.svelte';
  import TurnClock from './TurnClock.svelte';

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

  // Celebrate when a new round arrives (not on first load, edits or undo).
  let seenRounds: number | null = null;
  $effect(() => {
    const r = session.room;
    if (!r) return;
    const n = r.rounds.length;
    if (seenRounds !== null && n === seenRounds + 1) {
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
  const seated = $derived(session.you?.playerId != null);
  const full = $derived(room ? room.players.length >= room.playerCount : false);
  const gameUi = $derived(room ? gameUis[room.gameId] : undefined);
  const errorText = $derived(session.error ? t(`error.${session.error.code}`) !== `error.${session.error.code}` ? t(`error.${session.error.code}`) : session.error.message : '');

  let joinName = $state(getItem('tt.name') ?? '');
  let handName = $state('');
  const playMode = $derived(room?.mode === 'play');
  const handRunning = $derived(playMode && session.play !== null && session.play.toAct !== null);
  const levels = ['easy', 'normal', 'hard'] as const;
  // Hands that start from the last hand's chips (poker) cannot be undone or edited.
  const linked = $derived(playMode && room !== null && getEngine(room.gameId)?.linkedHands === true);

  const expiry = $derived(
    room ? new Date(room.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '',
  );

  function addByHand() {
    if (handName.trim() === '') return;
    send({ t: 'addPlayer', name: handName });
    handName = '';
  }
</script>

<Banners />

{#if session.status === 'closed'}
  <section class="card">
    <h2>{t('room.status.closed')}</h2>
    <p>{t('room.expired')}</p>
    <a href="#/"><button type="button" class="primary">{t('room.home')}</button></a>
  </section>
{:else if !room}
  <section class="card">
    <p>{t(session.status === 'reconnecting' ? 'room.status.reconnecting' : 'room.status.connecting')}</p>
    {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
    {#if session.needsName}{@render nameForm()}{/if}
  </section>
{:else if playMode && full}
  <PlayScreen {room} {isHost}>
    {#snippet menu()}
      {@render botsCard()}
      {@render optionsCard()}
      {@render rulesCard()}
      <History {room} isHost={isHost && !linked} />
      {@render keepCard()}
    {/snippet}
  </PlayScreen>
{:else}
  <header class="head">
    <div class="grow">
      <h1>{room.name}</h1>
      <span class="dim">{t(`game.${room.gameId}`)} · {room.code}</span>
    </div>
    <span class="status" class:live={session.status === 'live'}>{t(`room.status.${session.status === 'live' ? 'live' : 'reconnecting'}`)}</span>
  </header>

  {#if errorText}<p class="error" role="alert">{errorText}</p>{/if}

  {#if !seated}
    <section class="card">
      <h2>{t('room.joinTitle')}</h2>
      {#if full}<p class="error">{t('error.room_full')}</p>{:else}{@render nameForm()}{/if}
    </section>
  {/if}

  <Seats {room} youId={session.you?.playerId ?? null}>
    {#snippet center()}{#if gameUi?.Status}<gameUi.Status {room} />{/if}{/snippet}
  </Seats>
  {#if seated}<Reactions />{/if}

  {#if isHost && !full}
    <Invite code={room.code} seated={room.players.length} total={room.playerCount} />
    {#if !playMode}
      <section class="card">
        <label for="hand-name">{t('room.addByHand')}</label>
        <div class="row">
          <input id="hand-name" bind:value={handName} maxlength="24" onkeydown={(e) => e.key === 'Enter' && addByHand()} />
          <button type="button" onclick={addByHand}>{t('room.add')}</button>
        </div>
      </section>
    {/if}
  {/if}
  {@render botsCard()}

  {#if !playMode}<TurnClock {room} youId={session.you?.playerId ?? null} {isHost} />{/if}

  {#if seated && gameUi?.HandHelper && !playMode}
    <gameUi.HandHelper code={room.code} setup={room.setup} />
  {/if}

  {@render optionsCard()}

  {#if isHost && full && gameUi}
    <section class="card">
      <h2>{t('entry.save')}</h2>
      <gameUi.Entry
        setup={room.setup}
        rounds={room.rounds}
        players={room.players.map((p) => ({ id: p.id, name: p.name }))}
        onsave={(input: unknown) => send({ t: 'addRound', input })}
      />
    </section>
  {:else if !isHost && seated && !playMode}
    <p class="dim">{t('room.hostOnly')}</p>
  {/if}

  {@render rulesCard()}

  <History {room} {isHost} />

  {@render keepCard()}
{/if}

{#snippet botsCard()}
  {#if room && isHost && playMode && room.history.length === 0 && session.play === null}
    <section class="card">
      <h2>{t('room.addBot')}</h2>
      {#if !full}
        <div class="row" style="flex-wrap: wrap">
          {#each levels as l (l)}<button type="button" onclick={() => send({ t: 'addBot', level: l })}>{t(`level.${l}`)}</button>{/each}
        </div>
      {/if}
      {#each room.players.filter((p) => p.bot) as b (b.id)}
        <div class="row" style="margin-top: 8px; align-items: center">
          <span class="grow">{b.name} · {t(`level.${b.bot ?? 'normal'}`)}</span>
          <button type="button" class="ghost" onclick={() => send({ t: 'removeBot', playerId: b.id })}>{t('room.removeBot')}</button>
        </div>
      {/each}
    </section>
  {/if}
{/snippet}

{#snippet optionsCard()}
  {#if room && isHost && room.history.length === 0 && gameUi && !handRunning}
    <section class="card">
      <h2>{t('room.options')}</h2>
      <p class="dim" style="margin-top: 0">{t('room.optionsNote')}</p>
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
        <button type="button" class="ghost" disabled={room.keepDays === 30} onclick={() => send({ t: 'keep', days: 30 })}>
          {room.keepDays === 30 ? t('room.keepOn') : t('room.keep')}
        </button>
      {/if}
      <p class="dim" style="margin-bottom: 0">{t('room.expires', { when: expiry })}</p>
    </section>
  {/if}
{/snippet}

{#snippet nameForm()}
  <label for="join-name">{t('home.yourName')}</label>
  <div class="row">
    <input id="join-name" bind:value={joinName} maxlength="24" autocomplete="nickname" onkeydown={(e) => e.key === 'Enter' && joinName.trim() && sitDown(joinName)} />
    <button type="button" class="primary" disabled={joinName.trim() === ''} onclick={() => sitDown(joinName)}>{t('room.joinBtn')}</button>
  </div>
{/snippet}

<style>
  .head { display: flex; align-items: flex-start; gap: 12px; margin-top: 8px; }
  .status { font-size: .8rem; padding: .25em .7em; border: 1px solid var(--line); border-radius: 999px; color: var(--text-dim); white-space: nowrap; }
  .status.live { color: var(--pos); border-color: var(--pos); }
  a { text-decoration: none; }
  .rules summary { cursor: pointer; font-family: var(--font-display); font-size: 1.15rem; color: var(--accent); }
  .rules ul { margin: 10px 0 0; padding-left: 1.2em; }
  .rules li { margin: .35em 0; }
</style>
