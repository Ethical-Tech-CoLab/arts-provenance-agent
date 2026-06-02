/**
 * Agent wallet — Base Sepolia (TESTNET ONLY).
 *
 * One secp256k1 key plays two roles, which is the whole pitch:
 *   1. It authorizes the x402 USDC micropayment (it's a payment wallet).
 *   2. It signs the Provenance Passport (it's a signing authority / PKI key).
 * "A wallet is PKI, applied to an artwork's identity instead of a payment."
 *
 * CLI:
 *   npm run wallet            -> print address + test-USDC balance
 *   npm run wallet -- --new   -> generate a fresh key to paste into .env
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { config, USDC_BASE_SEPOLIA } from "../config.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Throws a friendly message if no key is configured. */
export function requirePrivateKey(): Hex {
  const pk = config.walletPrivateKey;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(
      "WALLET_PRIVATE_KEY missing or malformed in .env.\n" +
        "Generate one with:  npm run wallet -- --new"
    );
  }
  return pk;
}

export function getAccount() {
  return privateKeyToAccount(requirePrivateKey());
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(config.baseSepoliaRpc),
});

/** Wallet client x402-fetch uses to sign USDC authorizations. */
export function getWalletClient() {
  return createWalletClient({
    account: getAccount(),
    chain: baseSepolia,
    transport: http(config.baseSepoliaRpc),
  });
}

/** Test-USDC balance (human units) for the given address. */
export async function usdcBalance(address: Address): Promise<number> {
  const raw = (await publicClient.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
  return Number(formatUnits(raw, 6)); // USDC has 6 decimals
}

// --- CLI -------------------------------------------------------------------
async function main() {
  if (process.argv.includes("--new")) {
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    console.log("\n🔑 New Base Sepolia agent wallet (TESTNET — do not fund with real money):\n");
    console.log(`  Address:      ${acct.address}`);
    console.log(`  Private key:  ${pk}\n`);
    console.log("Add to .env:");
    console.log(`  WALLET_PRIVATE_KEY=${pk}`);
    console.log(`  VENDOR_PAYTO=${acct.address}\n`);
    console.log("Then fund it with test USDC: https://faucet.circle.com (select Base Sepolia)\n");
    return;
  }

  const acct = getAccount();
  console.log(`\n🪪  Agent wallet (Base Sepolia testnet)`);
  console.log(`   Address: ${acct.address}`);
  try {
    const bal = await usdcBalance(acct.address);
    console.log(`   Test USDC balance: ${bal} USDC`);
    if (bal <= 0) {
      console.log(`\n   ⚠️  Zero balance. Fund it: https://faucet.circle.com (Base Sepolia)`);
    } else {
      console.log(`\n   ✅ Funded — ready to pay x402 micropayments.`);
    }
  } catch (err) {
    console.log(`   ⚠️  Could not read balance (RPC issue): ${(err as Error).message}`);
  }
  console.log();
}

// Run only when invoked directly (not when imported).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
