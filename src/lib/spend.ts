/**
 * Spend guardrails for the x402 payment paths.
 *
 * Two jobs:
 *  1. Convert the USD budget into the *atomic* USDC ceiling that gets handed to
 *     `wrapFetchWithPayment`, so a signed payment authorization can never exceed
 *     the budget even if the vendor asks for more.
 *  2. Track cumulative spend for the life of the process, so a loop of runs
 *     can't drain the wallet one micropayment at a time (MAX_SPEND_USD is a
 *     lifetime cap, not just a per-call one).
 *
 * Deliberately dependency-free and in-memory: this is a demo-scale guardrail,
 * not a distributed accounting system.
 */
import { config } from "../config.js";

/** USDC has 6 decimals on Base Sepolia. */
export const USDC_DECIMALS = 6;
const UNIT = 1_000_000;

/** USD (float) -> atomic USDC units, rounded down so we never round *up* a cap. */
export function usdToAtomic(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) return 0n;
  return BigInt(Math.floor(usd * UNIT));
}

/** Atomic USDC units -> USD (float), for human-readable messages. */
export function atomicToUsd(atomic: bigint): number {
  return Number(atomic) / UNIT;
}

// --- Process-wide cumulative spend ledger ------------------------------------

let spent = 0;

/** Total USD authorized by this process so far. */
export function spentUsd(): number {
  return spent;
}

/** Record a settled/authorized payment against the lifetime budget. */
export function recordSpendUsd(usd: number): void {
  if (Number.isFinite(usd) && usd > 0) spent += usd;
}

/** USD still available under the cap (defaults to config.maxSpendUsd). */
export function remainingBudgetUsd(cap: number = config.maxSpendUsd): number {
  return Math.max(0, cap - spent);
}

/** Test/ops hook — reset the ledger. */
export function resetSpend(): void {
  spent = 0;
}

// --- 402 preflight ------------------------------------------------------------

export interface Preflight {
  status: number;
  /** Highest amount any offer in the 402 demands, in atomic units (null if unknown). */
  requiredAtomic: bigint | null;
  requiredUsd: number | null;
  /** False only when we positively know the demand exceeds the ceiling. */
  withinBudget: boolean;
}

/** Pull the largest `maxAmountRequired` out of an x402 402 body. */
export function requiredAtomicFrom402(body: unknown): bigint | null {
  const accepts = (body as any)?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  let max: bigint | null = null;
  for (const offer of accepts) {
    const raw = offer?.maxAmountRequired ?? offer?.amountRequired ?? offer?.amount;
    if (raw === undefined || raw === null) continue;
    let v: bigint;
    try {
      v = BigInt(String(raw));
    } catch {
      continue;
    }
    if (max === null || v > max) max = v;
  }
  return max;
}

/**
 * Ask the vendor what it wants *before* any key touches the request. Returns
 * `withinBudget: false` only when the 402 demands more than `maxAtomic`, so an
 * unparseable/absent quote still falls through to `wrapFetchWithPayment`, which
 * enforces the same ceiling at signing time.
 */
export async function preflight402(
  url: string,
  maxAtomic: bigint,
  fetchImpl: typeof globalThis.fetch = fetch
): Promise<Preflight> {
  const res = await fetchImpl(url, { method: "GET" });
  if (res.status !== 402) {
    // Not a paywall response — nothing to authorize. Drain the body.
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, requiredAtomic: null, requiredUsd: null, withinBudget: true };
  }
  const body = await res.json().catch(() => null);
  const requiredAtomic = requiredAtomicFrom402(body);
  return {
    status: 402,
    requiredAtomic,
    requiredUsd: requiredAtomic === null ? null : atomicToUsd(requiredAtomic),
    withinBudget: requiredAtomic === null ? true : requiredAtomic <= maxAtomic,
  };
}
