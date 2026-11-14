<script lang="ts">
  import { banners } from '../lib/banners.svelte';
</script>

<div class="stage" aria-live="assertive" aria-atomic="true">
  {#if banners.current}
    {#key banners.current.id}
      <div class="banner {banners.current.tone}" role="status">{banners.current.text}</div>
    {/key}
  {/if}
</div>

<style>
  .stage { position: fixed; left: 0; right: 0; top: 30%; z-index: 50; display: flex; justify-content: center; pointer-events: none; }
  .banner {
    /* a jeepney sign: a brass plate, heavy soft serif, a hard offset shadow instead of a glow */
    font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-weight: 900; font-size: clamp(1.5rem, 7vw, 2.5rem);
    letter-spacing: .02em; text-align: center; padding: .2em .65em .25em; border-radius: 14px; max-width: 92vw; line-height: 1.05;
    color: #1d1608; background: linear-gradient(180deg, #f6dc98, #d4a548 70%, #b98a2e); border: 3px solid #fff1c2;
    text-shadow: 1px 1px 0 rgba(255, 241, 194, .7);
    box-shadow: 5px 5px 0 var(--felt-950), 0 14px 40px rgba(0,0,0,.5);
    animation: slam 1.2s cubic-bezier(.2, 1.3, .4, 1) both;
  }
  .banner.bad { color: #fff7ee; background: linear-gradient(180deg, #f07a5c, #c83c1e); border-color: #ffd8c8; text-shadow: 2px 2px 0 #6e1a08; }
  .banner.info { color: var(--cream); background: var(--felt-700); border-color: var(--brass); text-shadow: var(--sign-shadow); font-size: clamp(1.25rem, 5.5vw, 1.9rem); }
  @keyframes slam {
    0% { transform: scale(.4) rotate(-6deg); opacity: 0; }
    18% { transform: scale(1.12) rotate(2deg); opacity: 1; }
    30% { transform: scale(1) rotate(0); }
    80% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.06); opacity: 0; }
  }
</style>
