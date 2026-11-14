/** Show an integer with a thousands separator and an explicit sign for positives. Pure integer formatting. */
export function fmt(n: number): string {
  const body = Math.abs(n).toLocaleString('en-US');
  return n > 0 ? `+${body}` : n < 0 ? `-${body}` : body;
}

export const plain = (n: number): string => n.toLocaleString('en-US');
