<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import Icon from './Icon.svelte';

  /**
   * The "?" button every game shows during a hand, with the short how-to-play list it opens. The play screen
   * itself only says what is happening (whose turn, who won); how to play lives here, the same in every game.
   */
  interface Props {
    /** Title of the list, already translated. */
    title: string;
    /** The rules, already translated, one short line each. */
    items: readonly string[];
    /** A smaller button for a status line. */
    small?: boolean;
  }
  let { title, items, small = false }: Props = $props();
  let open = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />
<button type="button" class="ghost help" class:small aria-expanded={open} aria-label={title} onclick={() => (open = !open)}><Icon name="help" /></button>
{#if open}
  <!-- an overlay on the whole screen, so the play area never clips it -->
  <div class="rules" role="dialog" aria-label={title}>
    <strong>{title}</strong>
    <ul>
      {#each items as item, i (i)}<li>{item}</li>{/each}
    </ul>
    <button type="button" class="ghost" onclick={() => (open = false)}>{t('room.closeMenu')}</button>
  </div>
{/if}

<style>
  .help { flex: none; width: 44px; min-height: 44px; height: 44px; padding: 0; border-radius: 50%; display: grid; place-items: center; color: var(--accent); border: 0; }
  .help.small { width: 32px; min-height: 32px; height: 32px; margin: -6px -4px -6px 0; }
  .rules { position: fixed; z-index: 25; /* below the room menu (30); hands keep their card layers to themselves */ right: 10px; top: 52px; max-height: calc(100% - 64px); overflow-y: auto; width: min(320px, calc(100% - 20px)); padding: 10px 14px; border-radius: 12px; border: 1px solid var(--brass); background: var(--felt-900, #0b2f25); color: var(--cream, #f3e9d2); box-shadow: 0 8px 24px rgba(0,0,0,.5); font-size: .85rem; text-align: left; }
  .rules ul { margin: 6px 0 8px; padding-left: 1.1em; }
  .rules li { margin: .3em 0; }
  .rules > button { min-height: 40px; height: auto; padding: 6px 18px; }
</style>
