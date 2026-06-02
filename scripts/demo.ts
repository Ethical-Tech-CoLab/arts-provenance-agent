/**
 * One-command happy path:  npm run demo
 * Runs the full 5-step agent loop on a sample artwork and prints the signed
 * Passport + the (simulated) x402 receipt. Defaults to DEMO_MODE=mock so it
 * completes with no network and no payment.
 */
import { runAgent } from "../src/agent/orchestrator.js";

const SAMPLE = {
  title: "Euphronios Krater",
  artist: "Euphronios (painter), Euxitheos (potter)",
  period: "c. 515 BCE, Attic red-figure",
  knownHistory: "Acquired by the Met in 1972; later repatriated to Italy.",
};

const ICON: Record<string, string> = {
  intent: "🎯", grounding: "🔎", risk: "⚖️", payment: "💳", trace: "🔗", passport: "🪪", done: "✅",
};

console.log(`\n🏛️  Digital Provenance Passport — demo run\n   Artwork: ${SAMPLE.title}\n`);

const { passport, verify } = await runAgent(SAMPLE, (e) => {
  console.log(`${ICON[e.step] ?? "•"}  [${e.step}] ${e.title}`);
});

console.log(`\n──────── PASSPORT (signed) ────────`);
console.log(`Issuer wallet : ${passport.issuer.wallet}`);
console.log(`Confidence    : ${passport.riskAssessment.confidenceScore}/100`);
console.log(`Flags         : ${passport.riskAssessment.flags.map((f) => f.type).join(", ") || "none"}`);
console.log(`Premium check : ${passport.premiumChecks[0]?.mode} · tx ${passport.premiumChecks[0]?.paymentTx ?? "(simulated)"}`);
console.log(`contentHash   : ${passport.contentHash}`);
console.log(`signature     : ${passport.signature.slice(0, 26)}…`);
console.log(`Verify        : ${verify.ok ? "VALID ✅" : "INVALID ❌"} — ${verify.reason}`);

// Tamper test: flip one field and re-verify -> must fail.
const { verifyPassport } = await import("../src/agent/passport.js");
const tampered = structuredClone(passport);
tampered.riskAssessment.confidenceScore = 100;
const t = await verifyPassport(tampered as any);
console.log(`\n🧪 Tamper test (confidence 100): ${t.ok ? "STILL VALID ❌ (bug!)" : "Verify FAILED as expected ✅"}`);
console.log(`   ${t.reason}\n`);
