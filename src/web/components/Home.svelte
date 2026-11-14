<script lang="ts">
  import type { BotLevel } from '../../core/play';
  import { games } from '../../games';
  import { getEngine } from '../../games/engines';
  import { gameUis } from '../games';
  import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '../../shared/protocol';
  import { t } from '../lib/i18n.svelte';
  import { createRoom } from '../lib/session.svelte';
  import { canPersist, getItem } from '../lib/storage';

  const gameList = Object.values(games);
  const persists = canPersist();

  let roomName = $state(t('home.roomNameDefault'));
  let gameId = $state(gameList[0]?.id ?? '');
  let playerCount = $state(4);
  let unit = $state('pts');
  let hostName = $state(getItem('tt.name') ?? '');
  let busy = $state(false);
  let error = $state('');
  let joinCode = $state('');
  let botLevels = $state<BotLevel[]>([]);

  const counts = $derived(getEngine(gameId)?.playerCounts ?? games[gameId]?.playerCounts ?? [4]);
  const ui = $derived(gameUis[gameId]);
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
  // Computers can never fill the host's own seat.
  $effect(() => {
    if (botLevels.length > playerCount - 1) botLevels = botLevels.slice(0, playerCount - 1);
  });
  function setBotCount(n: number) {
    botLevels = Array.from({ length: n }, (_, i) => botLevels[i] ?? 'normal');
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    const res = await createRoom({ name: roomName, gameId, playerCount, unit, hostName, setup, bots: botLevels });
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
  <h1><img src="/brand/logo-lockup.webp" alt="TableTally" width="260" height="260" /></h1>
  <p class="dim">{t('app.tagline')}</p>
</header>

<form class="card" onsubmit={join}>
  <h2>{t('home.join')}</h2>
  <label for="code">{t('home.code')}</label>
  <div class="row">
    <input id="code" bind:value={joinCode} maxlength={ROOM_CODE_LENGTH} autocapitalize="characters" autocomplete="off" spellcheck="false" class="code" />
    <button type="submit" class="primary" disabled={!joinOk}>{t('home.go')}</button>
  </div>
</form>

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

  <fieldset class="opts">
    <legend>{t('home.bots')}</legend>
    <div class="row">
      <select id="bot-count" aria-label={t('home.bots')} value={String(botLevels.length)} onchange={(e) => setBotCount(Number.parseInt(e.currentTarget.value, 10))}>
        {#each Array.from({ length: playerCount }, (_, i) => i) as n (n)}<option value={String(n)}>{n}</option>{/each}
      </select>
      <button type="button" class="ghost" onclick={() => setBotCount(playerCount - 1)}>{t('home.bots.solo')}</button>
    </div>
    <p class="dim small">{t('home.bots.help')}</p>
    {#each botLevels as level, i (i)}
      <label for="bot-{i}">{t('home.bots.level', { n: i + 1 })}</label>
      <select id="bot-{i}" value={level} onchange={(e) => (botLevels[i] = e.currentTarget.value as BotLevel)}>
        {#each levels as l (l)}<option value={l}>{t(`level.${l}`)}</option>{/each}
      </select>
    {/each}
  </fieldset>

  {#if ui && setup}
    <fieldset class="opts">
      <legend>{t('home.options')}</legend>
      <ui.Setup {setup} {playerCount} onchange={(next: unknown) => (setup = next)} />
    </fieldset>
  {/if}

  <label for="host-name">{t('home.yourName')}</label>
  <input id="host-name" bind:value={hostName} maxlength="24" autocomplete="nickname" required />

  {#if !persists}<p class="warn" role="note">{t('home.noStorage')}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button type="submit" class="primary wide" disabled={busy}>
    {busy ? t('home.creating') : t('home.createBtn')}
  </button>
</form>



<style>
  .hero { text-align: center; margin: 14px 0 6px; }
  .hero h1 { margin: 0; line-height: 0; }
  .hero img { width: min(64vw, 260px); height: auto; border-radius: 22px; }
  .hero p { margin: 8px 0 0; font-family: var(--font-display); font-size: 1.1rem; }
  .opts { border: 1px solid var(--line); border-radius: 12px; margin: 16px 0 0; padding: 4px 14px 14px; }
  .opts legend { font-size: .85rem; color: var(--text-dim); padding: 0 6px; }
  .small { margin: 6px 0 0; font-size: .85rem; }
  .warn { margin: 14px 0 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--neg); font-size: .9rem; }
  .code { text-transform: uppercase; letter-spacing: .3em; font-family: var(--font-display); font-size: 1.3rem; }
</style>
