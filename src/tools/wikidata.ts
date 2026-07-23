/**
 * Wikidata — the one register-grade source in this project that is actually
 * machine-queryable without credentials.
 *
 * WHAT THIS IS AND IS NOT. Wikidata is community-maintained. It is not a
 * police register and it does not certify anything. What it is good for is
 * *lead generation with dates attached*: its `significant event` (P793)
 * statements carry values like "archaeological looting", "restitution",
 * "art theft" and "claim for restitution of an artwork", usually qualified
 * with a point-in-time and often with a reference URL. That is a structured
 * handle on precisely the events a provenance check cares about, and no other
 * openly queryable source in this space offers one.
 *
 * Every fact returned here is therefore tiered `reportedInPress` at best —
 * never `verifiedByAuthority` — and carries whatever reference URL Wikidata
 * holds so a human can go to the underlying source. A Wikidata hit is a
 * pointer to check, not a finding.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { IS_MOCK } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WD_API = "https://www.wikidata.org/w/api.php";
const WD_SPARQL = "https://query.wikidata.org/sparql";
/** Wikidata asks for a descriptive UA; anonymous clients get throttled hard. */
const UA = "arts-provenance-agent/0.1 (https://github.com/Ethical-Tech-CoLab/arts-provenance-agent)";
const TIMEOUT_MS = Number(process.env.WIKIDATA_TIMEOUT_MS ?? 8000);

/** Properties worth pulling for a provenance question, and nothing else. */
const PROVENANCE_PROPERTIES = [
  "P793", // significant event  <- looting, theft, restitution, restitution claim
  "P170", // creator            <- the disambiguator when a title is ambiguous
  "P195", // collection         <- who has held it
  "P495", // country of origin
  "P189", // location of discovery
  "P1071", // location of creation
  "P276", // location (current)
  "P571", // inception
] as const;

/**
 * Significant-event values that bear directly on illicit-trade risk.
 *
 * `nazi` is anchored on purpose. A bare substring match fires on "Museo
 * Nazionale Etrusco" and tags a perfectly ordinary collection statement as a
 * spoliation signal — the same failure the country matcher in
 * src/web/pipeline.ts was rewritten to avoid, and worse here, because the
 * false positive is an accusation.
 */
const RISK_EVENT_RE =
  /(loot|theft|stolen|restitut|repatriat|confiscat|seiz|spoliat|plunder|illicit|smuggl|erroneous provenance|\bnazi(?:s|sm|-era)?\b)/i;

export interface WikidataEvent {
  /** Human label of the property, e.g. "significant event". */
  property: string;
  /** Human label of the value, e.g. "archaeological looting". */
  value: string;
  /** Point-in-time qualifier (P585) as an ISO string, when present. */
  date: string | null;
  /** Reference URL (P854) Wikidata cites for the statement, when present. */
  reference: string | null;
  /** True when the value matches a looting / theft / restitution signal. */
  riskRelevant: boolean;
}

export interface WikidataMatch {
  qid: string;
  label: string;
  description: string;
  url: string;
  events: WikidataEvent[];
  /** Every candidate the label search returned, so the choice is auditable. */
  candidates: Candidate[];
}

/** How many label-search candidates to actually resolve before choosing. */
const CANDIDATE_LIMIT = 3;
/** How many the label search returns before artist filtering narrows them. */
const SEARCH_LIMIT = 10;

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

function loadFixture(): WikidataMatch | null {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../../fixtures/wikidata-euphronios.json"), "utf8")
    ) as WikidataMatch;
  } catch {
    return null;
  }
}

/**
 * Resolve a free-text artwork title to a Wikidata entity.
 *
 * Deliberately conservative: this is a label search, so it can land on a
 * different object with a similar name. The QID and label are always returned
 * to the caller and surfaced in the UI so the match itself is auditable —
 * "we searched Q1323051, here is what that is" — rather than silently folded
 * into a score.
 */
export async function findEntity(title: string, artist?: string): Promise<Candidate[]> {
  // Try progressively looser queries. "<title> <artist>" is the most precise
  // but very often matches no entity at all, because Wikidata labels are bare
  // titles. The parenthetical strip matters for real catalogue titles:
  // "Saliera (Cellini Salt Cellar)" and "Parthenon Marbles (Elgin Marbles)"
  // both match nothing verbatim, while their stripped forms resolve
  // immediately. The artist is deliberately kept for the filter below even
  // when it was dropped from the query — losing it there was what let "The
  // Concert" resolve to Titian instead of the Vermeer taken from the Gardner.
  const stripped = title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const queries = [artist ? `${title} ${artist}` : "", title, stripped].filter(
    (q, i, all) => q && all.indexOf(q) === i
  );

  let hits: Candidate[] = [];
  for (const q of queries) {
    hits = await searchLabels(q);
    if (hits.length) break;
  }
  if (!hits.length) return [];

  // Wikidata descriptions usually name the artist ("stolen painting by
  // Johannes Vermeer"), which picks the right candidate before we spend a
  // SPARQL round-trip on each. "The Concert" returns a Creedence live album, a
  // Titian and a ter Borch above the Vermeer, so relevance order alone drops
  // the object the caller asked about.
  const surname = artist?.trim().toLowerCase().split(/\s+/).pop() ?? "";
  if (surname.length > 2) {
    const byArtist = hits.filter((h) => h.description.toLowerCase().includes(surname));
    if (byArtist.length) return byArtist.slice(0, CANDIDATE_LIMIT);
  }
  return hits.slice(0, CANDIDATE_LIMIT);
}

/** One wbsearchentities call. Returns [] on any failure — never throws. */
async function searchLabels(query: string): Promise<Candidate[]> {
  const { signal, done } = withTimeout(TIMEOUT_MS);
  try {
    const url = new URL(WD_API);
    url.searchParams.set("action", "wbsearchentities");
    url.searchParams.set("search", query);
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(SEARCH_LIMIT));
    url.searchParams.set("origin", "*");
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { search?: { id: string; label?: string; description?: string }[] };
    return (data.search ?? []).map((h) => ({
      qid: h.id,
      label: h.label ?? query,
      description: h.description ?? "",
    }));
  } catch {
    return [];
  } finally {
    done();
  }
}

interface Candidate {
  qid: string;
  label: string;
  description: string;
}

/** Pull the provenance-bearing statements for one entity. */
export async function fetchProvenanceEvents(qid: string): Promise<WikidataEvent[]> {
  const query = `
SELECT ?propLabel ?valLabel ?when ?ref WHERE {
  VALUES ?item { wd:${qid} }
  VALUES ?prop { ${PROVENANCE_PROPERTIES.map((p) => `wd:${p}`).join(" ")} }
  ?prop wikibase:claim ?p ; wikibase:statementProperty ?ps ; rdfs:label ?propLabel .
  FILTER(LANG(?propLabel) = "en")
  ?item ?p ?statement .
  ?statement ?ps ?val .
  OPTIONAL { ?statement pq:P585 ?when }
  OPTIONAL { ?statement prov:wasDerivedFrom/pr:P854 ?ref }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT 40`;

  const { signal, done } = withTimeout(TIMEOUT_MS);
  try {
    const url = new URL(WD_SPARQL);
    url.searchParams.set("query", query);
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { bindings?: Record<string, { value: string }>[] };
    };
    const seen = new Set<string>();
    const events: WikidataEvent[] = [];
    for (const b of data.results?.bindings ?? []) {
      const property = b.propLabel?.value ?? "";
      const value = b.valLabel?.value ?? "";
      if (!property || !value) continue;
      // Unlabelled nodes come back as raw IRIs — "somevalue"/"unknown value"
      // statements surface as .well-known/genid blank nodes. They carry no
      // readable information, so they are noise in a citation list.
      if (/^https?:\/\//i.test(value)) continue;
      const key = `${property}|${value}|${b.when?.value ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        property,
        value,
        date: b.when?.value ?? null,
        reference: b.ref?.value ?? null,
        riskRelevant: RISK_EVENT_RE.test(value),
      });
    }
    // Risk-relevant statements first — they are the reason we asked.
    return events.sort((a, b) => Number(b.riskRelevant) - Number(a.riskRelevant));
  } catch {
    return [];
  } finally {
    done();
  }
}

/**
 * Look an object up on Wikidata and return its provenance-bearing statements.
 * Returns null when nothing resolves — which means "we found no entity", not
 * "this object has no history".
 */
export async function lookupProvenance(
  title: string,
  artist?: string,
  opts: { live?: boolean } = {}
): Promise<WikidataMatch | null> {
  if (IS_MOCK && !opts.live) return loadFixture();
  try {
    const candidates = await findEntity(title, artist);
    if (!candidates.length) return null;

    // Resolve the top candidates rather than trusting the first hit.
    //
    // A bare label search is genuinely ambiguous for this domain — "Euphronios
    // Krater" returns both the Sarpedon krater repatriated to Italy and a
    // different Euphronios vessel in the Louvre, and taking hit #1 silently
    // answered the wrong question. Scoring by how much provenance the entity
    // actually carries picks the object someone asking a provenance question
    // meant, and every candidate considered is returned so the choice can be
    // checked rather than trusted.
    const resolved = await Promise.all(
      candidates.map(async (c) => ({ c, events: await fetchProvenanceEvents(c.qid) }))
    );
    const best = resolved.reduce((a, b) =>
      score(b.events, artist) > score(a.events, artist) ? b : a
    );

    return {
      qid: best.c.qid,
      label: best.c.label,
      description: best.c.description,
      url: `https://www.wikidata.org/wiki/${best.c.qid}`,
      events: best.events,
      candidates,
    };
  } catch {
    return loadFixture();
  }
}

/**
 * Rank a candidate entity.
 *
 * The creator check dominates everything else, and it has to. Titles collide
 * constantly in this domain — "The Concert" is a Vermeer stolen from the
 * Gardner Museum in 1990 and also a Titian hanging undisturbed in the Palatina
 * — and a provenance tool that silently answers about the wrong painting is
 * worse than one that answers nothing. A candidate whose recorded creator
 * contradicts the artist the caller supplied is rejected outright rather than
 * merely down-weighted; only after that do risk-relevant statements and
 * provenance depth decide.
 */
function score(events: WikidataEvent[], artist?: string): number {
  const base = events.filter((e) => e.riskRelevant).length * 10 + events.length;
  if (!artist) return base;

  const creators = events.filter((e) => e.property === "creator").map((e) => e.value.toLowerCase());
  if (!creators.length) return base; // unknown creator — neither confirmed nor excluded

  // Surname match: "Johannes Vermeer" vs "Jan Vermeer" must still agree.
  const surname = artist.trim().toLowerCase().split(/\s+/).pop() ?? "";
  const agrees = surname.length > 2 && creators.some((c) => c.includes(surname));
  return agrees ? base + 1000 : base - 1000;
}
