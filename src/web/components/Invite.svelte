<script lang="ts">
  import QRCode from 'qrcode';
  import { t } from '../lib/i18n.svelte';

  let { code, seated, total }: { code: string; seated: number; total: number } = $props();

  const link = $derived(`${location.origin}/#/r/${code}`);
  let svg = $state('');
  let copied = $state(false);

  $effect(() => {
    let live = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b3b2e', light: '#f3e9d2' } })
      .then((s) => live && (svg = s))
      .catch((e) => {
        if (import.meta.env.DEV) console.warn('QR failed', e);
        if (live) svg = '';
      });
    return () => (live = false);
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      // clipboard blocked: the code is on screen anyway
      if (import.meta.env.DEV) console.warn('copy failed', e);
    }
  }
</script>

<section class="card invite">
  <h2>{t('room.share')}</h2>
  <!-- the QR is a picture of the link below; the svg comes from the qrcode library, never from user text -->
  <div class="qr" role="img" aria-label={t('room.qrAlt', { code })}>{@html svg}</div>
  <p class="code" aria-label={t('room.codeLabel')}>{code}</p>
  <p class="dim">{t('room.seats', { n: seated, total })}</p>
  <button type="button" onclick={copy}>{copied ? t('room.copied') : t('room.copyLink')}</button>
</section>

<style>
  .invite { text-align: center; }
  .qr { width: min(70vw, 280px); margin: 0 auto 8px; border-radius: 12px; overflow: hidden; background: #f3e9d2; }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  .code { font-family: var(--font-display); font-size: 2.4rem; letter-spacing: .25em; margin: .2em 0; color: var(--accent); }
</style>
