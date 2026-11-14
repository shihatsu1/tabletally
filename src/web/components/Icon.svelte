<script lang="ts">
  /** One small stroke icon set for actions, so every platform draws the same shapes. Decorative: the button
   *  that holds an icon carries the accessible name. Emoji reactions are content, not icons, and stay emoji. */
  export type IconName = 'pen' | 'menu' | 'close' | 'smile' | 'crown' | 'home' | 'help' | 'cards';
  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#if name === 'pen'}
    <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
  {:else if name === 'menu'}
    <path d="M4 7h16M4 12h16M4 17h16" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'smile'}
    <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1.8 2 5.2 2 7 0" /><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3" />
  {:else if name === 'crown'}
    <path d="M4 18h16l1-10-5 4-4-6-4 6-5-4 1 10z" fill="currentColor" stroke-width="1.5" />
  {:else if name === 'home'}
    <path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6" /><path d="M12 17h.01" stroke-width="3" />
  {:else if name === 'cards'}
    <rect x="3" y="6" width="11" height="15" rx="2" /><path d="M8 3h11a2 2 0 0 1 2 2v13" />
  {/if}
</svg>
