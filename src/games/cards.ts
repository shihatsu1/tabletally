/**
 * Shared card helpers for the private hand helpers. Cards are numbers 0..51:
 * suit * 13 + (rank - 1), suits S H D C, ranks A=1 .. K=13. The app never sees anyone's hand:
 * these functions run on the player's own phone.
 */
export type Card = number;

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const rankOf = (c: Card): number => (c % 13) + 1;
export const suitOf = (c: Card): number => Math.floor(c / 13);
export const makeCard = (suit: number, rank: number): Card => suit * 13 + (rank - 1);
export const cardLabel = (c: Card): string => `${RANK_LABELS[rankOf(c) - 1]}${SUITS[suitOf(c)]}`;

/** Problems with a set of cards: out of range, duplicated, or more than `max`. */
export function validateCards(cards: readonly Card[], max: number): string[] {
  const problems: string[] = [];
  if (cards.length > max) problems.push(`a hand has at most ${max} cards`);
  if (!cards.every((c) => Number.isInteger(c) && c >= 0 && c <= 51)) problems.push('cards must be 0 to 51');
  if (new Set(cards).size !== cards.length) problems.push('a card appears twice');
  return problems;
}
