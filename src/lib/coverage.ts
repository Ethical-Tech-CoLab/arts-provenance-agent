/**
 * Evidence coverage — what the registers could have told us about THIS object.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES.
 *
 * The confidence score is, mechanically, a count of how much published evidence
 * the tool managed to find. That is a fair proxy for provenance confidence
 * where the documentary record is dense, and it is close to meaningless where
 * it is not — and the density varies enormously by exactly the axis that
 * matters here.
 *
 * A Dutch painting sits inside a thick apparatus: auction catalogues, dealer
 * stock books, the Getty Provenance Index, Nazi-era provenance research. When
 * the tool finds a hole there, the hole is itself evidence, because records
 * ought to exist. That is absence WITHIN coverage.
 *
 * A Cambodian temple sculpture was never accessioned, never catalogued and
 * never reported stolen, because no institution was in a position to report it.
 * It cannot appear in a stolen-property register at all. Finding nothing says
 * nothing. That is absence OF coverage.
 *
 * Both produce the same low number. The number cannot distinguish them, so
 * something alongside it has to.
 *
 * WHAT THIS MODULE DOES. For each register it records what kinds of loss that
 * register can hold, for which regions, and whether it can identify an
 * individual object at all. Given an object, it reports how many registers
 * could systematically have named it — and therefore whether a quiet result is
 * informative or merely uninformed.
 *
 * WHAT IT DOES NOT DO. It never adjusts the confidence score. Folding coverage
 * into the score would produce one number meaning two things again, which is
 * the defect being fixed. Coverage is reported beside the score, and the score
 * is declared comparable only to other objects in the same coverage class.
 * ---------------------------------------------------------------------------
 */

/** How an object is alleged to have left its place of origin. */
export type AcquisitionMode =
  | "archaeological" // removed from a site; never inventoried
  | "colonial" // taken under colonial administration or military action
  | "nazi-era" // seized or forced-sold 1933–45
  | "market-theft" // stolen from a documented collection
  | "market" // ordinary market history, no alleged loss
  | "unknown";

/**
 * What a register can hold.
 *
 * `identifying` is the field that does the real work. ICOM's Red Lists cover
 * precisely the regions the other registers miss, but they list object
 * CATEGORIES at risk, never individual objects. A Red List can say "Khmer
 * sculpture of this type should not move without documentation"; it can never
 * say "this sculpture is stolen". Counting it as coverage would manufacture
 * reassurance for exactly the material that has none.
 */
interface RegisterScope {
  id: string;
  name: string;
  holds: AcquisitionMode[];
  /** Countries/regions in scope, lowercase; "global" for no geographic limit. */
  regions: "global" | string[];
  /** Can it name an individual object, or only a category? */
  identifying: boolean;
  /**
   * Systematic registers admit material by rule. Opportunistic ones cover
   * whatever happens to have attracted attention, so their silence carries far
   * less information.
   */
  systematic: boolean;
  /** The precondition for an object to be in here at all. */
  requires: string;
}

export const REGISTER_SCOPES: RegisterScope[] = [
  {
    id: "interpol-swoa",
    name: "INTERPOL Stolen Works of Art",
    holds: ["market-theft", "archaeological"],
    regions: "global",
    identifying: true,
    systematic: true,
    requires: "a theft reported to and recorded by a member-country police force",
  },
  {
    id: "interpol-id-art",
    name: "INTERPOL ID-Art",
    holds: ["market-theft", "archaeological"],
    regions: "global",
    identifying: true,
    systematic: true,
    requires: "the same police report as the Stolen Works of Art database",
  },
  {
    id: "fbi-nsaf",
    name: "FBI National Stolen Art File",
    holds: ["market-theft"],
    regions: "global",
    identifying: true,
    systematic: true,
    requires: "a law-enforcement submission and a value threshold",
  },
  {
    id: "carabinieri-tpc",
    name: "Carabinieri TPC",
    holds: ["market-theft", "archaeological"],
    regions: ["italy"],
    identifying: true,
    systematic: true,
    requires: "an Italian nexus — the archive is national",
  },
  {
    id: "lostart-de",
    name: "Lost Art Database",
    holds: ["nazi-era"],
    regions: ["germany", "austria", "france", "netherlands", "poland", "italy", "belgium", "czechia", "hungary"],
    identifying: true,
    systematic: true,
    requires: "a loss connected to Nazi persecution, 1933–45",
  },
  {
    id: "getty-provenance-index",
    name: "Getty Provenance Index",
    holds: ["market", "market-theft", "nazi-era"],
    regions: ["united kingdom", "france", "germany", "austria", "netherlands", "belgium", "italy", "spain", "united states", "switzerland"],
    identifying: true,
    systematic: true,
    requires: "passage through the European or American art market",
  },
  {
    id: "art-loss-register",
    name: "Art Loss Register",
    holds: ["market-theft", "nazi-era"],
    regions: "global",
    identifying: true,
    systematic: true,
    requires: "a registered loss, usually by an owner or insurer",
  },
  {
    id: "icom-red-lists",
    name: "ICOM Red Lists",
    holds: ["archaeological", "colonial"],
    regions: "global",
    identifying: false, // categories at risk, never individual objects
    systematic: true,
    requires: "membership of an at-risk object category from a listed region",
  },
  {
    id: "wikidata",
    name: "Wikidata",
    holds: ["archaeological", "colonial", "nazi-era", "market-theft", "market"],
    regions: "global",
    identifying: true,
    systematic: false, // coverage follows scholarly and news attention
    requires: "someone having written the object up",
  },
];

export type CoverageClass = "well-covered" | "partially-covered" | "structurally-uncovered";

export interface CoverageResult {
  acquisitionMode: AcquisitionMode;
  region: string | null;
  /** Registers that could systematically name this object. */
  identifyingRegisters: { id: string; name: string; requires: string }[];
  /** Applicable, but category-level or attention-driven only. */
  weakRegisters: { id: string; name: string; why: string }[];
  /** Registers that structurally cannot hold this object, and why. */
  blindRegisters: { id: string; name: string; why: string }[];
  coverageClass: CoverageClass;
  /** identifying / total registers, for a meter. Not a probability. */
  coverageRatio: number;
  /** What a quiet result from this set of registers is worth. */
  note: string;
  /** Scores are only comparable to other objects in the same class. */
  comparability: string;
}

const MODE_PATTERNS: { mode: AcquisitionMode; re: RegExp }[] = [
  { mode: "nazi-era", re: /(nazi|aryanis|aryaniz|spoliat|1933|1938|1941|reichs|gurlitt|forced sale)/i },
  { mode: "colonial", re: /(colonial|punitive expedition|maqdala|benin 1897|sacked|spoils of war|firman|partage|protectorate)/i },
  { mode: "archaeological", re: /(excavat|tomb|tombaroli|looted from|archaeolog|temple|pedestal|site|clandestine dig|necropolis|tumul)/i },
  { mode: "market-theft", re: /(stolen|theft|heist|burglar|robbed|cut from its frame)/i },
];

/** Regions the Nazi-era and Getty registers actually reach. */
const WESTERN_MARKET = new Set([
  "united kingdom", "france", "germany", "austria", "netherlands", "belgium",
  "spain", "united states", "switzerland", "italy", "poland", "czechia", "hungary",
]);

function detectMode(corpus: string, hint?: AcquisitionMode): AcquisitionMode {
  if (hint && hint !== "unknown") return hint;
  for (const { mode, re } of MODE_PATTERNS) if (re.test(corpus)) return mode;
  return "unknown";
}

function inScope(scope: RegisterScope, region: string | null): boolean {
  if (scope.regions === "global") return true;
  if (!region) return false;
  return scope.regions.includes(region.toLowerCase());
}

export interface CoverageInput {
  /** Country or culture of origin, free text. */
  region?: string | null;
  /** Text to sniff the acquisition mode from — history, flags, sources. */
  corpus?: string;
  /** Explicit mode, when the caller already knows it (catalog objects do). */
  mode?: AcquisitionMode;
}

/**
 * Work out how much of the evidence space could have covered this object.
 *
 * Deliberately conservative in one direction: when the acquisition mode cannot
 * be determined, every register is treated as potentially applicable, which
 * makes coverage look BETTER than it is. An unknown-mode object therefore never
 * gets an alarming "structurally uncovered" badge it may not deserve — the
 * badge is reserved for cases the model can actually justify.
 */
export function assessCoverage(input: CoverageInput): CoverageResult {
  const corpus = `${input.corpus ?? ""} ${input.region ?? ""}`.toLowerCase();
  const mode = detectMode(corpus, input.mode);
  const region = input.region?.toLowerCase().trim() || null;

  const identifying: CoverageResult["identifyingRegisters"] = [];
  const weak: CoverageResult["weakRegisters"] = [];
  const blind: CoverageResult["blindRegisters"] = [];

  for (const s of REGISTER_SCOPES) {
    const modeOk = mode === "unknown" || s.holds.includes(mode);
    const regionOk = inScope(s, region);

    if (!modeOk) {
      blind.push({ id: s.id, name: s.name, why: `Holds ${s.holds.join(", ")} losses; requires ${s.requires}.` });
      continue;
    }
    if (!regionOk) {
      blind.push({ id: s.id, name: s.name, why: `Geographically out of scope${region ? ` for ${region}` : ""} — requires ${s.requires}.` });
      continue;
    }
    if (!s.identifying) {
      weak.push({ id: s.id, name: s.name, why: "Lists object categories at risk, never individual objects — a due-diligence trigger, not an identification." });
      continue;
    }
    if (!s.systematic) {
      weak.push({ id: s.id, name: s.name, why: "Coverage follows scholarly and press attention rather than rule, so its silence carries little information." });
      continue;
    }
    identifying.push({ id: s.id, name: s.name, requires: s.requires });
  }

  const n = identifying.length;
  const coverageClass: CoverageClass =
    n >= 3 ? "well-covered" : n >= 1 ? "partially-covered" : "structurally-uncovered";

  const note =
    n === 0
      ? "No register in this set can systematically name an object of this kind and origin. A quiet result here carries essentially no information about the object — it reflects where the registers look, not what happened. The strongest evidence for material like this is usually physical or archaeological, and this tool cannot see it."
      : n < 3
        ? `Only ${n} of ${REGISTER_SCOPES.length} registers could systematically name this object. A quiet result is weak evidence, not reassurance.`
        : `${n} of ${REGISTER_SCOPES.length} registers could systematically name this object. Silence here is comparatively informative: records would be expected to exist.`;

  const comparability =
    `This score is comparable only to other ${coverageClass.replace("-", " ")} objects. ` +
    (coverageClass === "structurally-uncovered"
      ? "It must not be read against a well-covered Western-market object: the same number means 'nothing was reachable' here and 'a documented gap was found' there."
      : coverageClass === "partially-covered"
        ? "Comparison against a well-covered object will overstate how much was actually checked."
        : "Comparison against a structurally uncovered object will understate how little was checked there.");

  return {
    acquisitionMode: mode,
    region,
    identifyingRegisters: identifying,
    weakRegisters: weak,
    blindRegisters: blind,
    coverageClass,
    coverageRatio: Number((n / REGISTER_SCOPES.length).toFixed(2)),
    note,
    comparability,
  };
}

/** True when a low score means "we could not look", not "we looked and found a hole". */
export function scoreIsUninformative(c: CoverageResult): boolean {
  return c.coverageClass === "structurally-uncovered";
}

/** Region hints for the fourteen source countries the scorer already knows. */
export const SOURCE_COUNTRY_REGIONS = new Set([
  "italy", "greece", "egypt", "turkey", "cambodia", "china", "iraq",
  "peru", "mexico", "nigeria", "india", "syria", "cyprus", "thailand",
]);

export { WESTERN_MARKET };
