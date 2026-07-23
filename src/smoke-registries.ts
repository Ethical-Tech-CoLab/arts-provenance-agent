/**
 * Smoke test for the stolen-art register layer.
 *
 *   npm run smoke-registries -- "Euphronios Krater"
 *   npm run smoke-registries -- "The Concert" "Johannes Vermeer"
 *
 * Prints the verdict AND the access tier for every register, because the
 * verdict alone is not interpretable. Under DEMO_MODE=mock the domain-scoped
 * searches are skipped and reported as `not-queryable` rather than faked — if
 * you see a wall of `not-queryable`, that is the tool telling the truth about
 * mock mode, not a failure.
 */
import "dotenv/config";
import { checkRegistries } from "./tools/registries.js";
import { DEMO_MODE } from "./config.js";

const title = process.argv[2] ?? "Euphronios Krater";
const artist = process.argv[3];

const s = await checkRegistries(title, artist);

console.log(`\n== ${title}${artist ? ` / ${artist}` : ""}  (DEMO_MODE=${DEMO_MODE}) ==`);
console.log(
  `possible matches: ${s.possibleMatches}   not queryable: ${s.notQueryable}/${s.checks.length}   risk-relevant hits: ${s.riskRelevantHits.length}\n`
);

for (const c of s.checks) {
  console.log(`[${c.verdict.padEnd(17)}] ${c.access.padEnd(16)} ${c.registry}`);
  for (const h of c.hits.slice(0, 4)) {
    console.log(`     ${h.riskRelevant ? "⚑" : "·"} ${h.claim}`);
  }
}

console.log(
  `\nReminder: "no-evidence-found" is not "clear". Objects looted at source were never\ninventoried and cannot appear in a stolen-property register at all.\n`
);
