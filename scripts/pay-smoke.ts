/**
 * Standalone payer smoke test for the x402 flow.
 *   npm run pay
 * In DEMO_MODE=mock (default) this simulates the payment — nothing settles
 * on-chain. Set DEMO_MODE=live + fund the wallet to exercise real settlement.
 */
import { payForCheck } from "../src/agent/payForCheck.js";

const r = await payForCheck({
  title: "Euphronios Krater",
  artist: "Euphronios",
  currentConfidence: 62, // inconclusive -> agent decides to pay
});

console.log("\n🤖 Agent economic decision:");
console.log("   " + r.reasoning);
console.log(`\n   mode:        ${r.mode}`);
console.log(`   facilitator: ${r.facilitator}`);
console.log(`   amount:      $${r.amountUsd.toFixed(2)} (${r.network})`);
console.log(`   paid:        ${r.paid}`);
console.log(`   paymentTx:   ${r.paymentTx ?? "(none — simulated)"}`);
console.log(`\n🔓 Unlocked premium result:`);
console.log(JSON.stringify(r.result, null, 2));
console.log();
