/**
 * Step 2b — Stolen-art and cultural-property REGISTRY CHECKS.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE TRUSTING ANY VERDICT THIS MODULE PRODUCES.
 *
 * The registries that actually certify stolen cultural property — INTERPOL's
 * Stolen Works of Art database, the FBI's National Stolen Art File, the
 * Carabinieri TPC "Leonardo" archive, the German Lost Art Foundation — have
 * NO public API. This was checked, not assumed:
 *
 *   - INTERPOL SWOA (~52,000 objects): searchable through the ID-Art mobile
 *     app without a login, or through a database account you must apply for
 *     and have vetted by your country's INTERPOL National Central Bureau.
 *     There is no programmatic endpoint for either path.
 *   - FBI NSAF: the public search at artcrimes.fbi.gov is behind bot
 *     protection and returns 403 to any non-browser client. The open
 *     api.fbi.gov "Wanted" API does NOT contain stolen-art records — its
 *     subject filter silently ignores art crime and returns the fugitive list.
 *   - Carabinieri TPC (~1.1M objects) and lostart.de: public search forms,
 *     HTML only, no documented JSON interface.
 *   - The Art Loss Register is commercial. In this project it is the paid
 *     x402 check, not a free lookup.
 *
 * So this module does NOT pretend to search those registers. It does three
 * honest things instead, and labels which one produced each result:
 *
 *   1. `structured-api`  — genuinely queries an open structured source
 *                          (Wikidata SPARQL) for dated theft / looting /
 *                          restitution events.
 *   2. `grounded-search` — domain-scoped web search over what a registry
 *                          publishes openly. This searches the registry's
 *                          WEBSITE, which is not the same as searching its
 *                          REGISTER, and the caveat text says so.
 *   3. `referral`        — a deep link to the official search a human must
 *                          run, plus the credential-application URL where one
 *                          exists.
 *
 * THE RULE THAT MATTERS: no check in here can ever return "clear" or "not
 * stolen". The strongest negative available is `no-evidence-found`, which
 * means "nothing surfaced through the access we had". Absence of a hit in a
 * register is close to meaningless for the objects this project exists to
 * worry about — material taken from an archaeological site or under colonial
 * rule was never inventoried and never reported stolen, so it cannot be in a
 * stolen-property register in the first place. A tool that rendered that
 * absence as a clean bill of health would be actively dangerous.
 * ---------------------------------------------------------------------------
 */
import { tavilySearch, groundingAvailable } from "./tavily.js";
import { lookupProvenance, type WikidataMatch } from "./wikidata.js";

/** How we are able to reach a given registry. */
export type RegistryAccess =
  | "structured-api" // open, machine-queryable; we really query it
  | "grounded-search" // no API; we domain-scope a web search over its site
  | "referral-only" // no API and nothing usefully indexed; hand off a link
  | "paid-x402"; // commercial; the agent pays for it elsewhere in the pipeline

/**
 * What a check concluded. Note the deliberate absence of a "clear" value —
 * see the header. `no-evidence-found` is the strongest negative expressible.
 */
export type RegistryVerdict =
  | "possible-match" // something surfaced that names this object
  | "no-evidence-found" // we searched what we could reach; nothing surfaced
  | "not-queryable" // we could not search this register at all
  | "not-run"; // skipped (budget, config, or mode)

export interface RegistryHit {
  claim: string;
  sourceUrl: string;
  sourceQuote: string;
  /** Set when the hit contains explicit theft / looting / restitution language. */
  riskRelevant: boolean;
  /** ISO date or free-text year, when the source carries one. */
  date?: string | null;
}

export interface RegistryCheck {
  registryId: string;
  registry: string;
  issuer: string;
  jurisdiction: string;
  access: RegistryAccess;
  verdict: RegistryVerdict;
  /** Plain description of what was actually done, for the audit trail. */
  method: string;
  hits: RegistryHit[];
  /** Where a human runs the authoritative search themselves. */
  referralUrl: string;
  /** Where a human applies for credentialed access, where that exists. */
  applyUrl?: string;
  /** What this register covers — and what it structurally cannot. */
  coverage: string;
  /** What this verdict does and does not license the reader to conclude. */
  caveat: string;
  checkedAt: string;
}

interface RegistryDef {
  id: string;
  name: string;
  issuer: string;
  jurisdiction: string;
  access: RegistryAccess;
  /** Domains to scope a grounded search to. Empty for referral-only. */
  domains: string[];
  referralUrl: string;
  applyUrl?: string;
  coverage: string;
  /** Extra query terms that make the domain-scoped search actually land. */
  queryHint: string;
}

/**
 * The registry table. Ordered roughly by authority for the illicit-trade
 * question, which is not the same as ordered by usefulness to this tool —
 * the most authoritative registers are precisely the ones we cannot query.
 */
export const REGISTRIES: RegistryDef[] = [
  {
    id: "interpol-swoa",
    name: "INTERPOL Stolen Works of Art Database",
    issuer: "INTERPOL — Cultural Heritage Crime Unit",
    jurisdiction: "International (196 member countries)",
    access: "grounded-search",
    domains: ["interpol.int"],
    referralUrl: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/Stolen-Works-of-Art-Database",
    applyUrl:
      "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/Stolen-Works-of-Art-Database/Application-form-to-access-INTERPOL-s-Works-of-Art-Database",
    coverage:
      "The only global database of certified police information on stolen and missing cultural objects (~52,000 items). Entries come from member-country police forces, so an object only appears if a theft was reported to and recorded by a national force. Unreported and never-inventoried material — most looted archaeological and colonial-era objects — is structurally absent.",
    queryHint: "stolen works of art database notice",
  },
  {
    id: "interpol-id-art",
    name: "INTERPOL ID-Art (mobile lookup)",
    issuer: "INTERPOL — Cultural Heritage Crime Unit",
    jurisdiction: "International",
    access: "referral-only",
    domains: [],
    referralUrl: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/ID-Art-mobile-app",
    coverage:
      "The same Stolen Works of Art database, searchable by image or description from a phone with no login required. This is the fastest authoritative check a human can run on an object in front of them — and it cannot be automated, which is why it appears here as a referral rather than a result.",
    queryHint: "",
  },
  {
    id: "fbi-nsaf",
    name: "FBI National Stolen Art File",
    issuer: "US Federal Bureau of Investigation — Art Crime Team",
    jurisdiction: "United States (accepts foreign law-enforcement submissions)",
    access: "grounded-search",
    domains: ["fbi.gov"],
    referralUrl: "https://artcrimes.fbi.gov/",
    coverage:
      "Stolen art and cultural property submitted by US and foreign law-enforcement agencies. Entry requires a police report and a value threshold, so it is a record of reported thefts from documented collections, not of looting at source.",
    queryHint: "national stolen art file art theft",
  },
  {
    id: "carabinieri-tpc",
    name: "Carabinieri TPC — Leonardo database",
    issuer: "Comando Carabinieri Tutela Patrimonio Culturale (Italy)",
    jurisdiction: "Italy (largest national stolen-cultural-property archive)",
    access: "grounded-search",
    domains: ["carabinieri.it", "beniculturali.it"],
    referralUrl: "https://tpcweb.carabinieri.it/SitoPubblico/ricerca",
    coverage:
      "Over 1.1 million stolen or illicitly exported cultural objects — the largest such archive in the world, and the most important single source for Italian antiquities. Public search is a web form; the full archive is law-enforcement access.",
    queryHint: "beni culturali illecitamente sottratti furto",
  },
  {
    id: "lostart-de",
    name: "Lost Art Database",
    issuer: "German Lost Art Foundation (Deutsches Zentrum Kulturgutverluste)",
    jurisdiction: "Germany / Nazi-era spoliation, international scope",
    access: "grounded-search",
    domains: ["lostart.de", "kulturgutverluste.de", "proveana.de"],
    referralUrl: "https://www.lostart.de/en/search",
    coverage:
      "Cultural property lost, moved or seized as a result of Nazi persecution 1933–1945, plus wartime relocations. Carries both 'found' and 'search' reports. The reference register for Nazi-era provenance gaps — and irrelevant to colonial-era and archaeological looting.",
    queryHint: "Nazi-era provenance lost art report",
  },
  {
    id: "getty-provenance-index",
    name: "Getty Provenance Index",
    issuer: "Getty Research Institute",
    jurisdiction: "International (archival, 16th c. – present)",
    access: "grounded-search",
    domains: ["getty.edu"],
    referralUrl: "https://www.getty.edu/research/tools/provenance/search.html",
    coverage:
      "Transcribed auction catalogues, dealer stock books and collection inventories — the primary evidence base for reconstructing an ownership chain rather than for flagging a theft. Strongest on the European and American art market; thin outside it.",
    queryHint: "provenance index sale catalog collection inventory",
  },
  {
    id: "icom-red-lists",
    name: "ICOM Red Lists of Cultural Objects at Risk",
    issuer: "International Council of Museums",
    jurisdiction: "International (region-specific lists)",
    access: "grounded-search",
    domains: ["icom.museum", "unesco.org"],
    referralUrl: "https://icom.museum/en/resources/red-lists/",
    coverage:
      "Object CATEGORIES at risk of illicit trafficking by region — not individual objects. A Red List hit never identifies a specific piece; it says an object of this type from this region should not move without documentation. That is a due-diligence trigger, not an identification.",
    queryHint: "red list cultural objects at risk trafficking",
  },
  {
    id: "wikidata",
    name: "Wikidata (structured provenance events)",
    issuer: "Wikidata contributors — community-maintained, not an authority",
    jurisdiction: "International, open data",
    access: "structured-api",
    domains: ["wikidata.org"],
    referralUrl: "https://www.wikidata.org/",
    coverage:
      "The only openly machine-queryable source here. Its 'significant event' statements carry dated values such as archaeological looting, art theft, restitution and claim for restitution, usually with a reference URL. Coverage is uneven and edits are unreviewed, so this generates leads to verify — never findings.",
    queryHint: "",
  },
  {
    id: "art-loss-register",
    name: "Art Loss Register",
    issuer: "The Art Loss Register (commercial due-diligence registry)",
    jurisdiction: "International, commercial",
    access: "paid-x402",
    domains: ["artloss.com"],
    referralUrl: "https://www.artloss.com/",
    coverage:
      "The largest private database of stolen and looted art. Registration and search are commercial services — which is exactly why this one is the agent's paid x402 check rather than a free lookup.",
    queryHint: "art loss register stolen",
  },
];

export function getRegistries(): RegistryDef[] {
  return REGISTRIES;
}

/** Language that means a source is talking about illicit movement of an object. */
const RISK_LANGUAGE_RE =
  /(stolen|theft|stole|looted|looting|plunder|smuggl|illicit|trafficking|seized|confiscat|spoliat|restitut|repatriat|missing|recovered)/i;

/**
 * Generic art vocabulary that appears in the title of thousands of unrelated
 * objects. Matching on one of these alone is not evidence that a source is
 * about the object in hand.
 */
const GENERIC_TITLE_WORDS = new Set([
  "vase", "vessel", "bowl", "cup", "krater", "amphora", "jar", "plate", "dish",
  "portrait", "painting", "picture", "drawing", "sketch", "study", "panel",
  "statue", "statuette", "figure", "figurine", "bust", "head", "torso", "relief",
  "plaque", "mask", "stone", "marble", "marbles", "bronze", "gold", "silver",
  "collection", "museum", "gallery", "treasure", "hoard", "flowers", "flower",
  "with", "from", "the", "and", "for", "of", "self", "young", "woman", "man",
  "lady", "girl", "boy", "saint", "virgin", "madonna", "landscape", "scene",
]);

/**
 * Relevance gate: does this hit actually name the object we asked about?
 *
 * The bar is deliberately higher than "shares a word with the title". A single
 * generic word was enough to attach a UNESCO page about the Sarpedon Krater to
 * Van Gogh's "Poppy Flowers (Vase with Viscaria)" — they share "vase" — and a
 * mismatched hit under a register's name is the worst output this layer can
 * produce, because it is a looting signal pointing at the wrong object while
 * wearing a real, authoritative source URL.
 *
 * Accepted evidence, in order of strength: the artist's surname; a distinctive
 * (non-generic) word from the title; or two or more title words together.
 */
function mentionsObject(text: string, title: string, artist?: string): boolean {
  const hay = text.toLowerCase();

  if (artist) {
    const surname = artist.toLowerCase().split(/\s+/).filter((w) => w.length > 3).pop();
    if (surname && hay.includes(surname)) return true;
  }

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const distinctive = words.filter((w) => !GENERIC_TITLE_WORDS.has(w));
  if (distinctive.some((w) => hay.includes(w))) return true;

  // No distinctive term matched — fall back to requiring corroboration from
  // several generic ones rather than accepting a single coincidence.
  return words.filter((w) => hay.includes(w)).length >= 2;
}

const CAVEAT_NO_EVIDENCE =
  "No evidence surfaced through the access available. This is NOT a statement that the object is absent from this register, and it is NOT a clean bill of health — objects looted at source were never inventoried and cannot appear in a stolen-property register at all.";
const CAVEAT_POSSIBLE =
  "A source on this registry's domain names this object. This is a lead requiring human verification against the register itself, not a confirmed register entry.";
const CAVEAT_NOT_QUERYABLE =
  "This register could not be searched programmatically. Nothing about the object has been established either way — the official search below must be run by a human.";
const CAVEAT_WIKIDATA =
  "Wikidata is community-maintained and certifies nothing. Dated events here are leads to verify against the cited source, not findings.";

function nowIso(): string {
  return new Date().toISOString();
}

/** Build the referral-only record for a registry we cannot touch. */
function referralCheck(r: RegistryDef): RegistryCheck {
  return {
    registryId: r.id,
    registry: r.name,
    issuer: r.issuer,
    jurisdiction: r.jurisdiction,
    access: r.access,
    verdict: "not-queryable",
    method:
      r.access === "paid-x402"
        ? "Commercial register — reached through the agent's paid x402 check, not this free layer."
        : "No programmatic interface exists. Deep link emitted for a human to run the authoritative search.",
    hits: [],
    referralUrl: r.referralUrl,
    applyUrl: r.applyUrl,
    coverage: r.coverage,
    caveat: CAVEAT_NOT_QUERYABLE,
    checkedAt: nowIso(),
  };
}

/** Domain-scoped web search over what a registry publishes openly. */
async function groundedCheck(
  r: RegistryDef,
  title: string,
  artist: string | undefined,
  live: boolean
): Promise<RegistryCheck> {
  const query = [title, artist ?? "", r.queryHint].filter(Boolean).join(" ");
  let hits: RegistryHit[] = [];
  let failed = false;
  try {
    const facts = await tavilySearch(query, { restrictToAuthoritative: false, domains: r.domains, live });
    hits = facts
      .filter((f) => r.domains.some((d) => f.sourceUrl.includes(d)))
      .filter((f) => mentionsObject(`${f.claim} ${f.sourceQuote}`, title, artist))
      .map((f) => ({
        claim: f.claim,
        sourceUrl: f.sourceUrl,
        sourceQuote: f.sourceQuote,
        riskRelevant: RISK_LANGUAGE_RE.test(`${f.claim} ${f.sourceQuote}`),
        date: f.date,
      }))
      .slice(0, 4);
  } catch {
    failed = true;
  }

  return {
    registryId: r.id,
    registry: r.name,
    issuer: r.issuer,
    jurisdiction: r.jurisdiction,
    access: r.access,
    verdict: failed ? "not-queryable" : hits.length ? "possible-match" : "no-evidence-found",
    method: `Domain-scoped search of ${r.domains.join(", ")}. This searches the registry's public WEBSITE, not its register.`,
    hits,
    referralUrl: r.referralUrl,
    applyUrl: r.applyUrl,
    coverage: r.coverage,
    caveat: failed ? CAVEAT_NOT_QUERYABLE : hits.length ? CAVEAT_POSSIBLE : CAVEAT_NO_EVIDENCE,
    checkedAt: nowIso(),
  };
}

/** The one registry we can genuinely query: Wikidata's SPARQL endpoint. */
async function wikidataCheck(
  r: RegistryDef,
  title: string,
  artist: string | undefined,
  live: boolean
): Promise<RegistryCheck> {
  let match: WikidataMatch | null = null;
  try {
    match = await lookupProvenance(title, artist, { live });
  } catch {
    match = null;
  }

  if (!match) {
    return {
      ...referralCheck(r),
      verdict: "no-evidence-found",
      method: "Wikidata entity search + SPARQL over significant-event, collection and origin statements. No entity resolved.",
      caveat: CAVEAT_NO_EVIDENCE,
    };
  }

  const hits: RegistryHit[] = match.events.map((e) => ({
    claim: `${e.property}: ${e.value}${e.date ? ` (${e.date.slice(0, 10)})` : ""}`,
    sourceUrl: e.reference ?? match!.url,
    sourceQuote: `${match!.label} — ${match!.description || "Wikidata entity"} · ${e.property} = ${e.value}`,
    riskRelevant: e.riskRelevant,
    date: e.date,
  }));

  return {
    registryId: r.id,
    registry: r.name,
    issuer: r.issuer,
    jurisdiction: r.jurisdiction,
    access: r.access,
    verdict: hits.some((h) => h.riskRelevant)
      ? "possible-match"
      : hits.length
        ? "no-evidence-found"
        : "no-evidence-found",
    method:
      `SPARQL over ${match.qid} (${match.label}) — significant-event (P793), collection (P195), origin (P495), discovery (P189). ` +
      `Chosen from ${match.candidates.length} label-search candidate(s): ${match.candidates
        .map((c) => `${c.qid} ${c.label}`)
        .join("; ")}. Entity resolution is shown so the choice can be audited rather than trusted.`,
    hits,
    referralUrl: match.url,
    coverage: r.coverage,
    caveat: CAVEAT_WIKIDATA,
    checkedAt: nowIso(),
  };
}

export interface RegistrySummary {
  checks: RegistryCheck[];
  /** Registries where something naming this object surfaced. */
  possibleMatches: number;
  /** Registries that could not be searched at all — the honesty counter. */
  notQueryable: number;
  /** Hits carrying explicit theft / looting / restitution language. */
  riskRelevantHits: RegistryHit[];
}

/**
 * Run every registry check for one object.
 *
 * Checks run concurrently and each one is independently fault-tolerant: a
 * registry that errors is recorded as `not-queryable`, never dropped. A
 * silently missing check would read as a check that passed.
 */
export async function checkRegistries(
  title: string,
  artist?: string,
  opts: { only?: string[]; live?: boolean } = {}
): Promise<RegistrySummary> {
  const live = Boolean(opts.live);
  const wanted = opts.only?.length
    ? REGISTRIES.filter((r) => opts.only!.includes(r.id))
    : REGISTRIES;

  const checks = await Promise.all(
    wanted.map(async (r) => {
      try {
        if (r.access === "referral-only" || r.access === "paid-x402") return referralCheck(r);
        if (r.id === "wikidata") return await wikidataCheck(r, title, artist, live);
        if (!groundingAvailable(live)) {
          // No live search (mock mode, or no Tavily key). Emit the referral
          // rather than a fabricated negative: a search that never ran must
          // never be recorded as a search that found nothing.
          return {
            ...referralCheck(r),
            method: `Not searched — no live grounding available (DEMO_MODE=mock or TAVILY_API_KEY unset). Referral emitted instead of a fabricated negative.`,
          };
        }
        return await groundedCheck(r, title, artist, live);
      } catch {
        return referralCheck(r);
      }
    })
  );

  return {
    checks,
    possibleMatches: checks.filter((c) => c.verdict === "possible-match").length,
    notQueryable: checks.filter((c) => c.verdict === "not-queryable").length,
    riskRelevantHits: checks.flatMap((c) => c.hits.filter((h) => h.riskRelevant)),
  };
}
