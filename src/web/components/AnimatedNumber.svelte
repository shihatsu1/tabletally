<script lang="ts">
  import { reducedMotion } from '../lib/effects.svelte';
  import { fmt } from '../lib/format';

  let { value }: { value: number } = $props();

  // The true value is always the exact integer in `value`. `shown` only drives the count-up display.
  // svelte-ignore state_referenced_locally
  let shown = $state(value);
  // svelte-ignore state_referenced_locally
  let previous = value;

  $effect(() => {
    const target = value;
    if (target === previous) return;
    const from = previous;
    previous = target;
    if (reducedMotion()) {
      shown = target;
      return;
    }
    // Count up with an ease-out curve. Only the display is rounded; the real value is never touched.
    const DURATION_MS = 700;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - p) ** 3;
      shown = p < 1 ? Math.round(from + (target - from) * eased) : target;
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      shown = target;
    };
  });
</script>

<span class="num" class:pos={value > 0} class:neg={value < 0}>{fmt(shown)}</span>
