/**
 * Build the stolen-art watchlist into fixtures/stolen-watchlist.json.
 *
 *   npm run build:watchlist            # default 400 rows
 *   npm run build:watchlist -- --limit 800
 *
 * WHAT THIS IS. A list of works that Wikidata records as having been stolen or
 * plundered — `significant event` (P793) resolving under `art theft`
 * (Q1756454), which subsumes Nazi plunder — each with the date, creator and
 * collections Wikidata holds for it.
 *
 * WHAT THIS IS NOT. An extract from INTERPOL's Stolen Works of Art database or
 * the FBI's National Stolen Art File. Neither can be queried; see the header of
 * src/tools/registries.ts. Nothing here is certified police information, and an
 * entry is a lead to check against the official registers, not a register hit.
 * Presenting it as the latter is the exact failure this project exists to
 * avoid, so every row carries `source: "wikidata"` and the UI says so.
 *
 * The inverse error matters just as much: absence from this list means nothing.
 * It is not a register, it is uneven community data, and the objects this
 * project cares about most — looted at source, never inventoried — are the ones
 * least likely to appear.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../fixtures/stolen-watchlist.json");
const SPARQL = "https://query.wikidata.org/sparql";
const UA = "arts-provenance-agent/0.1 (https://github.com/Ethical-Tech-CoLab/arts-provenance-agent)";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 400;

/**
 * Constrained to works of art on purpose. The unconstrained form of this query
 * returns people and companies too — Nazi-era spoliation records attach theft
 * events to the dispossessed as well as to the objects — and a watchlist of
 * artworks that silently contains victims' names is both wrong and grotesque.
 *
 * The `P31?` step in the event path is load-bearing. Named theft incidents —
 * "Isabella Stewart Gardner Museum theft" — are INSTANCES of art theft, not
 * subclasses of it, so walking the subclass tree alone silently dropped every
 * object stolen in a named heist. That included Vermeer's The Concert, which is
 * about the most famous stolen painting there is. A `UNION` of the two paths
 * expresses the same thing but times out against Wikidata's 60s limit.
 */
const QUERY = `
SELECT ?item ?itemLabel ?desc ?creatorLabel (SAMPLE(?when) AS ?theftDate)
       (GROUP_CONCAT(DISTINCT ?collLabel; separator=" | ") AS ?collections)
       (GROUP_CONCAT(DISTINCT ?evLabel;   separator=" | ") AS ?events)
       (SAMPLE(?countryLabel) AS ?country) WHERE {
  ?item wdt:P31/wdt:P279* wd:Q838948 .
  ?item wdt:P793 ?theft . ?theft wdt:P31?/wdt:P279* wd:Q1756454 .
  ?item p:P793 ?st . ?st ps:P793 ?theft . OPTIONAL { ?st pq:P585 ?when }
  ?item wdt:P170 ?creator .
  OPTIONAL { ?item wdt:P195 ?coll . ?coll rdfs:label ?collLabel . FILTER(LANG(?collLabel) = "en") }
  OPTIONAL { ?item wdt:P793 ?ev2 . ?ev2 rdfs:label ?evLabel . FILTER(LANG(?evLabel) = "en") }
  OPTIONAL { ?item wdt:P17 ?c . ?c rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en") }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
GROUP BY ?item ?itemLabel ?desc ?creatorLabel
LIMIT ${LIMIT}`;

/** Events implying the object came back. Everything else stays outstanding. */
const RESOLVED_RE = /(restitut|recover|discover|return)/i;
/** An unlabelled entity surfaces as its bare QID — unusable in a UI. */
const IS_QID = /^Q\d+$/;

export interface WatchlistEntry {
  qid: string;
  title: string;
  artist: string;
  description: string;
  /**
   * The date Wikidata attaches to the theft/plunder statement. Read it with
   * care: some records — German Lost Art reports especially — carry the
   * RESTITUTION date on the same statement, so a 2025 value on a Nazi-plunder
   * event is a return, not a theft. Calling this field `theftDate` asserted
   * something the data does not support.
   */
  eventDate: string | null;
  collections: string[];
  events: string[];
  country: string | null;
  /** "outstanding" = no recovery/restitution event recorded. Not "still missing". */
  status: "outstanding" | "resolved";
  /** Always "wikidata". Present so no consumer can mistake this for a register. */
  source: "wikidata";
  url: string;
}

const res = await fetch(`${SPARQL}?query=${encodeURIComponent(QUERY)}`, {
  headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
});
if (!res.ok) throw new Error(`Wikidata returned ${res.status}`);

const bindings = ((await res.json()) as any).results?.bindings ?? [];
const val = (r: any, k: string): string => r[k]?.value ?? "";

const entries: WatchlistEntry[] = [];
let skipped = 0;

for (const r of bindings) {
  const title = val(r, "itemLabel");
  const artist = val(r, "creatorLabel");
  // Rows whose label never resolved past the QID are dropped rather than shown
  // as "Q60388822" — an identifier is not an identification.
  // Unlabelled entities surface either as a bare QID or, for blank nodes, as a
  // raw wikidata.org IRI. Neither is a name.
  if (!title || IS_QID.test(title) || IS_QID.test(artist) || /^https?:\/\//.test(artist)) {
    skipped++;
    continue;
  }
  const events = val(r, "events").split(" | ").filter(Boolean);
  const eventDate = val(r, "theftDate") || null;
  entries.push({
    qid: val(r, "item").replace("http://www.wikidata.org/entity/", ""),
    title,
    artist,
    description: val(r, "desc"),
    eventDate: eventDate ? eventDate.slice(0, 10) : null,
    collections: val(r, "collections").split(" | ").filter(Boolean),
    events,
    country: val(r, "country") || null,
    status: events.some((e) => RESOLVED_RE.test(e)) ? "resolved" : "outstanding",
    source: "wikidata",
    url: val(r, "item"),
  });
}

// Dated entries first, most recent first. Undated entries keep a stable
// alphabetical tail rather than an arbitrary one, so rebuilds diff cleanly.
entries.sort((a, b) => {
  if (a.eventDate && b.eventDate) return b.eventDate.localeCompare(a.eventDate);
  if (a.eventDate) return -1;
  if (b.eventDate) return 1;
  return a.title.localeCompare(b.title);
});

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedFrom: "Wikidata SPARQL — P793 significant event under Q1756454 (art theft)",
      caveat:
        "Dates are whatever Wikidata attaches to the theft statement and are sometimes the restitution date rather than the theft date — check before relying on one. Community-maintained data, not certified police information. Not an extract from INTERPOL's Stolen Works of Art database or the FBI's National Stolen Art File — neither is machine-queryable. Every entry is a lead to verify against the official registers, and absence from this list means nothing.",
      officialSearches: {
        interpol: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/Stolen-Works-of-Art-Database",
        interpolIdArt: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/ID-Art-mobile-app",
        fbiNsaf: "https://artcrimes.fbi.gov/",
        carabinieriTpc: "https://tpcweb.carabinieri.it/SitoPubblico/ricerca",
        lostArt: "https://www.lostart.de/en/search",
      },
      count: entries.length,
      entries,
    },
    null,
    2
  )
);

const outstanding = entries.filter((e) => e.status === "outstanding").length;
console.log(`Wrote ${entries.length} entries to fixtures/stolen-watchlist.json`);
console.log(`  ${outstanding} outstanding · ${entries.length - outstanding} resolved · ${skipped} unlabelled rows dropped`);
