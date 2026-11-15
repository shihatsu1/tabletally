import type { PublicRound } from '../../../shared/protocol';
import type { TongItsInput } from '../../../games/tong-its';

/** Deals played since the pot was last collected (not counting the deal now being played). */
export function potDealsSince(rounds: readonly PublicRound[]): number {
  let n = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (((rounds[i]?.input as TongItsInput).potDeals ?? 0) > 0) break;
    n++;
  }
  return n;
}

/** The previous winner can collect the pot unless that hand already collected it. */
export function potContender(rounds: readonly PublicRound[]): string | null {
  const last = rounds.at(-1);
  if (!last) return null;
  const input = last.input as TongItsInput;
  return (input.potDeals ?? 0) > 0 ? null : input.winner;
}
