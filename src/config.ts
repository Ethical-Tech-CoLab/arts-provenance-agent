import "dotenv/config";

/**
 * Central runtime config + the single source of truth for "are we mocking?".
 *
 * DEMO_MODE=mock forces every external call (Tavily, the paid vendor, the
 * chain, Coinbase tracing) onto cached fixtures so the demo runs with no
 * network. Default "live" tries real calls and each tool falls back to its
 * fixture on error — the stage demo can never hard-fail on a flaky network.
 */
export const DEMO_MODE = (process.env.DEMO_MODE ?? "live").toLowerCase();
export const IS_MOCK = DEMO_MODE === "mock";

/** Tavily mock: forced on by DEMO_MODE=mock, or the legacy MOCK_TAVILY=1. */
export const MOCK_TAVILY = IS_MOCK || process.env.MOCK_TAVILY === "1";

export const config = {
  isMock: IS_MOCK,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY as `0x${string}` | undefined,
  baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  vendorUrl: process.env.VENDOR_URL || "http://localhost:4021",
  vendorPrice: Number(process.env.VENDOR_PRICE ?? "0.05"),
  vendorPayTo: process.env.VENDOR_PAYTO as `0x${string}` | undefined,
  facilitator: (process.env.X402_FACILITATOR || "").toLowerCase(), // "" | "coinbase"
  cdpApiKeyId: process.env.CDP_API_KEY_ID || "",
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET || "",
  maxSpendUsd: Number(process.env.MAX_SPEND_USD ?? "0.25"),
};

/** True when Coinbase CDP credentials are present for real settlement/tracing. */
export const HAS_CDP = Boolean(config.cdpApiKeyId && config.cdpApiKeySecret);

/** Base Sepolia USDC (Circle test token) — used for x402 settlement + tracing. */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** Human label for whichever facilitator we'll actually use this run. */
export function facilitatorLabel(): string {
  if (IS_MOCK) return "mock (no settlement)";
  if (config.facilitator === "coinbase" && HAS_CDP) return "Coinbase CDP";
  return "public testnet (x402.org)";
}
