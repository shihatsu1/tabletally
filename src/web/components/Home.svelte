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
  <h1>Gather around the table</h1>
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

  <fieldset class="game-picker"><legend>{t('home.game')}</legend><div class="game-grid">
    {#each gameList as g (g.id)}<button type="button" class="game-choice" aria-pressed={gameId === g.id} onclick={() => (gameId = g.id)}><img src={`/brand/${g.id}.webp`} alt="" /><span>{t(`game.${g.id}`)}</span></button>{/each}
  </div></fieldset>

  <div class="row">
    <div class="grow">
      <fieldset class="opts"><legend>{t('home.players')}</legend><div class="row">
        {#each counts as c (c)}<button type="button" class="ghost" aria-pressed={playerCount === c} onclick={() => (playerCount = c)}>{c}</button>{/each}
      </div></fieldset>
    </div>
    <div class="grow">
      <label for="unit">{t('home.unit')}</label>
      <input id="unit" bind:value={unit} maxlength="12" required />

    </div>
  </div>

  <fieldset class="opts">
    <legend>{t('home.bots')}</legend>
    <div class="row">
      {#each Array.from({ length: playerCount }, (_, i) => i) as n (n)}<button type="button" class="ghost" aria-label={`${t('home.bots')}: ${n}`} aria-pressed={botLevels.length === n} onclick={() => setBotCount(n)}>{n}</button>{/each}
      <button type="button" class="ghost" onclick={() => setBotCount(playerCount - 1)}>{t('home.bots.solo')}</button>
    </div>
    <p class="dim small">{t('home.bots.help')}</p>
    {#each botLevels as level, i (i)}
      <fieldset class="opts"><legend>{t('home.bots.level', { n: i + 1 })}</legend><div class="row">
        {#each levels as l (l)}<button type="button" class="ghost" aria-pressed={level === l} onclick={() => (botLevels[i] = l)}>{t(`level.${l}`)}</button>{/each}
      </div></fieldset>
    {/each}
  </fieldset>

  {#if ui && setup}
    <details class="opts"><summary>{t('home.options')}</summary>
      <ui.Setup {setup} {playerCount} onchange={(next: unknown) => (setup = next)} />
    </details>
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
  .game-picker { border: 0; padding: 0; margin: 20px 0; min-width: 0; }
  .game-picker legend { font-family: var(--font-display); font-size: var(--step-1); color: var(--accent); margin-bottom: 10px; }
  .game-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .game-choice { padding: 0; overflow: hidden; text-align: left; background: var(--bg-deep); border: 2px solid var(--line); }
  .game-choice[aria-pressed='true'] { border-color: var(--brass-soft); box-shadow: 0 0 0 2px var(--brass); }
  .game-choice img { display: block; width: 100%; aspect-ratio: 1.5; object-fit: cover; }
  .game-choice span { display: block; padding: 8px 10px; font-family: var(--font-display); }
  summary { cursor: pointer; padding: 8px 0; }
  .hero { text-align: center; margin: 14px 0 6px; }
  .hero h1 { margin: 0; line-height: 1.1; }
  .hero p { margin: 10px auto 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-weight: 500; font-style: normal; font-size: var(--step-1); line-height: 1.3; max-width: 26ch; color: var(--text); }
  .opts { border: 1px solid var(--line); border-radius: 12px; margin: 16px 0 0; padding: 4px 14px 14px; }
  .opts legend { font-size: .85rem; color: var(--text-dim); padding: 0 6px; }
  .small { margin: 6px 0 0; font-size: .85rem; }
  .warn { margin: 14px 0 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--neg); font-size: .9rem; }
  .code { text-transform: uppercase; letter-spacing: .28em; font-family: var(--font-display); font-weight: 700; font-variant-numeric: lining-nums; font-size: var(--step-1); }
</style>
