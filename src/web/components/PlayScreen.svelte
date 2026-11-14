<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import type { RoomView } from '../../shared/protocol';
  import { fx, setSound } from '../lib/effects.svelte';
  import { setLang, t, ui } from '../lib/i18n.svelte';
  import { send, session } from '../lib/session.svelte';
  import Icon from './Icon.svelte';
  import PlayTable from './PlayTable.svelte';
  import Reactions from './Reactions.svelte';
  import SeatStrip from './SeatStrip.svelte';

  interface Props {
    room: RoomView;
    isHost: boolean;
    /** Everything that is not the hand itself: history, options, rules, keep-alive. Lives behind the menu. */
    menu: Snippet;
  }
  let { room, isHost, menu }: Props = $props();

  let menuOpen = $state(false);
  let menuBtn = $state<HTMLButtonElement | undefined>();
  let closeBtn = $state<HTMLButtonElement | undefined>();
  async function openMenu() {
    menuOpen = true;
    await tick();
    closeBtn?.focus();
  }
  async function closeMenu() {
    menuOpen = false;
    await tick(); // let the background become interactive again before moving focus back
    menuBtn?.focus();
  }
  let reactOpen = $state(false);
  const youId = $derived(session.you?.playerId ?? null);

  // The hand fills the screen and the page never scrolls.
  onMount(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The page's own nav and footer are hidden behind the screen; keep them out of the tab order too.
    const behind = [...document.querySelectorAll('main > nav, main > footer')];
    behind.forEach((el) => el.setAttribute('inert', ''));
    return () => {
      document.body.style.overflow = prev;
      behind.forEach((el) => el.removeAttribute('inert'));
    };
  });

  // --- rename lives in the menu so the table stays compact
  let editing = $state<string | null>(null);
  let draft = $state('');
  const canRename = (p: RoomView['players'][number]): boolean => p.id === youId || (isHost && p.bot !== undefined);
  const live = $derived(session.status === 'live');
  function startRename(p: RoomView['players'][number]) {
    editing = p.id;
    draft = p.name;
  }
  function saveRename() {
    const target = room.players.find((p) => p.id === editing);
    if (target && draft.trim() !== '') send(target.id === youId ? { t: 'rename', name: draft } : { t: 'rename', name: draft, playerId: target.id });
    editing = null;
  }
  const errorText = $derived(session.error ? (t(`error.${session.error.code}`) !== `error.${session.error.code}` ? t(`error.${session.error.code}`) : session.error.message) : '');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && menuOpen && closeMenu()} />
<div class="backdrop"></div>
<div class="screen">
  <div class="base" inert={menuOpen}>
  <header>
    <span class="title"><strong>{room.name}</strong> <small class="dim">{t(`game.${room.gameId}`)} · {room.code}</small></span>
    <span class="status" class:live role="status" aria-label={t(`room.status.${live ? 'live' : 'reconnecting'}`)}>{#if !live}{t('room.status.reconnecting')}{/if}</span>
    {#if youId}<button type="button" class="ghost icon" aria-label={t('react.open')} aria-expanded={reactOpen} onclick={() => (reactOpen = !reactOpen)}><Icon name="smile" /></button>{/if}
    <button type="button" class="ghost icon" aria-label={t('room.menu')} bind:this={menuBtn} onclick={openMenu}><Icon name="menu" /></button>
  </header>

  <SeatStrip {room} {youId} />
  {#if reactOpen && youId}<div class="react"><Reactions /></div>{/if}
  {#if errorText}<p class="error err" role="alert">{errorText}</p>{/if}

  <!-- While the connection is down nothing can be played, so no move is ever silently lost. -->
  <div class="play" inert={!live} class:offline={!live}><PlayTable {room} {isHost} /></div>
  </div>

  {#if menuOpen}
    <div class="sheet" role="dialog" aria-modal="true" aria-label={t('room.menu')}>
      <div class="sheet-head">
        <strong>{t('room.menu')}</strong>
        <button type="button" class="ghost" bind:this={closeBtn} onclick={closeMenu}>{t('room.closeMenu')}</button>
      </div>
      <div class="sheet-body">
        <section class="card">
          <div class="row">
            <button type="button" class="ghost grow" aria-pressed={fx.sound} onclick={() => setSound(!fx.sound)}>{t('nav.sound')}: {t(fx.sound ? 'nav.on' : 'nav.off')}</button>
            <label class="sr-only" for="ps-lang">{t('nav.language')}</label>
            <select id="ps-lang" value={ui.lang} onchange={(e) => setLang(e.currentTarget.value === 'tl' ? 'tl' : 'en')}>
              <option value="en">English</option>
              <option value="tl">Filipino</option>
            </select>
            <a class="btn ghost" href="#/">{t('room.home')}</a>
          </div>
        </section>
        <section class="card">
          <h2>{t('room.players')}</h2>
          {#each room.players as p (p.id)}
            <div class="row prow">
              <span class="grow">{p.name}{#if p.bot} <small class="dim">· {t(`level.${p.bot}`)}</small>{/if}</span>
              {#if canRename(p)}<button type="button" class="ghost" onclick={() => startRename(p)}>{t('room.rename')}</button>{/if}
              {#if isHost && !p.bot && p.id !== youId}<button type="button" class="ghost" disabled={!live} onclick={() => send({ t: 'makeHost', playerId: p.id })}>{t('room.makeHost')}</button>{/if}
            </div>
          {/each}
          {#if editing}
            <form class="rename" onsubmit={(e) => { e.preventDefault(); saveRename(); }}>
              <div class="row">
                <input aria-label={t('room.rename')} bind:value={draft} maxlength="24" autocomplete="off" />
                <button type="submit" class="primary" disabled={draft.trim() === ''}>{t('room.renameSave')}</button>
                <button type="button" class="ghost" onclick={() => (editing = null)}>{t('room.renameCancel')}</button>
              </div>
            </form>
          {/if}
        </section>
        {@render menu()}
      </div>
    </div>
  {/if}
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 20; background: var(--bg, #0b2f25); }
  .screen {
    position: fixed; z-index: 21; top: 0; bottom: 0; left: 50%; transform: translateX(-50%);
    width: min(520px, 100vw); box-sizing: border-box; height: 100dvh; overflow: hidden;
    display: flex; flex-direction: column; gap: 8px;
    padding: calc(env(safe-area-inset-top) + 6px) 10px calc(env(safe-area-inset-bottom) + 8px);
  }
  .base { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  header { display: flex; align-items: center; gap: 6px; min-height: 36px; }
  .title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--step-0); }
  .title strong { font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-weight: 800; font-size: var(--step-1); color: var(--accent); text-shadow: var(--sign-shadow); }
  .title small { font-size: var(--step--2); font-weight: 500; }
  .status { flex: none; font-size: .75rem; color: #ffb79e; white-space: nowrap; }
  .status::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--coral, #e4572e); margin-right: 4px; vertical-align: middle; }
  .status.live::before { background: var(--pos, #6fd49a); margin-right: 0; }
  .icon { min-height: 44px; min-width: 44px; padding: 0; border-radius: 12px; display: inline-grid; place-items: center; color: var(--accent); }
  /* a pop-over under the header, so opening it never pushes the game down */
  .react { position: absolute; z-index: 8; top: calc(env(safe-area-inset-top) + 46px); left: 10px; right: 10px; padding: 4px 2px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg, #0b2f25); box-shadow: 0 8px 20px rgba(0,0,0,.45); }
  .err { margin: 0; font-size: .8rem; }
  .play.offline { opacity: .55; filter: grayscale(.4); }
  .play { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; overflow: hidden; padding-top: 22px; }
  .sheet { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bg, #0b2f25); padding: calc(env(safe-area-inset-top) + 6px) 10px 10px; }
  .sheet-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; }
  .sheet-body { flex: 1; overflow-y: auto; display: grid; gap: 10px; align-content: start; }
  .prow { align-items: center; margin: 4px 0; }
  .rename { margin-top: 8px; }
</style>
