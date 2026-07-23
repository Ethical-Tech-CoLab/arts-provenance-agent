/**
 * Step 2 — Grounding research (Tavily).
 * Searches an authoritative-source allowlist, then extracts clean content.
 * Every returned fact carries a source URL — a claim with no source is never
 * produced, which is what blocks hallucinated provenance.
 *
 * Mock fallback (DEMO_MODE=mock or live failure) reads fixtures/ so the demo
 * runs with no network.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tavily } from "@tavily/core";
import { config, MOCK_TAVILY } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Authoritative-source allowlist ("Susan's list") — grounding is scoped here.
 *
 * KNOWN COVERAGE BIAS. These are five Western institutions and one commercial
 * theft register, and the bias runs against this tool's own motivation. The
 * case for building it rests on objects that stolen-art registers cannot catch:
 * material taken from an archaeological site or under colonial rule, never
 * inventoried and never reported stolen. This list searches best where objects
 * are already well documented (major Western museum holdings) and worst exactly
 * where the motivating harm lives (source-country archives, colonial-era and
 * archaeological material). A low confidence score for a Cambodian sculpture
 * and a low score for a Dutch painting therefore do not mean the same thing.
 *
 * Extending this list is the first substantive piece of future work, not an
 * optional one — every other improvement operates on evidence the tool was able
 * to find, and this list decides what it can find at all.
 *
 * PARTIALLY ADDRESSED. Four of the named gaps are now on the list: INTERPOL's
 * stolen works of art database, the FBI's National Stolen Art File, the German
 * Lost Art Foundation, and the Getty Provenance Index — plus the Carabinieri
 * TPC archive, the single most important source for Italian antiquities. See
 * `src/tools/registries.ts` for what including a domain here does and does not
 * buy: it lets grounding read what a register PUBLISHES, which is not the same
 * as searching the register itself. The remaining gap is the one that matters
 * most and is least tractable — the national heritage authorities of the
 * fourteen source countries the scorer already recognises.
 */
export const AUTHORITATIVE_DOMAINS = [
  // Museums and cultural bodies
  "metmuseum.org",
  "unesco.org",
  "whc.unesco.org",
  "icom.museum",
  "getty.edu",
  "culturalheritage.gov",
  // Stolen-property and spoliation registers
  "interpol.int",
  "fbi.gov",
  "carabinieri.it",
  "beniculturali.it",
  "lostart.de",
  "kulturgutverluste.de",
  "proveana.de",
  "artloss.com",
];

/** A raw grounded fact with full attribution. */
export interface GroundedFact {
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceQuote: string;
  sourceType: string;
  verifiedBy: string;
  tier: "verifiedByAuthority" | "reportedInPress" | "inferred";
  date: string | null;
  location: string | null;
}

function loadFixture(_query: string): GroundedFact[] {
  const fx = JSON.parse(
    readFileSync(join(__dirname, "../../fixtures/tavily-euphronios.json"), "utf8")
  );
  return (fx.results ?? []).map((r: any) => ({
    claim: r.title,
    sourceUrl: r.url,
    sourceTitle: r.title,
    sourceQuote: (r.content ?? "").slice(0, 320),
    sourceType: r.sourceType ?? "web",
    verifiedBy: r.verifiedBy ?? "web source",
    tier: r.tier ?? "reportedInPress",
    date: r.date ?? null,
    location: r.location ?? null,
  }));
}

function hostAuthority(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.includes("metmuseum")) return "The Metropolitan Museum of Art";
    if (h.includes("unesco")) return "UNESCO";
    if (h.includes("artloss")) return "Art Loss Register";
    if (h.includes("icom")) return "ICOM";
    if (h.includes("interpol")) return "INTERPOL — Cultural Heritage Crime Unit";
    if (h.includes("fbi.gov")) return "FBI Art Crime Team";
    if (h.includes("carabinieri")) return "Carabinieri TPC (Italy)";
    if (h.includes("beniculturali")) return "Ministero della Cultura (Italy)";
    if (h.includes("lostart") || h.includes("kulturgutverluste") || h.includes("proveana")) {
      return "German Lost Art Foundation";
    }
    if (h.includes("getty")) return "Getty Research Institute";
    if (h.includes(".gov")) return "Government cultural authority";
  } catch { /* noop */ }
  return "web source";
}

/**
 * Search authoritative sources and return clean, cited facts.
 * Falls back to the cached fixture on mock mode or any live error.
 */
export async function tavilySearch(
  queryText: string,
  opts: {
    restrictToAuthoritative?: boolean;
    /**
     * Scope the search to these domains instead of the full allowlist. Used by
     * the registry layer to search one register's site at a time, so a hit can
     * be attributed to that register rather than to "the allowlist".
     */
    domains?: string[];
    /**
     * Force a real search even under DEMO_MODE=mock. Exists for the static
     * Pages snapshot builder, which needs genuine register data baked in while
     * the wallet stays on a throwaway mock key. Not for request paths.
     */
    live?: boolean;
  } = { restrictToAuthoritative: true }
): Promise<GroundedFact[]> {
  if ((MOCK_TAVILY && !opts.live) || !config.tavilyApiKey) return loadFixture(queryText);

  const includeDomains = opts.domains?.length
    ? opts.domains
    : opts.restrictToAuthoritative
      ? AUTHORITATIVE_DOMAINS
      : undefined;

  try {
    const client = tavily({ apiKey: config.tavilyApiKey });
    const res: any = await client.search(queryText, {
      searchDepth: "advanced",
      includeAnswer: false,
      maxResults: 6,
      includeDomains,
    });
    const facts = (res.results ?? []).map((r: any) => {
      const who = hostAuthority(r.url);
      return {
        claim: r.title,
        sourceUrl: r.url,
        sourceTitle: r.title,
        sourceQuote: (r.content ?? "").slice(0, 320),
        sourceType: "web",
        verifiedBy: who,
        tier: who === "web source" ? "reportedInPress" : "verifiedByAuthority",
        date: null,
        location: null,
      } as GroundedFact;
    });
    return facts.length ? facts : loadFixture(queryText);
  } catch {
    return loadFixture(queryText); // graceful fallback — demo never hard-fails
  }
}

/** Extract clean content from specific URLs (used to deepen the best hits). */
export async function tavilyExtract(urls: string[]): Promise<Record<string, string>> {
  if (MOCK_TAVILY || !config.tavilyApiKey || urls.length === 0) {
    const out: Record<string, string> = {};
    for (const f of loadFixture("")) out[f.sourceUrl] = f.sourceQuote;
    return out;
  }
  try {
    const client = tavily({ apiKey: config.tavilyApiKey });
    const res: any = await client.extract(urls);
    const out: Record<string, string> = {};
    for (const r of res.results ?? []) out[r.url] = (r.rawContent ?? r.content ?? "").slice(0, 800);
    return out;
  } catch {
    return {};
  }
}

/**
 * True when a live search can actually run. The registry layer needs this:
 * without it, a fixture-backed search returns nothing on a scoped domain and
 * the check would record "no evidence found" — a fabricated negative, which is
 * the single most dangerous output this system can produce.
 */
export function groundingAvailable(live = false): boolean {
  return (!MOCK_TAVILY || live) && Boolean(config.tavilyApiKey);
}

/** Back-compat shim for the existing smoke test (src/smoke-tavily.ts). */
export async function searchProvenance(
  queryText: string,
  opts: { restrictToAuthoritative?: boolean; domains?: string[] } = {}
): Promise<GroundedFact[]> {
  return tavilySearch(queryText, opts);
}
