/**
 * x402 settlement-transaction reference (AML screening placeholder).
 *
 * This module records *which* on-chain USDC transfer settled the x402 payment
 * so it can be audited later. It deliberately does NOT claim to have screened
 * it: no sanctions list, counterparty-exposure or mixer/peel-chain analysis is
 * performed anywhere in this codebase yet, so every verdict is `unscreened`.
 *
 * The `verdict: "flagged"` / real-screening branch is where a Coinbase CDP (or
 * other AML provider) integration would slot in. Until that exists, nothing
 * here may assert that a payment is "clean" — the result is folded into a
 * signed Passport, and a false AML attestation in a tamper-evident credential
 * is worse than no attestation at all.
 *
 * No real funds ever move here — this path is read-only.
 */
import type { RiskFlag } from "../../schema/passport.js";
import { config, IS_MOCK, HAS_CDP, USDC_BASE_SEPOLIA } from "../config.js";

export interface TraceResult {
  txHash: string | null;
  asset: string;
  network: string;
  /**
   * `unscreened` until real AML screening is implemented. Never emit "clean"
   * from a code path that did not actually screen the transaction.
   */
  verdict: "flagged" | "unscreened";
  screenedVia: string;
  detail: string;
  flag: RiskFlag | null; // a cryptoTransactionFlag iff something noteworthy
}

export async function traceTransaction(txHash: string | null): Promise<TraceResult> {
  const base = { asset: "USDC", network: "base-sepolia" };

  // No payment happened (skipped or simulated with no tx) -> nothing to trace.
  if (!txHash) {
    return {
      ...base,
      txHash: null,
      verdict: "unscreened",
      screenedVia: IS_MOCK ? "mock (no settlement)" : "n/a (no tx)",
      detail: "No settlement transaction to trace (payment was simulated or skipped).",
      flag: null,
    };
  }

  // Live path: records the settlement tx. NOTE: no AML screening is performed
  // here yet — the CDP lookup below is a placeholder, so the verdict stays
  // `unscreened` and nothing asserts the transfer is clean.
  if (!IS_MOCK && config.facilitator === "coinbase" && HAS_CDP) {
    try {
      // Placeholder for a real read-only CDP lookup + screening heuristics.
      // Kept defensive so a CDP/network hiccup never breaks the demo.
      const { CdpClient } = await import("@coinbase/cdp-sdk");
      void CdpClient; void USDC_BASE_SEPOLIA;
      return {
        ...base,
        txHash,
        verdict: "unscreened",
        screenedVia: "none (Coinbase CDP screening not implemented)",
        detail:
          `USDC transfer ${txHash.slice(0, 10)}… recorded for audit on Base Sepolia. ` +
          `No AML screening was performed: sanctioned-address, counterparty and mixer checks are not implemented.`,
        flag: unscreenedFlag(txHash),
      };
    } catch (err) {
      return mockTrace(txHash, base, `tx lookup failed (${(err as Error).message})`);
    }
  }

  return mockTrace(txHash, base);
}

function mockTrace(
  txHash: string,
  base: { asset: string; network: string },
  note = ""
): TraceResult {
  return {
    ...base,
    txHash,
    verdict: "unscreened",
    screenedVia: "none (mock mode)" + (note ? ` (${note})` : ""),
    detail:
      `Simulated USDC transfer ${txHash.slice(0, 10)}… on Base Sepolia — illustrative only, no real settlement ` +
      `in mock mode. No AML screening was performed (sanctions/mixer/counterparty checks are not implemented).`,
    flag: unscreenedFlag(txHash),
  };
}

/**
 * Informational flag recording that the payment was NOT screened. Deliberately
 * makes the absence of screening explicit, because this flag is embedded in the
 * signed Passport.
 */
function unscreenedFlag(txHash: string): RiskFlag {
  return {
    type: "cryptoTransactionFlag",
    severity: "low",
    evidence:
      "x402 micropayment settled on-chain and recorded for audit; NOT AML-screened " +
      "(no sanctions, mixer or counterparty analysis was performed).",
    source: txHash,
  };
}
