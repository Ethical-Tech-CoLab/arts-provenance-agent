/**
 * Build the static GitHub Pages snapshot into ./dist-pages.
 *
 *   npm run build:pages          # register data baked in live (needs TAVILY_API_KEY)
 *   npm run build:pages -- --offline   # skip live register calls
 *
 * GitHub Pages cannot run the Express backend, so the published site is a
 * pre-rendered capture: every API response the frontend asks for, written to a
 * JSON file, plus `static-api.js` which overrides fetch/EventSource to read
 * them. The site is otherwise the real `public/` app, unmodified.
 *
 * Two deliberate choices about modes:
 *
 *  - The WALLET stays mock. Passports are signed with a throwaway per-process
 *    key, so the published credentials are demo artifacts that verify against
 *    themselves and commit nobody's real identity to a public branch.
 *  - The REGISTERS are queried for real (`live: true`), because a snapshot full
 *    of "not machine-queryable" would misrepresent the tool in the one place
 *    most people will actually see it. `--offline` opts out when there is no
 *    Tavily key or no network.
 *
 * Everything here is regenerable. The previous snapshot was assembled by hand
 * and existed only on the gh-pages branch, which meant the published site could
 * not be rebuilt from source.
 */
// DEMO_MODE=mock is set by the npm script, not here: ESM hoists imports above
// statements, so assigning process.env in this file would land after the config
// module had already read it.
import "dotenv/config";
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getCatalog, getObject, issueObjectPassport } from "../src/web/catalog.js";
import { runProvenance } from "../src/web/pipeline.js";
import { checkRegistries, getRegistries } from "../src/tools/registries.js";
import { getWatchlist } from "../src/web/watchlist.js";
import { verifyCredential } from "../src/lib/signing.js";
import { config, DEMO_MODE, facilitatorLabel } from "../src/config.js";
import type { RunEvent, Intent } from "../src/lib/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "dist-pages");
const LIVE = !process.argv.includes("--offline");

function write(rel: string, data: unknown): void {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// --- Static assets -----------------------------------------------------------
// Pages serves from a /arts-provenance-agent/ subpath, so the app's absolute
// asset hrefs ("/app.js") would resolve to the domain root and 404. Rewriting
// them to relative and injecting the shim is the only edit made to the app.
const html = readFileSync(join(ROOT, "public/index.html"), "utf8")
  .replace('href="/styles.css"', 'href="styles.css"')
  .replace('<script src="/app.js"></script>', '<script src="static-api.js"></script>\n  <script src="app.js"></script>')
  .replace(
    "</head>",
    '  <meta name="description" content="Digital Provenance Passport — trace an artwork\'s history, check stolen-art registers, flag looting and repatriation risk, and issue a signed, tamper-evident passport. Static demo of the Ethical Tech CoLab arts-provenance-agent." />\n</head>'
  );
writeFileSync(join(OUT, "index.html"), html);
copyFileSync(join(ROOT, "public/app.js"), join(OUT, "app.js"));
copyFileSync(join(ROOT, "public/styles.css"), join(OUT, "styles.css"));
copyFileSync(join(ROOT, "scripts/pages/static-api.js"), join(OUT, "static-api.js"));
// Anything else public/ references — favicons and the object photographs.
// Copied by discovery rather than by name so adding an asset to the app doesn't
// silently 404 on Pages. Walks subdirectories: the photographs live in
// public/objects/, and a flat scan silently skipped every one of them.
function copyAssets(rel: string): void {
  for (const entry of readdirSync(join(ROOT, "public", rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      mkdirSync(join(OUT, child), { recursive: true });
      copyAssets(child);
    } else if (/\.(svg|png|ico|jpg|jpeg|webp|woff2?)$/i.test(entry.name)) {
      copyFileSync(join(ROOT, "public", child), join(OUT, child));
    }
  }
}
copyAssets("");
writeFileSync(join(OUT, ".nojekyll"), ""); // stop Jekyll eating the api/ folder

// --- /api/config and /api/registries ----------------------------------------
write("api/config.json", {
  demoMode: DEMO_MODE,
  vendorPriceUSD: config.vendorPrice,
  facilitator: facilitatorLabel(),
  maxSpendUSD: config.maxSpendUsd,
  spentUSD: 0,
  authRequired: false,
});
write(
  "api/registries.json",
  getRegistries().map((r) => ({
    id: r.id,
    name: r.name,
    issuer: r.issuer,
    jurisdiction: r.jurisdiction,
    access: r.access,
    coverage: r.coverage,
    referralUrl: r.referralUrl,
    applyUrl: r.applyUrl,
  }))
);

// --- /api/watchlist ----------------------------------------------------------
// Shipped whole; static-api.js applies the filters in the browser. The caveat
// travels inside the file so it cannot be separated from the rows.
const watchlist = getWatchlist();
write("api/watchlist.json", watchlist);

// --- /api/catalog and the per-object routes ----------------------------------
const catalog = getCatalog();
write(
  "api/catalog.json",
  catalog.map((o) => ({
    id: o.id,
    title: o.title,
    artist: o.artist,
    culture: o.culture,
    period: o.period,
    icon: o.icon,
    accent: o.accent,
    image: o.image,
    riskScore: o.riskScore,
    riskLevel: o.riskLevel,
    repatriation: o.repatriation,
    currentLocation: o.currentLocation,
    stops: o.journey.length,
  }))
);

console.log(`Building ${catalog.length} objects (registers: ${LIVE ? "live" : "offline"})…`);

for (const obj of catalog) {
  write(`api/object/${obj.id}.json`, getObject(obj.id));

  const summary = await checkRegistries(obj.title, obj.artist, { live: LIVE });
  write(`api/registries/${obj.id}.json`, summary);

  const passport = await issueObjectPassport(obj, summary);
  write(`api/passport/${obj.id}.json`, passport);

  console.log(
    `  ${obj.id.padEnd(26)} registers: ${summary.possibleMatches} match / ${summary.notQueryable} unreachable`
  );
}

// --- /api/verify -------------------------------------------------------------
// Verified against a real passport rather than hard-coded, so the published
// "✓ Valid — signed by 0x…" is a genuine signature check, not a claim.
const sample = JSON.parse(readFileSync(join(OUT, `api/passport/${catalog[0].id}.json`), "utf8"));
write("api/verify.json", await verifyCredential(sample));

// --- /api/run: record one full agent trace -----------------------------------
const events: RunEvent[] = [];
const intent: Intent = {
  title: "Euphronios Krater",
  origin: "Italy",
  knownHistory: "Surfaced on the market in 1971 with no documented prior ownership.",
  askingPriceUSD: 1_200_000,
  estimatedMarketValueUSD: 250_000,
};
await runProvenance(
  "static",
  intent,
  (phase, payload) => {
    events.push({ phase, message: payload.message, data: payload.data, at: new Date().toISOString() });
  },
  { liveRegistries: LIVE }
);
write("api/run.json", events);

console.log(`\nWrote ${OUT}`);
console.log(`  ${catalog.length} objects · ${events.length} recorded trace events`);
console.log(`  next: npm run deploy:pages\n`);
