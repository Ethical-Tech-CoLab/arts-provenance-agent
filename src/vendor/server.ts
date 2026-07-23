/**
 * The premium provenance vendor — a stand-in for "Art Loss Register Premium
 * Search". This is OUR service, but the x402 paywall is genuine: it returns a
 * real HTTP 402 with payment requirements, and only releases its (canned) data
 * once a valid USDC payment on Base Sepolia has settled.
 *
 *   GET /alr/info               -> free: describes the service + price
 *   GET /alr/premium-search     -> 402-gated: settles payment, then returns data
 *
 * Run:  npm run vendor
 */
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paymentMiddleware } from "x402-express";
import { config, HAS_CDP, facilitatorLabel } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "../../fixtures/vendor-alr-premium.json"), "utf8")
) as Record<string, any>;

const PORT = Number(new URL(config.vendorUrl).port || 4021);

/**
 * Resolve the vendor payout address. There is no safe default here: falling back
 * to the zero address would make every settled x402 payment burn the USDC, so a
 * missing/malformed VENDOR_PAYTO must fail loudly at startup instead.
 */
function resolvePayTo(): `0x${string}` {
  const raw = (config.vendorPayTo ?? "").trim();
  if (!raw) {
    throw new Error(
      "VENDOR_PAYTO is not set. The vendor refuses to start without a payout address — " +
        "defaulting to the zero address would burn every payment. " +
        "Run `npm run wallet -- --new` and set VENDOR_PAYTO in .env."
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(`VENDOR_PAYTO is not a valid 20-byte EVM address: ${raw}`);
  }
  if (/^0x0{40}$/.test(raw)) {
    throw new Error("VENDOR_PAYTO is the zero address — payments would be burned. Set a real payout address.");
  }
  return raw as `0x${string}`;
}

const PAY_TO = resolvePayTo();
const PRICE = `$${config.vendorPrice.toFixed(2)}`;

const app = express();

// --- Free, un-paywalled endpoint: lets the agent read the price first --------
app.get("/alr/info", (_req, res) => {
  res.json({
    vendor: "Art Loss Register — Premium Search (simulated x402 vendor)",
    description:
      "Premium search across stolen-art / repatriation databases not covered by free public sources.",
    endpoint: "/alr/premium-search",
    price: PRICE,
    asset: "USDC",
    network: "base-sepolia",
    payTo: PAY_TO,
  });
});

// --- x402 paywall: only this route requires payment --------------------------
// Facilitator selection (who validates + settles the USDC payment):
//   - default: the public testnet facilitator (https://x402.org/facilitator),
//     no Coinbase keys required.
//   - X402_FACILITATOR=coinbase + CDP keys: settle via Coinbase CDP rails,
//     which also gives traceTransaction() a real Coinbase-settled tx to screen.
let facilitatorConfig: any = undefined;
if (config.facilitator === "coinbase" && HAS_CDP) {
  // Lazy import so the demo runs without @coinbase/x402 keys present.
  const { facilitator } = await import("@coinbase/x402");
  facilitatorConfig = facilitator;
}

const routes = {
  "GET /alr/premium-search": {
    price: PRICE,
    network: "base-sepolia",
    config: {
      description: "Art Loss Register — Premium stolen-art & repatriation search",
      mimeType: "application/json",
    },
  },
} as const;

app.use(
  facilitatorConfig
    ? paymentMiddleware(PAY_TO, routes, facilitatorConfig)
    : paymentMiddleware(PAY_TO, routes)
);

// --- Paid handler: reached only after settlement -----------------------------
app.get("/alr/premium-search", (req, res) => {
  const title = String(req.query.title ?? "").toLowerCase();
  const key = title.includes("euphronios") || title.includes("krater")
    ? "euphronios-krater"
    : "default";
  const data = FIXTURE[key] ?? FIXTURE.default;

  // x402-express attaches the settlement response header; surface the tx for the receipt.
  const settlement = res.getHeader("X-PAYMENT-RESPONSE");
  res.json({ ...data, paid: true, settlementHeader: settlement ?? null });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`\n💳 ALR Premium vendor (x402) listening on http://localhost:${PORT}`);
    console.log(`   Free:  GET /alr/info`);
    console.log(`   Paid:  GET /alr/premium-search   (${PRICE} USDC, base-sepolia)`);
    console.log(`   payTo: ${PAY_TO}`);
    console.log(`   facilitator: ${facilitatorLabel()}\n`);
  });
}

export { app };
