<script lang="ts">
  import { ROOM_CODE_PATTERN } from '../shared/protocol';
  import Home from './components/Home.svelte';
  import Room from './components/Room.svelte';
  import { fx, setSound } from './lib/effects.svelte';
  import { setLang, t, ui } from './lib/i18n.svelte';

  let hash = $state(location.hash);
  $effect(() => {
    const on = () => (hash = location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });
  $effect(() => setLang(ui.lang));

  const roomCode = $derived.by(() => {
    const m = /^#\/r\/([A-Za-z0-9]{5})$/.exec(hash);
    const code = m?.[1]?.toUpperCase() ?? null;
    return code && ROOM_CODE_PATTERN.test(code) ? code : null;
  });
</script>

<main>
  <nav class="row">
    <a class="grow" href="#/" aria-label="TableTally">TableTally</a>
    <button type="button" class="ghost tog" aria-pressed={fx.sound} onclick={() => setSound(!fx.sound)}>{t('nav.sound')}: {fx.sound ? 'on' : 'off'}</button>
    <label class="sr-only" for="lang">{t('nav.language')}</label>
    <select id="lang" value={ui.lang} onchange={(e) => setLang(e.currentTarget.value === 'tl' ? 'tl' : 'en')}>
      <option value="en">English</option>
      <option value="tl">Filipino</option>
    </select>
  </nav>

  {#if roomCode}
    {#key roomCode}<Room code={roomCode} />{/key}
  {:else}
    <Home />
  {/if}

  <footer class="dim">{t('app.disclaimer')}</footer>
</main>

<style>
  main { max-width: 520px; margin: 0 auto; padding: 10px 0 40px; }
  nav { margin-top: 6px; }
  nav a { font-family: var(--font-display); color: var(--accent); text-decoration: none; font-weight: 700; }
  nav select { width: auto; min-height: 40px; }
  nav { flex-wrap: wrap; }
  .tog { min-height: 40px; padding: .3em .8em; font-size: .85rem; }
  .tog[aria-pressed='true'] { border-color: var(--pos); color: var(--pos); }
  footer { font-size: .8rem; margin-top: 28px; text-align: center; }
</style>
