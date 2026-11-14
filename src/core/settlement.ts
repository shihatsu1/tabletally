import { assertAmount } from './integer';

import type { Net } from './game';

/**
 * Fewest-payments settlement. Kept and tested, but the app does not use it: showing who pays whom was left out
 * on purpose (the app keeps score and never settles money). Do not wire it into a screen without asking.
 */
export type { Net };

export interface Payment {
  from: string;
  to: string;
  amount: number;
}

/** Above this many players with a non-zero balance the exact search is skipped (2^n subsets). */
export const EXACT_LIMIT = 16;

/**
 * Fewest-payments settlement.
 *
 * The minimum number of payments equals (players with a non-zero balance) minus (the maximum
 * number of disjoint groups whose balances each sum to zero). We find that maximum exactly with a
 * subset DP up to EXACT_LIMIT players, then settle each group greedily (a group of k players
 * needs at most k - 1 payments). Above the limit we fall back to one greedy pass over everyone,
 * which is still valid and uses at most n - 1 payments but may not be minimal.
 *
 * Output is deterministic: payments are sorted by amount (desc), then payer id, then payee id.
 */
export function settle(net: Net): Payment[] {
  const entries = Object.entries(net);
  let total = 0;
  for (const [id, v] of entries) {
    assertAmount(v, `net[${id}]`);
    total += v;
  }
  if (total !== 0) {
    throw new RangeError(`net balances must sum to zero, got ${total}`);
  }

  const people = entries
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, balance]) => ({ id, balance }));

  const groups = people.length <= EXACT_LIMIT ? zeroSumGroups(people) : [people];
  const payments = groups.flatMap((g) => greedy(g));
  return payments.sort(
    (a, b) =>
      b.amount - a.amount ||
      (a.from < b.from ? -1 : a.from > b.from ? 1 : 0) ||
      (a.to < b.to ? -1 : a.to > b.to ? 1 : 0),
  );
}

type Person = { id: string; balance: number };

/** Partition into the maximum number of disjoint zero-sum groups (exact, bitmask DP). */
function zeroSumGroups(people: Person[]): Person[][] {
  const n = people.length;
  if (n === 0) return [];
  const full = (1 << n) - 1;
  const sum = new Float64Array(full + 1);
  const best = new Int16Array(full + 1);
  const from = new Int8Array(full + 1).fill(-1);

  for (let mask = 1; mask <= full; mask++) {
    const low = mask & -mask;
    const bit = 31 - Math.clz32(low);
    sum[mask] = (sum[mask ^ low] ?? 0) + (people[bit]?.balance ?? 0);
  }
  for (let mask = 1; mask <= full; mask++) {
    let top = -1;
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const prev = best[mask ^ (1 << i)] ?? 0;
        if (prev > top) {
          top = prev;
          pick = i;
        }
      }
    }
    best[mask] = top + (sum[mask] === 0 ? 1 : 0);
    from[mask] = pick;
  }

  // Rebuild the best ordering, then cut it wherever the running sum returns to zero.
  const order: number[] = [];
  for (let mask = full; mask > 0; ) {
    const i = from[mask] ?? -1;
    order.push(i);
    mask ^= 1 << i;
  }
  order.reverse();

  const groups: Person[][] = [];
  let current: Person[] = [];
  let running = 0;
  for (const i of order) {
    const p = people[i];
    if (!p) continue;
    current.push(p);
    running += p.balance;
    if (running === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/** Largest debtor pays largest creditor until everyone is settled. */
function greedy(group: Person[]): Payment[] {
  const debtors = group
    .filter((p) => p.balance < 0)
    .map((p) => ({ id: p.id, left: -p.balance }));
  const creditors = group
    .filter((p) => p.balance > 0)
    .map((p) => ({ id: p.id, left: p.balance }));
  const byLeftDesc = (a: { id: string; left: number }, b: { id: string; left: number }) =>
    b.left - a.left || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const out: Payment[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byLeftDesc);
    creditors.sort(byLeftDesc);
    const d = debtors[0];
    const c = creditors[0];
    if (!d || !c) break;
    const amount = Math.min(d.left, c.left);
    out.push({ from: d.id, to: c.id, amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return out;
}

/** Net balance implied by a list of payments (used by tests and sanity checks). */
export function applyPayments(payments: readonly Payment[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const p of payments) {
    net[p.from] = (net[p.from] ?? 0) + p.amount;
    net[p.to] = (net[p.to] ?? 0) - p.amount;
  }
  return net;
}
