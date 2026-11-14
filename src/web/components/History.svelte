<script lang="ts">
  import type { RoomView } from '../../shared/protocol';
  import { gameUis } from '../games';
  import { fmt } from '../lib/format';
  import { t } from '../lib/i18n.svelte';
  import { send } from '../lib/session.svelte';

  let { room, isHost }: { room: RoomView; isHost: boolean } = $props();

  const gameUi = $derived(gameUis[room.gameId]);
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.name ?? id;
  const players = $derived(room.players.map((p) => ({ id: p.id, name: p.name })));

  let open = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let reason = $state('');

  function startEdit(id: string) {
    editing = id;
    reason = '';
  }

  function saveEdit(id: string, input: unknown) {
    send({ t: 'edit', id, reason, input });
    editing = null;
  }

  const roundNumber = (id: string) => id.slice(1);
</script>

<section class="card">
  <div class="row">
    <h2 class="grow">{t('room.history')}</h2>
    {#if isHost && room.rounds.length > 0}
      <button type="button" class="ghost" onclick={() => send({ t: 'undo' })}>{t('room.undo')}</button>
    {/if}
  </div>

  {#if room.rounds.length === 0}
    <p class="dim">{t('room.noRounds')}</p>
  {:else}
    <ol>
      {#each [...room.rounds].reverse() as r (r.id)}
        <li>
          <button
            type="button"
            class="log"
            aria-expanded={open === r.id}
            aria-controls="round-{r.id}"
            onclick={() => (open = open === r.id ? null : r.id)}
          >
            <span class="dim n">{t('room.round', { n: roundNumber(r.id) })}</span>
            <span class="grow what">
              {gameUi?.describe(r, room.setup, nameOf, t) ?? ''}
              {#if r.edited}<small class="dim"> · {t('room.edited')}</small>{/if}
            </span>
            <span class="chev" aria-hidden="true">{open === r.id ? '▾' : '▸'}</span>
          </button>

          {#if open === r.id}
            <div id="round-{r.id}" class="detail">
              <p class="dim head">{t('room.roundTotals')}</p>
              <ul>
                {#each room.players as p (p.id)}
                  {@const v = r.delta[p.id] ?? 0}
                  <li><span class="grow">{p.name}</span><span class="num" class:pos={v > 0} class:neg={v < 0}>{fmt(v)}</span></li>
                {/each}
              </ul>
              {#if isHost && editing !== r.id}
                <button type="button" class="ghost small" onclick={() => startEdit(r.id)}>{t('room.edit')}</button>
              {/if}
            </div>
          {/if}

          {#if editing === r.id && gameUi}
            <div class="edit">
              <label for="reason-{r.id}">{t('room.reason')}</label>
              <input id="reason-{r.id}" bind:value={reason} maxlength="140" />
              <gameUi.Entry
                setup={room.setup}
                rounds={room.rounds.slice(0, room.rounds.findIndex((x) => x.id === r.id))}
                {players}
                initial={r.input}
                submitLabel={t('room.saveEdit')}
                onsave={(input: unknown) => reason.trim() !== '' && saveEdit(r.id, input)}
              />
              <button type="button" class="ghost" onclick={() => (editing = null)}>{t('room.cancel')}</button>
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  ol { list-style: none; margin: 0; padding: 0; }
  ol > li { border-bottom: 1px solid color-mix(in srgb, var(--line) 40%, transparent); }
  ol > li:last-child { border-bottom: 0; }
  .log { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 10px; padding: 12px 4px; min-height: 52px; }
  .log:hover { background: color-mix(in srgb, var(--brass) 10%, transparent); }
  .n { white-space: nowrap; }
  .what { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent); text-underline-offset: 3px; }
  .chev { color: var(--accent); }
  .detail { margin: 0 4px 12px; padding: 12px; background: var(--bg-deep); border-radius: 12px; }
  .detail .head { margin: 0 0 6px; font-size: .85rem; }
  .detail ul { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 4px; }
  .detail li { display: flex; gap: 10px; }
  .small { min-height: 36px; padding: .3em .8em; }
  .edit { margin: 0 4px 12px; padding: 12px; background: var(--bg-deep); border-radius: 12px; }
</style>
