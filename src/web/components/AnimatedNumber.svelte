<script lang="ts">
  import { animate } from 'motion';
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
    const controls = animate(from, target, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => (shown = Math.round(v)),
      onComplete: () => (shown = target),
    });
    return () => {
      controls.stop();
      shown = target;
    };
  });
</script>

<span class="num" class:pos={value > 0} class:neg={value < 0}>{fmt(shown)}</span>
