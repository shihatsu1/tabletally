<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { getItem } from '../lib/storage';

  /** The host key for this table, if this phone created it. It lets the host take their seat back on another phone. */
  let { code }: { code: string } = $props();

  const key = $derived(getItem(`tt.hostKey.${code}`));
  const shown = $derived(key ? key.replace(/(.{4})(?=.)/g, '$1-') : '');
  let open = $state(false);
  let copied = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(shown);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      open = true; // clipboard blocked: show it so it can be written down
    }
  }
</script>

{#if key}
  <section class="card">
    <h2>{t('room.hostKey')}</h2>
    <p class="dim note">{t('room.hostKey.help')}</p>
    <div class="row">
      <code class="key" aria-live="polite">{open ? shown : '••••-••••-••••'}</code>
      <button type="button" class="ghost" aria-pressed={open} onclick={() => (open = !open)}>{t(open ? 'room.hostKey.hide' : 'room.hostKey.show')}</button>
      <button type="button" class="ghost" onclick={copy}>{t(copied ? 'room.copied' : 'room.copyLink.short')}</button>
    </div>
  </section>
{/if}

<style>
  .note { margin-top: 0; }
  .key { flex: 1; font-family: var(--font-display); font-size: 1.15rem; letter-spacing: .08em; color: var(--accent); }
</style>
