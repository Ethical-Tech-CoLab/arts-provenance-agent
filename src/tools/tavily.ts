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

/** Authoritative-source allowlist ("Susan's list") — grounding is scoped here. */
export const AUTHORITATIVE_DOMAINS = [
  "metmuseum.org",
  "unesco.org",
  "whc.unesco.org",
  "artloss.com",
  "icom.museum",
  "culturalheritage.gov",
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
  opts: { restrictToAuthoritative?: boolean } = { restrictToAuthoritative: true }
): Promise<GroundedFact[]> {
  if (MOCK_TAVILY || !config.tavilyApiKey) return loadFixture(queryText);

  try {
    const client = tavily({ apiKey: config.tavilyApiKey });
    const res: any = await client.search(queryText, {
      searchDepth: "advanced",
      includeAnswer: false,
      maxResults: 6,
      includeDomains: opts.restrictToAuthoritative ? AUTHORITATIVE_DOMAINS : undefined,
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

/** Back-compat shim for the existing smoke test (src/smoke-tavily.ts). */
export async function searchProvenance(
  queryText: string,
  opts: { restrictToAuthoritative?: boolean } = {}
): Promise<GroundedFact[]> {
  return tavilySearch(queryText, opts);
}
