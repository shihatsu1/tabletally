import type { Rng } from './rng';
/**
 * The contract for digital play (the server deals and runs the turns). A game opts in by exporting a
 * PlayEngine and registering it in src/games/engines.ts. The core never imports a specific engine.
 *
 * Rules for implementers:
 * - Everything is pure and JSON-serialisable: state is stored as JSON, and the same seed gives the same game.
 * - `validate` and `apply` get untrusted moves; `validate` must check types, not assume them.
 * - `viewFor` is the ONLY thing a phone or a bot ever sees. It must never include another player's hidden cards
 *   (a finished hand may reveal them).
 * - `result` turns a finished hand into the game module's round input (what `score()` takes), so the
 *   existing ledger, totals, history and undo are reused unchanged.
 */
export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

// Defaults are `any` so engines with different types can share one registry (engines.ts); each engine is typed.
export interface PlayEngine<Setup = any, State = any, Move = any, View = any> {
  /** Shuffle and deal. `players` is the seat order. `prev` is the previous hand's final state, for games whose
   *  hands are linked (poker stacks and the dealer button carry over); null for the first hand. */
  /** `seed` is a number in tests (replayable) or the server's cryptographic source when dealing for real. */
  start(setup: Setup, players: readonly string[], seed: number | Rng, prev?: State | null): State;
  /** Player counts allowed when playing in the app (defaults to the game's own list). */
  playerCounts?: readonly number[];
  /** True when hands depend on each other (poker stacks carry over), so undoing or editing a past hand is not allowed. */
  linkedHands?: boolean;
  /** True when a hand has no stake multiplier (poker plays in chips and the ledger converts them). */
  stakeless?: boolean;
  /** Who must act now, or null when the hand is over. For simultaneous games, the first player still to act. */
  toAct(state: State): string | null;
  /** Simultaneous games (everyone acts at once, in secret): everyone who still has to act. Default: just `toAct`. */
  pending?(state: State): string[];
  /** True when `pending` can hold several players at once. Their one shared time limit starts when the hand is dealt. */
  simultaneous?: boolean;
  /** Human-readable problems with a move. Empty means legal. */
  validate(state: State, playerId: string, move: unknown): string[];
  /** Apply a validated move. */
  apply(state: State, playerId: string, move: Move): State;
  /** What this player (or a spectator, with null) may see. */
  viewFor(state: State, playerId: string | null): View;
  /** Round input for the game's scorer once the hand is over (without `stake`), else null. */
  result(state: State): Record<string, unknown> | null;
  /**
   * Optional: adjust a finished hand's input using the rounds already recorded (for example Tong-its' pot, which
   * depends on who won the previous deals). `history` is the inputs of the rounds in the ledger, oldest first.
   */
  finalize?(input: Record<string, unknown>, setup: Setup, history: readonly unknown[]): Record<string, unknown>;
  /** A computer player's move. It sees only its own view. */
  bot(view: View, level: BotLevel, seed: number): Move;
  /** A safe move when a human runs out of time. */
  timeoutMove(view: View): Move;
}
