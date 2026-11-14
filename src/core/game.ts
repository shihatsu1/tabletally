import type { Net } from './settlement';

/**
 * The only contract between the core and a game. A new game is one folder under src/games/<id>/
 * that exports a GameModule. The core never imports a specific game.
 *
 * Rules for implementers:
 * - `score` is a pure function: same inputs, same output, no I/O, no Date, no randomness.
 * - Amounts are safe integers in the smallest unit (points, chips or minor currency units).
 * - The returned Net must sum to exactly zero and contain every player id.
 */
export interface GameModule<Setup = unknown, Input = unknown> {
  /** Stable machine id, e.g. "pusoy-dos". Used in saved logs, so never rename it. */
  readonly id: string;
  /** Player counts the game supports. */
  readonly playerCounts: readonly number[];
  /** Default host options for a given player count. Must be JSON-serialisable. */
  defaultSetup(playerCount: number): Setup;
  /** Human-readable problems with host options for a player count. Empty array means valid. The value is
   *  untrusted JSON, so implementations must check types, not assume them. */
  validateSetup(setup: unknown, playerCount: number): string[];
  /** Human-readable problems with a round input. Empty array means valid. */
  validate(setup: Setup, players: readonly string[], input: Input): string[];
  /** Zero-sum result of one round. */
  score(setup: Setup, players: readonly string[], input: Input): Net;
}
