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
  .stage { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; pointer-events: none; }
  .banner {
    font-family: var(--font-display); font-weight: 800; font-size: clamp(2rem, 9vw, 3.4rem); letter-spacing: .04em; text-align: center;
    padding: .25em .7em; border-radius: 18px; max-width: 92vw; line-height: 1.1;
    color: #1d1608; background: linear-gradient(180deg, #f3e0a0, #c9a24b); border: 3px solid #fff3c4;
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--brass) 40%, transparent), 0 14px 50px rgba(0,0,0,.55), 0 0 60px rgba(201,162,75,.6);
    animation: slam 1.5s cubic-bezier(.2, 1.3, .4, 1) both;
  }
  .banner.bad { color: #fff; background: linear-gradient(180deg, #ff8a5c, #c63a14); border-color: #ffd2bf; box-shadow: 0 0 0 6px rgba(228,87,46,.35), 0 14px 50px rgba(0,0,0,.55), 0 0 60px rgba(228,87,46,.6); }
  .banner.info { color: var(--text); background: var(--bg-raised); border-color: var(--brass); box-shadow: 0 14px 50px rgba(0,0,0,.5); font-size: clamp(1.5rem, 7vw, 2.4rem); }
  @keyframes slam {
    0% { transform: scale(.4) rotate(-6deg); opacity: 0; }
    18% { transform: scale(1.12) rotate(2deg); opacity: 1; }
    30% { transform: scale(1) rotate(0); }
    80% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.06); opacity: 0; }
  }
</style>
