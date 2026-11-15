<script lang="ts">
  import { onMount } from 'svelte';
  import { roomCodeFromQr } from '../lib/qr-join';

  let { onclose, onscan }: { onclose: () => void; onscan: (code: string) => void } = $props();
  let video = $state<HTMLVideoElement>(undefined!);
  let error = $state('');
  let scanning = $state(true);
  onMount(() => {
    let active = true;
    let stream: MediaStream | undefined;
    let frame = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !ctx) throw new Error('unavailable');
        const { default: decode } = await import('jsqr');
        if (!active) return;
        const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        stream = camera;
        if (!active) { camera.getTracks().forEach(track => track.stop()); return; }
        video.srcObject = camera;
        await video.play();
        const scan = () => {
          if (!active) return;
          if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
            if (result) {
              const code = roomCodeFromQr(result.data, location.origin);
              if (code) { active = false; camera.getTracks().forEach(track => track.stop()); onscan(code); return; }
              error = 'That QR code is not a table invitation. Try another code.';
            }
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch {
        stream?.getTracks().forEach(track => track.stop());
        if (active) { scanning = false; error = 'Camera unavailable. Allow camera access or enter the table code instead.'; }
      }
    }
    void start();
    return () => { active = false; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  });
</script>

<div class="scanner" role="region" aria-label="Scan table QR code">
  {#if scanning}<video bind:this={video} playsinline muted aria-label="Camera preview"></video><p>Point your camera at the table’s QR code.</p>{/if}
  {#if error}<p class="error" role="status">{error}</p>{/if}
  <button type="button" class="ghost" onclick={onclose}>Close camera</button>
</div>

<style>
  .scanner { margin-top: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-deep); }
  video { display: block; width: 100%; max-height: 320px; object-fit: cover; border-radius: 8px; background: #111; }
  p { margin: 8px 0; font-size: .9rem; }
</style>
