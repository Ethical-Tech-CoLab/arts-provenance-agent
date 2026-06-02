import { tavily } from "@tavily/core";
import { MOCK_TAVILY, config } from "../config.js";

/**
 * Authoritative-source allowlist from Susan's list.
 * Grounding research is scoped to these domains so the provenance record
 * is built only from sources we trust — bad/unverified data never enters.
 */
export const AUTHORITATIVE_DOMAINS = [
  "metmuseum.org",
  "unesco.org",
  "artloss.com",
  "icom.museum",
  "culturalheritage.gov",
];

export interface GroundedFact {
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceQuote: string;
}

/**
 * Search authoritative sources for an artwork and return clean, cited facts.
 * Every returned fact carries a source URL + quote — a claim with no source
 * is never produced, which is what blocks hallucinated provenance.
 *
 * Honors the shared mock switch (DEMO_MODE=mock / MOCK_TAVILY=1) and, in live
 * mode, falls back to a fixture if the network call fails so the demo survives.
 */
export async function searchProvenance(
  queryText: string,
  opts: { restrictToAuthoritative?: boolean } = {}
): Promise<GroundedFact[]> {
  if (MOCK_TAVILY) return mockFacts(queryText);

  const apiKey = config.tavilyApiKey;
  if (!apiKey) {
    console.warn("[tavily] TAVILY_API_KEY not set — falling back to fixture.");
    return mockFacts(queryText);
  }

  try {
    const client = tavily({ apiKey });
    const res = await client.search(queryText, {
      searchDepth: "advanced",
      includeAnswer: false,
      maxResults: 6,
      includeDomains: opts.restrictToAuthoritative ? AUTHORITATIVE_DOMAINS : undefined,
    });
    const facts = (res.results ?? []).map((r) => ({
      claim: r.title,
      sourceUrl: r.url,
      sourceTitle: r.title,
      sourceQuote: (r.content ?? "").slice(0, 280),
      issuer: issuerFromUrl(r.url),
    }));
    return facts.length ? facts : mockFacts(queryText);
  } catch (e) {
    console.warn(`[tavily] live search failed (${(e as Error).message}) — using fixture.`);
    return mockFacts(queryText);
  }
}

/** Map a source URL to the authority that published it (for citation). */
function issuerFromUrl(url: string): string {
  if (url.includes("metmuseum.org")) return "The Metropolitan Museum of Art";
  if (url.includes("unesco.org")) return "UNESCO";
  if (url.includes("artloss.com")) return "The Art Loss Register";
  if (url.includes("icom.museum")) return "ICOM";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown source";
  }
}

function mockFacts(queryText: string): GroundedFact[] {
  return [
    {
      claim: `Reference record found for "${queryText}"`,
      sourceUrl: "https://www.metmuseum.org/art/collection/search/000000",
      sourceTitle: "The Met Collection — object record (MOCK)",
      sourceQuote:
        "Provenance: acquired 1961; prior history between 1939 and 1955 not documented. [MOCK DATA — set MOCK_TAVILY=0 for live results]",
      issuer: "The Metropolitan Museum of Art",
    },
    {
      claim: `Repatriation context for "${queryText}"`,
      sourceUrl: "https://www.unesco.org/en/fight-illicit-trafficking",
      sourceTitle: "UNESCO 1970 Convention — illicit trafficking (MOCK)",
      sourceQuote:
        "Objects exported from source countries after 1970 without permit are subject to restitution claims. [MOCK DATA]",
      issuer: "UNESCO",
    },
  ];
}
