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
    const m = /^#\/r\/([A-Za-z0-9]{1,12})$/.exec(hash);
    const code = m?.[1]?.toUpperCase() ?? null;
    return code && ROOM_CODE_PATTERN.test(code) ? code : null;
  });
</script>

<main>
  <nav class="row">
    <a class="grow brand" href="#/">TableTally</a>
    <button type="button" class="ghost tog" aria-pressed={fx.sound} onclick={() => setSound(!fx.sound)}>{t('nav.sound')}: {t(fx.sound ? 'nav.on' : 'nav.off')}</button>
    <div role="group" aria-label={t('nav.language')} class="row">
      <button type="button" class="ghost" aria-pressed={ui.lang === 'en'} onclick={() => setLang('en')}>English</button>
      <button type="button" class="ghost" aria-pressed={ui.lang === 'tl'} onclick={() => setLang('tl')}>Filipino</button>
    </div>
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
  nav a { font-family: var(--font-display); font-variation-settings: 'SOFT' 100; color: var(--accent); text-decoration: none; font-weight: 800; font-size: var(--step-1); text-shadow: var(--sign-shadow); }
  .brand { display: inline-flex; align-items: center; min-height: 44px; }
  nav { flex-wrap: wrap; }
  .tog { min-height: 44px; padding: .3em .8em; font-size: .85rem; }
  .tog[aria-pressed='true'] { border-color: var(--pos); color: var(--pos); }
  footer { font-size: var(--step--2); margin: 28px auto 0; text-align: center; max-width: 42ch; line-height: 1.5; }
</style>
