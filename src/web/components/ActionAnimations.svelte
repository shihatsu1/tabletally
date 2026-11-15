<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { PlayEnvelope, RoomView } from '../../shared/protocol';
  import { movements, type Movement } from '../lib/action-animations';
  import { t } from '../lib/i18n.svelte';

  interface Update { before: PlayEnvelope | null; after: PlayEnvelope; beforeRoom: RoomView; room: RoomView }
  let root: HTMLDivElement;
  let active = true;
  let sequence = 0;
  let queue = 0;
  const hidden = new Map<HTMLElement, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const effects = new Set<Animation>();
  function later(fn: () => void, ms: number) {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
  }
  function conceal(el: HTMLElement): () => void {
    const generation = sequence;
    hidden.set(el, (hidden.get(el) ?? 0) + 1);
    el.classList.add('animation-arriving');
    return () => {
      if (generation !== sequence) return;
      const remaining = (hidden.get(el) ?? 1) - 1;
      if (remaining <= 0) { hidden.delete(el); el.classList.remove('animation-arriving'); }
      else hidden.set(el, remaining);
    };
  }
  function highlight(el: Element) {
    el.classList.add('animation-highlight');
    later(() => el.classList.remove('animation-highlight'), 500);
  }
  function destination(m: Movement): Element | null {
    const container = find(m.to);
    if (!container || m.card == null) return container;
    return container.querySelector(`[data-animation-card="${m.card}"]`) ?? container;
  }
  const selectors: Record<string, string> = {
    stock: '.ti .stock, .pk .board, .pd .mat, .ps',
    discard: '.ti .dpile, .ti .piles',
    hand: '.ti .hand, .pd .hand, .ps .hand, .pk .hole',
    melds: '.ti .melds', played: '.pd .mat', board: '.pk .board',
    pot: '.ti .potbox, .pk .pot, .pd .mat, .ps .reveal',
    reveal: '.ps .reveal, .ti .reveal, .pd .reveal, .pk .reveal',
  };
  function find(name: string): Element | null {
    if (name.startsWith('seat:')) return [...document.querySelectorAll('[data-animation-seat]')].find(el => el.getAttribute('data-animation-seat') === name.slice(5)) ?? null;
    return document.querySelector(selectors[name] ?? '');
  }
  function center(el: Element | null): { x: number; y: number } | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function fly(m: Movement, from: {x: number; y: number}, to: {x: number; y: number}, delay: number, target: Element) {
    if (!root || !active) return;
    if (m.action) {
      const node = document.createElement('span');
      node.className = 'action-cue';
      node.textContent = t(`poker.${m.action === 'allin' ? 'allinBtn' : m.action === 'call' ? 'actionCall' : m.action}`);
      root.append(node);
      const anim = node.animate([
        { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(.8)`, opacity: 0 },
        { opacity: 1, offset: .2 },
        { transform: `translate(${to.x}px, ${to.y - 24}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
      ], { duration: 1100, delay, fill: 'both', easing: 'ease-out' });
      effects.add(anim);
      void anim.finished.catch(() => undefined).then(() => { effects.delete(anim); node.remove(); });
      return;
    }
    if (m.pulse) {
      find(m.to)?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2)' }, { filter: 'brightness(1)' }], { duration: 400, delay });
      return;
    }
    const node = document.createElement('span');
    const coin = m.coin !== undefined;
    node.className = coin ? 'moving-coin' : 'moving-card';
    if (coin) node.textContent = String(m.coin);
    else if (m.card !== null && m.card !== undefined) {
      node.classList.add('face');
      node.style.backgroundPosition = `${((m.card % 13) * 100) / 12}% ${Math.floor(m.card / 13) * 100 / 3}%`;
    }
    root.append(node);
    const release = !coin && m.card != null && target instanceof HTMLElement && target.hasAttribute('data-animation-card') ? conceal(target) : () => {};
    const duration = coin ? 400 : 300;
    const anim = node.animate([
      { transform: `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) scale(.8)`, opacity: 0 },
      { opacity: 1, offset: .12 },
      { transform: `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
    ], { duration, delay, easing: 'ease-in-out', fill: 'both' });
    effects.add(anim);
    void anim.finished.catch(() => undefined).then(() => { effects.delete(anim); release(); node.remove(); });
  }
  function onUpdate(event: Event) {
    const { before, after, beforeRoom, room } = (event as CustomEvent<Update>).detail;
    if (document.querySelector('.lastview')) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items: Movement[] = [];
    if (!before || before.handNo !== after.handNo) {
      const view = after.view as { players: string[]; you: string | null; hand?: number[]; hole?: number[] };
      if (room.gameId === 'poker') {
        const seats = (after.view as { seat: Record<string, { bet: number }> }).seat;
        for (const id of view.players) if ((seats[id]?.bet ?? 0) > 0) items.push({ from: `seat:${id}`, to: 'pot', coin: seats[id]!.bet });
      }
      for (const id of view.players) {
        const cards = id === view.you ? (view.hand ?? view.hole ?? []) : [null, null];
        for (const card of cards) items.push({ from: 'stock', to: id === view.you ? 'hand' : `seat:${id}`, card });
      }
    } else {
      const transitions = (after.transitions ?? []).filter(entry => entry.revision > (before.revision ?? 0));
      if (transitions.length) {
        for (const entry of transitions) items.push(...movements(room.gameId, entry.before as Record<string, unknown>, entry.after as Record<string, unknown>));
      } else if (after.revision === undefined || before.revision === undefined) {
        items.push(...movements(room.gameId, before.view as Record<string, unknown>, after.view as Record<string, unknown>));
      }
      if (room.gameId !== 'poker' && room.rounds.length === beforeRoom.rounds.length + 1 && room.history.at(-1)?.action === 'add') {
        const round = room.rounds.at(-1)!;
        const input = round.input as { winner?: string; potDeals?: number };
        const winner = input.winner;
        const setup = room.setup as { potAnte?: number };
        const pot = room.gameId === 'tong-its' ? (input.potDeals ?? 0) * (setup.potAnte ?? 0) * room.players.length * after.stake : 0;
        if (winner && pot > 0) items.push({ from: 'pot', to: `seat:${winner}`, coin: pot });
        for (const [id, amount] of Object.entries(round.delta)) if (amount > 0) {
          const ordinary = amount - (id === winner && pot > 0 ? pot - (pot / room.players.length) : 0);
          const loser = Object.entries(round.delta).find(([, delta]) => delta < 0)?.[0];
          if (ordinary > 0 && loser) items.push({ from: `seat:${loser}`, to: `seat:${id}`, coin: ordinary });
        }
      }
    }
    const sources = items.map(m => {
      const origin = find(m.from);
      const card = m.card != null ? origin?.querySelector(`[data-animation-card="${m.card}"]`) : null;
      return center(card ?? origin);
    });
    const generation = sequence;
    void tick().then(() => {
      if (!active || generation !== sequence) return;
      if (reduced) {
        for (const target of new Set(items.map(destination).filter((el): el is Element => el !== null))) highlight(target);
        return;
      }
      items.forEach((m, i) => {
        const from = sources[i] ?? center(find(m.from));
        const target = destination(m);
        const to = center(target);
        if (from && to && target) fly(m, from, to, Math.min(600, queue + i * 35), target);
      });
      queue = Math.min(400, queue + items.length * 35);
      later(() => { queue = 0; }, 500);
    });
  }
  function clearEffects() {
    sequence++;
    for (const effect of effects) effect.cancel();
    for (const timer of timers) clearTimeout(timer);
    for (const el of hidden.keys()) el.classList.remove('animation-arriving');
    for (const el of document.querySelectorAll('.animation-highlight')) el.classList.remove('animation-highlight');
    hidden.clear(); timers.clear(); effects.clear(); queue = 0;
  }
  onMount(() => {
    active = true;
    window.addEventListener('tt:play-update', onUpdate);
    window.addEventListener('tt:animation-reset', clearEffects);
    return () => {
      active = false;
      window.removeEventListener('tt:play-update', onUpdate);
      window.removeEventListener('tt:animation-reset', clearEffects);
      clearEffects();
    };
  });
</script>

<div class="motion-layer" bind:this={root} aria-hidden="true"></div>
<style>
  :global(.animation-arriving) { opacity: 0 !important; }
  :global(.animation-highlight) { outline: 3px solid var(--brass-soft, #e3c77f) !important; outline-offset: 2px; }
  .motion-layer { position: fixed; inset: 0; pointer-events: none; z-index: 100; overflow: hidden; }
  .motion-layer :global(.action-cue) { position: fixed; left: 0; top: 0; white-space: nowrap; padding: 5px 10px; border: 1px solid var(--brass-soft); border-radius: 999px; background: var(--felt-950); color: var(--cream); font-weight: 800; box-shadow: 0 3px 12px #0009; }
  .motion-layer :global(.moving-card) { position: fixed; left: 0; top: 0; width: 32px; height: 46px; border: 2px solid #f8efd8; border-radius: 4px; box-shadow: 0 2px 6px #0008; background: repeating-linear-gradient(45deg,#b18c47 0 2px,#164535 2px 6px); }
  .motion-layer :global(.moving-card.face) { background-image: url('/cards/deck.webp'); background-size: 1300% 400%; background-repeat: no-repeat; background-color: white; }
  .motion-layer :global(.moving-coin) { position: fixed; left: 0; top: 0; min-width: 32px; height: 32px; padding: 0 4px; border-radius: 50%; border: 2px solid #ffe4a0; background: #a67419; box-shadow: 0 2px 7px #0009; color: white; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
</style>
