<script lang="ts">
  import type { BotLevel } from '../../core/play';
  import { games } from '../../games';
  import { canPlayInApp, getEngine } from '../../games/engines';
  import { gameUis } from '../games';
  import { ROOM_CODE_PATTERN } from '../../shared/protocol';
  import { t } from '../lib/i18n.svelte';
  import { createRoom } from '../lib/session.svelte';
  import { getItem } from '../lib/storage';

  const gameList = Object.values(games);

  let roomName = $state(t('home.roomNameDefault'));
  let gameId = $state(gameList[0]?.id ?? '');
  let playerCount = $state(4);
  let unit = $state('pts');
  let hostName = $state(getItem('tt.name') ?? '');
  let busy = $state(false);
  let error = $state('');
  let joinCode = $state('');
  let mode = $state<'score' | 'play'>('score');
  let botLevels = $state<BotLevel[]>([]);

  const counts = $derived((mode === 'play' ? getEngine(gameId)?.playerCounts : undefined) ?? games[gameId]?.playerCounts ?? [4]);
  const ui = $derived(gameUis[gameId]);
  const canPlay = $derived(canPlayInApp(gameId));
  const levels: BotLevel[] = ['easy', 'normal', 'hard'];

  // Scoring options start from the game's defaults and reset when the game or player count changes.
  let setup = $state<unknown>(undefined);
  $effect(() => {
    const g = games[gameId];
    if (g) setup = g.defaultSetup(playerCount);
  });
  $effect(() => {
    if (!counts.includes(playerCount)) playerCount = counts[counts.length - 1] ?? 4;
  });
  // Computers need play in the app, which not every game has yet, and they can never fill the host's own seat.
  $effect(() => {
    if (!canPlay && mode === 'play') mode = 'score';
    if (mode === 'score' && botLevels.length > 0) botLevels = [];
    if (botLevels.length > playerCount - 1) botLevels = botLevels.slice(0, playerCount - 1);
  });
  function setBotCount(n: number) {
    botLevels = Array.from({ length: n }, (_, i) => botLevels[i] ?? 'normal');
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    const res = await createRoom({ name: roomName, gameId, playerCount, unit, hostName, setup, mode, bots: botLevels });
    busy = false;
    if (res.ok) location.hash = `#/r/${res.code}`;
    else error = t(`error.${res.code}`) !== `error.${res.code}` ? t(`error.${res.code}`) : res.message || t('error.generic');
  }

  const normalizedJoin = $derived(joinCode.trim().toUpperCase());
  const joinOk = $derived(ROOM_CODE_PATTERN.test(normalizedJoin));
  function join(e: SubmitEvent) {
    e.preventDefault();
    if (joinOk) location.hash = `#/r/${normalizedJoin}`;
  }
</script>

<header class="hero">
  <img src="/brand/logo-lockup.jpg" alt="TableTally" width="260" height="260" />
  <p class="dim">{t('app.tagline')}</p>
</header>

<form class="card" onsubmit={create}>
  <h2>{t('home.create')}</h2>

  <label for="room-name">{t('home.roomName')}</label>
  <input id="room-name" bind:value={roomName} maxlength="40" required />

  <label for="game">{t('home.game')}</label>
  <select id="game" bind:value={gameId}>
    {#each gameList as g (g.id)}<option value={g.id}>{t(`game.${g.id}`)}</option>{/each}
  </select>

  <div class="row">
    <div class="grow">
      <label for="count">{t('home.players')}</label>
      <select id="count" bind:value={playerCount}>
        {#each counts as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </div>
    <div class="grow">
      <label for="unit">{t('home.unit')}</label>
      <input id="unit" bind:value={unit} maxlength="12" list="unit-list" required />
      <datalist id="unit-list">
        {#each ['pts', 'PHP', 'USD', 'JPY', 'TWD', 'KRW', 'EUR', 'SGD', 'AUD', 'CAD', 'GBP', 'AED', 'SAR'] as u (u)}<option value={u}></option>{/each}
      </datalist>
    </div>
  </div>

  {#if canPlay}
    <fieldset class="opts">
      <legend>{t('home.how')}</legend>
      <label class="choice" class:on={mode === 'score'}>
        <input type="radio" name="mode" value="score" checked={mode === 'score'} onchange={() => (mode = 'score')} />
        <span><strong>{t('home.how.score')}</strong><small class="dim">{t('home.how.score.help')}</small></span>
      </label>
      <label class="choice" class:on={mode === 'play'}>
        <input type="radio" name="mode" value="play" checked={mode === 'play'} onchange={() => (mode = 'play')} />
        <span><strong>{t('home.how.play')}</strong><small class="dim">{t('home.how.play.help')}</small></span>
      </label>
      {#if mode === 'play'}
        <label for="bot-count">{t('home.bots')}</label>
        <div class="row">
          <select id="bot-count" value={String(botLevels.length)} onchange={(e) => setBotCount(Number.parseInt(e.currentTarget.value, 10))}>
            {#each Array.from({ length: playerCount }, (_, i) => i) as n (n)}<option value={String(n)}>{n}</option>{/each}
          </select>
          <button type="button" class="ghost" onclick={() => setBotCount(playerCount - 1)}>{t('home.bots.solo')}</button>
        </div>
        {#each botLevels as level, i (i)}
          <label for="bot-{i}">{t('home.bots.level', { n: i + 1 })}</label>
          <select id="bot-{i}" value={level} onchange={(e) => (botLevels[i] = e.currentTarget.value as BotLevel)}>
            {#each levels as l (l)}<option value={l}>{t(`level.${l}`)}</option>{/each}
          </select>
        {/each}
      {/if}
    </fieldset>
  {/if}

  {#if ui && setup}
    <fieldset class="opts">
      <legend>{t('home.options')}</legend>
      <ui.Setup {setup} {playerCount} onchange={(next: unknown) => (setup = next)} />
    </fieldset>
  {/if}

  <label for="host-name">{t('home.yourName')}</label>
  <input id="host-name" bind:value={hostName} maxlength="24" autocomplete="nickname" required />

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button type="submit" class="primary" style="width: 100%; margin-top: 16px" disabled={busy}>
    {busy ? t('home.creating') : t('home.createBtn')}
  </button>
</form>

<form class="card" onsubmit={join}>
  <h2>{t('home.join')}</h2>
  <label for="code">{t('home.code')}</label>
  <div class="row">
    <input id="code" bind:value={joinCode} maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" class="code" />
    <button type="submit" class="primary" disabled={!joinOk}>{t('home.go')}</button>
  </div>
</form>

<style>
  .hero { text-align: center; margin: 14px 0 6px; }
  .hero img { width: min(64vw, 260px); height: auto; border-radius: 22px; }
  .hero p { margin: 8px 0 0; font-family: var(--font-display); font-size: 1.1rem; }
  .opts { border: 1px solid var(--line); border-radius: 12px; margin: 16px 0 0; padding: 4px 14px 14px; }
  .opts legend { font-size: .85rem; color: var(--text-dim); padding: 0 6px; }
  .choice { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; margin: 6px 0; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; color: var(--text); font-size: 1rem; }
  .choice.on { background: color-mix(in srgb, var(--brass) 16%, transparent); border-color: var(--brass); }
  .choice input { width: auto; min-height: 0; margin-top: 4px; }
  .choice small { display: block; }
  .code { text-transform: uppercase; letter-spacing: .3em; font-family: var(--font-display); font-size: 1.3rem; }
</style>
