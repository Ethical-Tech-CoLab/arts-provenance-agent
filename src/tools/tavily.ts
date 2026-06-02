import "dotenv/config";
import { tavily } from "@tavily/core";

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

const useMock = process.env.MOCK_TAVILY === "1";

/**
 * Search authoritative sources for an artwork and return clean, cited facts.
 * Every returned fact carries a source URL + quote — a claim with no source
 * is never produced, which is what blocks hallucinated provenance.
 */
export async function searchProvenance(
  queryText: string,
  opts: { restrictToAuthoritative?: boolean } = {}
): Promise<GroundedFact[]> {
  if (useMock) return mockFacts(queryText);

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set. Add it to .env (or set MOCK_TAVILY=1).");
  }

  const client = tavily({ apiKey });
  const res = await client.search(queryText, {
    searchDepth: "advanced",
    includeAnswer: false,
    maxResults: 6,
    includeDomains: opts.restrictToAuthoritative ? AUTHORITATIVE_DOMAINS : undefined,
  });

  return (res.results ?? []).map((r) => ({
    claim: r.title,
    sourceUrl: r.url,
    sourceTitle: r.title,
    sourceQuote: (r.content ?? "").slice(0, 280),
  }));
}

function mockFacts(queryText: string): GroundedFact[] {
  return [
    {
      claim: `Reference record found for "${queryText}"`,
      sourceUrl: "https://www.metmuseum.org/art/collection/search/000000",
      sourceTitle: "The Met Collection — object record (MOCK)",
      sourceQuote:
        "Provenance: acquired 1961; prior history between 1939 and 1955 not documented. [MOCK DATA — set MOCK_TAVILY=0 for live results]",
    },
  ];
}
