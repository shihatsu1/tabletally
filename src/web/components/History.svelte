<script lang="ts">
  import type { RoomView } from '../../shared/protocol';
  import { gameUis } from '../games';
  import { fmt } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import { send, session } from '../lib/session.svelte';

  interface Props {
    room: RoomView;
    /** The host may void the last hand (and bring it back right after). */
    canVoid: boolean;
  }
  let { room, canVoid }: Props = $props();

  const gameUi = $derived(gameUis[room.gameId]);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? id;
  const live = $derived(session.status === 'live');

  let open = $state<string | null>(null);
  let confirmBox = $state<HTMLDialogElement | undefined>();

  // The last thing that happened to the ledger was a void: the voided hand can still be brought back.
  const lastEntry = $derived(room.history.at(-1));
  const canRestore = $derived(canVoid && lastEntry?.action === 'undo');

  function voidLast() {
    confirmBox?.close();
    send({ t: 'undo' });
  }
</script>

<section class="card">
  <div class="row head">
    <h2 class="grow">{t('room.history')}</h2>
    {#if canRestore}
      <button type="button" class="ghost" disabled={!live} onclick={() => send({ t: 'restore' })}>{t('room.restore')}</button>
    {:else if canVoid && room.rounds.length > 0}
      <button type="button" class="ghost" disabled={!live} onclick={() => confirmBox?.showModal()}>{t('room.void')}</button>
    {/if}
  </div>

  {#if room.rounds.length === 0}
    <p class="dim">{t('room.noRounds')}</p>
  {:else}
    <ol>
      {#each [...room.rounds].reverse() as r, i (r.id)}
        <li>
          <button type="button" class="log" aria-expanded={open === r.id} aria-controls="round-{r.id}" onclick={() => (open = open === r.id ? null : r.id)}>
            <!-- numbered by position, so a voided hand never leaves a gap -->
            <span class="dim n">{t('room.round', { n: room.rounds.length - i })}</span>
            <span class="grow what">{gameUi?.describe(r, room.setup, nameOf, t) ?? ''}</span>
            <svg class="chev" class:open={open === r.id} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>

          {#if open === r.id}
            <div id="round-{r.id}" class="detail">
              <p class="dim sub">{t('room.roundTotals')}</p>
              <ul>
                {#each room.players as p (p.id)}
                  {@const v = r.delta[p.id] ?? 0}
                  <li><span class="grow">{p.name}</span><span class="num" class:pos={v > 0} class:neg={v < 0}>{fmt(v)}</span></li>
                {/each}
              </ul>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<dialog bind:this={confirmBox} aria-labelledby="void-title">
  <h2 id="void-title">{t('room.void')}</h2>
  <p>{t('room.voidConfirm')}</p>
  <div class="row">
    <button type="button" class="ghost grow" onclick={() => confirmBox?.close()}>{t('room.cancel')}</button>
    <button type="button" class="primary grow" onclick={voidLast}>{t('room.voidYes')}</button>
  </div>
</dialog>

<style>
  .head { align-items: center; }
  ol { list-style: none; margin: 0; padding: 0; }
  ol > li { border-bottom: 1px solid color-mix(in srgb, var(--line) 40%, transparent); }
  ol > li:last-child { border-bottom: 0; }
  .log { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 10px; padding: 12px 4px; min-height: 52px; }
  .log:hover { background: color-mix(in srgb, var(--brass) 10%, transparent); }
  .n { white-space: nowrap; }
  .chev { color: var(--accent); flex: none; transition: transform .15s ease; }
  .chev.open { transform: rotate(90deg); }
  .detail { margin: 0 4px 12px; padding: 12px; background: var(--bg-deep); border-radius: 12px; }
  .detail .sub { margin: 0 0 6px; font-size: .85rem; }
  .detail ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .detail li { display: flex; gap: 10px; }
  dialog { max-width: min(360px, calc(100vw - 32px)); border: 1px solid var(--brass); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); padding: 18px; }
  dialog::backdrop { background: rgba(0, 0, 0, .55); }
  dialog h2 { margin-top: 0; }
  @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
