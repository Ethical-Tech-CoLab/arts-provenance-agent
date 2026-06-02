/**
 * Step 5 of the agent loop — the agentic-commerce hook.
 *
 * The agent discovers a paywalled premium check, reads its price from the 402,
 * does economic reasoning (is this micropayment worth it given current
 * confidence + my budget?), and if so signs a USDC authorization and retries
 * with the X-PAYMENT header. The facilitator settles on Base Sepolia and the
 * data flows back. No human ever wired an API key.
 *
 * Guardrails (x402-style): a hard per-run budget cap, and a refusal to pay when
 * confidence is already conclusive.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { wrapFetchWithPayment, createSigner, decodeXPaymentResponse } from "x402-fetch";
import { config, IS_MOCK, facilitatorLabel } from "../config.js";
import { requirePrivateKey } from "../wallet/wallet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/vendor-alr-premium.json"), "utf8")
) as Record<string, any>;

/** Above this confidence, a premium check can't change the outcome — don't pay. */
const CONCLUSIVE_THRESHOLD = 90;

export interface PremiumCheckResult {
  vendor: string;
  result: any | null;          // the canned ALR data, once unlocked
  paid: boolean;
  paymentTx: string | null;    // settlement tx hash on Base Sepolia
  amountUsd: number;
  network: string;
  facilitator: string;
  mode: "live" | "mock" | "skipped";
  reasoning: string;           // human-readable decision, shown in the UI
}

export interface PayOptions {
  title: string;
  artist?: string;
  currentConfidence: number;   // 0..100
  maxSpendUsd?: number;
  alreadySpentUsd?: number;
}

function fixtureFor(title: string) {
  const t = title.toLowerCase();
  const key = t.includes("euphronios") || t.includes("krater") ? "euphronios-krater" : "default";
  return FIXTURE[key] ?? FIXTURE.default;
}

/**
 * Decide whether the premium check is worth paying for, then (if yes) pay it
 * over x402 and return the unlocked data + the on-chain receipt.
 */
export async function payForCheck(opts: PayOptions): Promise<PremiumCheckResult> {
  const price = config.vendorPrice;
  const maxSpend = opts.maxSpendUsd ?? config.maxSpendUsd;
  const spent = opts.alreadySpentUsd ?? 0;
  const base: Omit<PremiumCheckResult, "mode" | "reasoning" | "paid" | "result" | "paymentTx"> = {
    vendor: "Art Loss Register — Premium Search",
    amountUsd: price,
    network: "base-sepolia",
    facilitator: facilitatorLabel(),
  };

  // --- Economic reasoning / guardrails ---------------------------------------
  if (opts.currentConfidence >= CONCLUSIVE_THRESHOLD) {
    return {
      ...base,
      mode: "skipped",
      paid: false,
      result: null,
      paymentTx: null,
      reasoning: `Confidence already ${opts.currentConfidence}/100 (≥${CONCLUSIVE_THRESHOLD}, conclusive). A $${price.toFixed(2)} premium check can't change the outcome — skipping to respect budget.`,
    };
  }
  if (spent + price > maxSpend + 1e-9) {
    return {
      ...base,
      mode: "skipped",
      paid: false,
      result: null,
      paymentTx: null,
      reasoning: `Budget cap reached: already spent $${spent.toFixed(2)}, this check is $${price.toFixed(2)}, cap is $${maxSpend.toFixed(2)}. Refusing to exceed budget.`,
    };
  }

  const worthIt = `Confidence ${opts.currentConfidence}/100 is inconclusive and a $${price.toFixed(2)} ALR premium search can resolve the open looting/repatriation question — within the $${maxSpend.toFixed(2)} budget, so paying.`;

  // --- Mock mode: skip the network, return canned data with a clear marker ---
  if (IS_MOCK) {
    return {
      ...base,
      mode: "mock",
      paid: false,
      result: { ...fixtureFor(opts.title), _mock: true },
      paymentTx: null,
      facilitator: "mock (no settlement)",
      reasoning: worthIt + " [DEMO_MODE=mock — settlement skipped, canned data returned]",
    };
  }

  // --- Live x402 payment -----------------------------------------------------
  try {
    const pk = requirePrivateKey(); // never reached in mock mode (the default)
    const signer = await createSigner("base-sepolia", pk);
    const fetchWithPay = wrapFetchWithPayment(fetch, signer as any);

    const url = `${config.vendorUrl}/alr/premium-search?title=${encodeURIComponent(opts.title)}`;
    const res = await fetchWithPay(url, { method: "GET" });
    if (!res.ok) throw new Error(`vendor returned HTTP ${res.status}`);
    const data = await res.json();

    let paymentTx: string | null = null;
    const header = res.headers.get("x-payment-response");
    if (header) {
      try {
        const decoded = decodeXPaymentResponse(header);
        paymentTx = (decoded as any)?.transaction ?? (decoded as any)?.txHash ?? null;
      } catch { /* leave null */ }
    }

    return {
      ...base,
      mode: "live",
      paid: true,
      result: data,
      paymentTx,
      reasoning: worthIt,
    };
  } catch (err) {
    // Graceful fallback — the stage demo must never hard-fail on the network.
    return {
      ...base,
      mode: "mock",
      paid: false,
      result: { ...fixtureFor(opts.title), _mock: true },
      paymentTx: null,
      facilitator: "mock (fallback after error)",
      reasoning:
        worthIt +
        ` [Live payment failed: ${(err as Error).message}. Fell back to canned data so the demo continues.]`,
    };
  }
}
