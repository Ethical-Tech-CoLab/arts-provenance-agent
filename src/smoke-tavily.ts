/**
 * Tavily connectivity smoke test.
 * Run:  npx tsx src/smoke-tavily.ts "Euphronios Krater"
 * Confirms your TAVILY_API_KEY works before we build the agent on top of it.
 */
import { searchProvenance } from "./tools/tavily.js";

const q = process.argv.slice(2).join(" ") || "Euphronios Krater provenance Met repatriation Italy";

const facts = await searchProvenance(q, { restrictToAuthoritative: true });

console.log(`\n🔎 Query: ${q}`);
console.log(`✅ Tavily returned ${facts.length} grounded fact(s):\n`);
for (const f of facts) {
  console.log(`• ${f.sourceTitle}`);
  console.log(`  ${f.sourceUrl}`);
  console.log(`  "${f.sourceQuote}"\n`);
}
