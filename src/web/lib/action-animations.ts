/** Movements inferred exclusively from the two views the current viewer is allowed to see. */
export interface Movement { from: string; to: string; card?: number | null; coin?: number; pulse?: boolean }
type View = Record<string, any>;
const seat = (id: string, you: string | null) => id === you ? 'hand' : `seat:${id}`;

export function movements(game: string, before: View, after: View): Movement[] {
  const out: Movement[] = [];
  const you = after.you as string | null;
  const players: string[] = after.players ?? [];
  if (game === 'tong-its') {
    const actor = before.turn as string;
    const source = seat(actor, you);
    if (after.stockCount < before.stockCount) {
      const drawn = actor === you ? (after.hand as number[]).find(c => !(before.hand as number[]).includes(c)) ?? null : null;
      out.push({ from: 'stock', to: source, card: drawn });
    }
    if (after.discards.length < before.discards.length) out.push({ from: 'discard', to: source, card: before.discards.at(-1) ?? null });
    if (after.discards.length > before.discards.length) out.push({ from: source, to: 'discard', card: after.discards.at(-1) ?? null });
    for (const meld of after.melds) {
      const old = before.melds.find((m: View) => m.id === meld.id);
      const added: number[] = meld.cards.filter((c: number) => !old?.cards.includes(c));
      if (added.length) for (const card of added) out.push({ from: source, to: 'melds', card });
      else if (!old && meld.hidden) for (let i = 0; i < meld.size; i++) out.push({ from: source, to: 'melds', card: null });
    }
    if (!before.done && after.done) for (const id of players.filter(id => id !== you)) for (const card of after.hands?.[id] ?? []) out.push({ from: `seat:${id}`, to: 'reveal', card });
  } else if (game === 'pusoy-dos') {
    if (after.lead && (before.lead?.by !== after.lead.by || JSON.stringify(before.lead?.cards) !== JSON.stringify(after.lead.cards))) {
      for (const card of after.lead.cards) out.push({ from: seat(after.lead.by, you), to: 'played', card });
    }
    for (const id of after.passed) if (!before.passed.includes(id)) out.push({ from: `seat:${id}`, to: `seat:${id}`, pulse: true });
    if (before.lead && !after.lead) out.push({ from: 'played', to: 'stock', card: null });
    if (!before.done && after.done) for (const id of players.filter(id => id !== you)) for (const card of after.hands?.[id] ?? []) out.push({ from: `seat:${id}`, to: 'reveal', card });
  } else if (game === 'poker') {
    for (const card of (after.board as number[]).slice(before.board.length)) out.push({ from: 'stock', to: 'board', card });
    for (const id of players) {
      const old = before.seat[id], next = after.seat[id];
      if (!old || !next) continue;
      const winnings = (after.wins ?? []).filter((win: View) => win.id === id).reduce((sum: number, win: View) => sum + win.amount, 0);
      const paid = Math.max(0, old.stack - next.stack + winnings);
      if (paid > 0) out.push({ from: `seat:${id}`, to: 'pot', coin: paid });
      if (!old.folded && next.folded) out.push({ from: seat(id, you), to: 'stock', card: null });
    }
    if (!before.done && after.done) for (const reveal of after.reveal ?? []) for (const card of reveal.hole ?? []) out.push({ from: `seat:${reveal.id}`, to: 'reveal', card });
    if (!before.done && after.done) for (const win of after.wins ?? []) if (win.amount > 0) out.push({ from: 'pot', to: `seat:${win.id}`, coin: win.amount });
  } else if (game === 'pusoy') {
    for (const id of players) if (before.waiting.includes(id) && !after.waiting.includes(id)) out.push({ from: seat(id, you), to: `seat:${id}`, card: null });
    if (!before.done && after.done) for (const id of players) {
      const entry = after.reveal?.[id];
      if (entry?.arrangement) for (const card of [...entry.arrangement.front, ...entry.arrangement.middle, ...entry.arrangement.back]) out.push({ from: `seat:${id}`, to: 'reveal', card });
    }
  }
  return out;
}
