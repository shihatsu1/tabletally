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
