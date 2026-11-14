/**
 * Exact integer helpers. TableTally never uses floating point for scores or money.
 * All amounts are whole numbers of the smallest unit (points, chips or minor currency units).
 */

/**
 * Largest absolute amount accepted anywhere in scoring, ledger or settlement (1e12 smallest units).
 * With at most a few dozen players every sum stays far below 2^53, so integer arithmetic is exact.
 */
export const MAX_AMOUNT = 1_000_000_000_000;

/** A safe integer whose magnitude is at most MAX_AMOUNT. */
export function assertAmount(value: number, label = 'amount'): number {
  assertInt(value, label);
  if (Math.abs(value) > MAX_AMOUNT) {
    throw new RangeError(`${label} must be between -${MAX_AMOUNT} and ${MAX_AMOUNT}, got ${value}`);
  }
  return value;
}

export function assertInt(value: number, label = 'value'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${value}`);
  }
  return value;
}

/** Sum of integers, checked. */
export function sumInts(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += assertInt(v);
  return assertInt(total, 'sum');
}

/**
 * Split `total` across `weights` so that the parts are integers and sum exactly to `total`
 * (largest-remainder method). Ties in the remainder go to the earliest index.
 * Weights must be non-negative integers with a positive sum. `total` may be negative.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertAmount(total, 'total');
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  weights.forEach((w, i) => {
    assertAmount(w, `weights[${i}]`);
    if (w < 0) throw new RangeError(`weights[${i}] must be >= 0`);
  });
  const weightSum = sumInts(weights);
  if (weightSum <= 0) throw new RangeError('weights must have a positive sum');

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const W = BigInt(weightSum);
  const A = BigInt(abs);

  const parts = weights.map((w) => (A * BigInt(w)) / W);
  const remainders = weights.map((w, i) => ({
    i,
    r: (A * BigInt(w)) % W,
  }));
  let leftover = Number(A - parts.reduce((s, p) => s + p, 0n));
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = parts.map((p) => Number(p));
  for (let k = 0; k < leftover; k++) {
    const entry = remainders[k];
    if (entry) result[entry.i] = (result[entry.i] ?? 0) + 1;
  }
  return result.map((p) => sign * p);
}

/**
 * Convert chip amounts to money with an integer ratio `moneyUnits / chips`, keeping the sum of
 * the converted amounts equal to the converted sum of the inputs (so a zero-sum input stays
 * zero-sum). Amounts are rounded with the largest-remainder method on magnitudes, applied to
 * positives and negatives separately so signs are respected.
 *
 * Equal remainders are broken in seat order starting at `tieStart` (and wrapping), so a caller that moves
 * `tieStart` along (for example by hand number) does not hand every tie to the first seat.
 */
export function convertZeroSum(
  amounts: readonly number[],
  ratio: { chips: number; moneyUnits: number },
  tieStart = 0,
): number[] {
  assertAmount(ratio.chips, 'ratio.chips');
  assertAmount(ratio.moneyUnits, 'ratio.moneyUnits');
  if (ratio.chips <= 0 || ratio.moneyUnits < 0) {
    throw new RangeError('ratio.chips must be > 0 and ratio.moneyUnits >= 0');
  }
  amounts.forEach((a, i) => assertAmount(a, `amounts[${i}]`));
  const total = sumInts(amounts);
  if (total !== 0) throw new RangeError('amounts must sum to zero to convert');

  const R = BigInt(ratio.chips);
  const M = BigInt(ratio.moneyUnits);
  const floorOf = (a: number): number => {
    const q = (BigInt(Math.abs(a)) * M) / R;
    if (q > BigInt(MAX_AMOUNT)) {
      throw new RangeError(`converted amount for ${a} exceeds ${MAX_AMOUNT}`);
    }
    return Number(q);
  };
  const remOf = (a: number): bigint => (BigInt(Math.abs(a)) * M) % R;
  const n = amounts.length;
  const start = Number.isSafeInteger(tieStart) && n > 0 ? ((tieStart % n) + n) % n : 0;
  const seatAfter = (i: number): number => (i - start + n) % n;

  const result = amounts.map((a) => Math.sign(a) * floorOf(a) + 0); // + 0 turns a -0 into 0
  // Rounding down each magnitude leaves positives short and negatives short by the same total
  // only by coincidence, so fix the residual by rounding the largest remainders away from zero
  // on the side that needs it.
  let residual = -sumInts(result); // amount to add to bring the sum back to zero
  const order = amounts
    .map((a, i) => ({ i, a, r: remOf(a) }))
    .filter((e) => e.r > 0n)
    .sort((x, y) => (x.r === y.r ? seatAfter(x.i) - seatAfter(y.i) : x.r > y.r ? -1 : 1));
  for (const e of order) {
    if (residual === 0) break;
    // residual > 0: need to increase the total, so bump positives up (+1).
    // residual < 0: need to decrease the total, so bump negatives down (-1).
    if (residual > 0 && e.a > 0) {
      result[e.i] = (result[e.i] ?? 0) + 1;
      residual -= 1;
    } else if (residual < 0 && e.a < 0) {
      result[e.i] = (result[e.i] ?? 0) - 1;
      residual += 1;
    }
  }
  if (residual !== 0) {
    throw new Error('internal error: could not balance converted amounts');
  }
  return result;
}
