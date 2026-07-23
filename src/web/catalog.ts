/**
 * Seed catalog of tracked objects. These power the dashboard out-of-the-box
 * ("you should have a few already") with rich tracing data: a provenance
 * journey (where the object has physically been), repatriation status, risk
 * score, red flags, and cited sources. Real, well-documented cases.
 */
import { privateKeyToAccount } from "viem/accounts";
import type { RedFlag } from "../lib/schema.js";
import { signCredential, addressToDid, type VerifiableCredential } from "../lib/signing.js";
import { signingKey } from "./pipeline.js";
import { checkRegistries, type RegistrySummary } from "../tools/registries.js";

export type JourneyType =
  | "origin"
  | "excavation"
  | "looting"
  | "sale"
  | "museum"
  | "repatriation"
  | "contested";

export interface JourneyStop {
  year: string;
  place: string;
  country: string;
  event: string;
  type: JourneyType;
}

/**
 * `settled` is not decoration. A case where the parties reached terms and title
 * moved by agreement — Portrait of Wally, the Sevso Treasure — is neither
 * "contested" (it is over) nor "repatriated" (the object often stayed put) nor
 * "clear" (there was a seizure in the chain). Collapsing it into any of the
 * other three misrepresents the outcome in a way a buyer would care about.
 */
export type RepatriationStatus = "repatriated" | "contested" | "settled" | "clear";

export interface CatalogObject {
  id: string;
  title: string;
  artist?: string;
  culture?: string;
  period?: string;
  icon: string; // emoji tile, used when there is no photograph
  accent: string; // gradient accent hex
  /**
   * A freely licensed photograph OF THIS OBJECT, downloaded into public/objects/
   * rather than hotlinked, with the attribution its licence requires.
   *
   * Optional on purpose, and the gaps are the interesting part. Two objects have
   * no entry — the Koh Ker Duryodhana and the Bingham Machu Picchu material —
   * because no freely licensed photograph of either could be found. A picture of
   * a different statue from the same temple, or of the site the material was dug
   * out of, would be a caption error of exactly the kind this project exists to
   * warn about, so those two keep the emoji tile instead.
   */
  image?: {
    /** Path under public/, e.g. "objects/rosetta-stone.jpg". */
    file: string;
    /** Photographer or author, as Commons records them. Shown, not stored only. */
    credit: string;
    /** e.g. "CC BY-SA 4.0" or "Public domain". */
    license: string;
    licenseUrl: string;
    /** The Commons file page — where the licence can be checked. */
    source: string;
  };
  currentLocation: { institution: string; city: string; country: string };
  riskScore: number; // 0–100 (higher = cleaner)
  riskLevel: "low" | "medium" | "high";
  redFlags: RedFlag[];
  repatriation: { status: RepatriationStatus; claimant?: string; year?: string; note: string };
  journey: JourneyStop[];
  sources: { title: string; url: string; issuer: string }[];
  estimatedMarketValueUSD?: number;
}

export const CATALOG: CatalogObject[] = [
  {
    id: "euphronios-krater",
    title: "Euphronios Krater",
    artist: "Painted by Euphronios; potted by Euxitheos",
    culture: "Ancient Greek (Attic red-figure)",
    period: "c. 515 BCE",
    icon: "🏺",
    accent: "#c0563e",
    image: {
      file: "objects/euphronios-krater.jpg",
      credit: "Sailko",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0",
      source: "https://commons.wikimedia.org/wiki/File:Eufronio,_cratere_modellato_da_euxitheos_con_morte_di_sarpedone,_520-510_ac_ca.,_dalla_necropoli_di_greppe_sant%27angelo_01.jpg",
    },
    currentLocation: { institution: "Museo Nazionale Etrusco", city: "Rome", country: "Italy" },
    riskScore: 12,
    riskLevel: "high",
    redFlags: [
      { type: "looting-signal", severity: "high", evidence: "Illegally excavated by tombaroli from an Etruscan tomb near Cerveteri in 1971." },
      { type: "provenance-gap", severity: "high", evidence: "No documented ownership before its 1971 market appearance." },
      { type: "source-country-origin", severity: "medium", evidence: "Italy — a UNESCO 1970 source country with active restitution claims." },
    ],
    repatriation: { status: "repatriated", claimant: "Italy", year: "2008", note: "Returned by the Met to Italy in 2008 after a long legal dispute." },
    journey: [
      { year: "c. 515 BCE", place: "Athens", country: "Greece", event: "Created in an Athenian workshop", type: "origin" },
      { year: "Antiquity", place: "Cerveteri", country: "Italy", event: "Buried in an Etruscan tomb", type: "origin" },
      { year: "1971", place: "Cerveteri", country: "Italy", event: "Looted by tombaroli", type: "looting" },
      { year: "1971–72", place: "Zurich", country: "Switzerland", event: "Passed through dealer Robert Hecht", type: "sale" },
      { year: "1972", place: "New York", country: "United States", event: "Acquired by the Met for $1M", type: "museum" },
      { year: "2008", place: "Rome", country: "Italy", event: "Repatriated to Italy", type: "repatriation" },
    ],
    sources: [
      { title: "The Met — deaccession & return history", url: "https://www.metmuseum.org", issuer: "The Metropolitan Museum of Art" },
      { title: "UNESCO 1970 Convention", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
    ],
    estimatedMarketValueUSD: 250000,
  },
  {
    id: "benin-bronze-plaque",
    title: "Benin Bronze Plaque",
    culture: "Edo (Kingdom of Benin)",
    period: "16th–17th c.",
    icon: "🛡️",
    accent: "#9a7b3f",
    image: {
      file: "objects/benin-bronze-plaque.jpg",
      credit: "en:User:Warofdreams",
      license: "CC BY-SA 3.0",
      licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
      source: "https://commons.wikimedia.org/wiki/File:Benin_Bronzes.jpg",
    },
    currentLocation: { institution: "British Museum", city: "London", country: "United Kingdom" },
    riskScore: 18,
    riskLevel: "high",
    redFlags: [
      { type: "looting-signal", severity: "high", evidence: "Seized during the 1897 British punitive expedition that sacked Benin City." },
      { type: "colonial-acquisition", severity: "high", evidence: "Taken as spoils of war; no consent of origin community." },
    ],
    repatriation: { status: "contested", claimant: "Nigeria", note: "Active restitution claims; some institutions have begun returns, the British Museum has not." },
    journey: [
      { year: "16th c.", place: "Benin City", country: "Nigeria", event: "Cast for the royal palace", type: "origin" },
      { year: "1897", place: "Benin City", country: "Nigeria", event: "Looted in the punitive expedition", type: "looting" },
      { year: "1898", place: "London", country: "United Kingdom", event: "Entered the British Museum", type: "museum" },
      { year: "Present", place: "London", country: "United Kingdom", event: "Contested by Nigeria", type: "contested" },
    ],
    sources: [
      { title: "Digital Benin — provenance project", url: "https://digitalbenin.org", issuer: "Digital Benin" },
      { title: "ICOM red list — Africa", url: "https://icom.museum", issuer: "ICOM" },
    ],
  },
  {
    id: "rosetta-stone",
    title: "Rosetta Stone",
    culture: "Ptolemaic Egypt",
    period: "196 BCE",
    icon: "🪨",
    accent: "#5a6b7a",
    image: {
      file: "objects/rosetta-stone.jpg",
      credit: "Awikimate",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      source: "https://commons.wikimedia.org/wiki/File:Rosetta_Stone_-_front_face_-_corrected_image.jpg",
    },
    currentLocation: { institution: "British Museum", city: "London", country: "United Kingdom" },
    riskScore: 34,
    riskLevel: "medium",
    redFlags: [
      { type: "wartime-seizure", severity: "high", evidence: "Ceded to Britain under the 1801 Capitulation of Alexandria after French defeat." },
      { type: "source-country-origin", severity: "medium", evidence: "Egypt has repeatedly requested its return." },
    ],
    repatriation: { status: "contested", claimant: "Egypt", note: "Egypt has formally requested repatriation; the British Museum retains it." },
    journey: [
      { year: "196 BCE", place: "Memphis", country: "Egypt", event: "Decree inscribed", type: "origin" },
      { year: "1799", place: "Rosetta (Rashid)", country: "Egypt", event: "Found by French soldiers", type: "excavation" },
      { year: "1801", place: "Alexandria", country: "Egypt", event: "Seized by British forces", type: "looting" },
      { year: "1802", place: "London", country: "United Kingdom", event: "Entered the British Museum", type: "museum" },
      { year: "Present", place: "London", country: "United Kingdom", event: "Contested by Egypt", type: "contested" },
    ],
    sources: [
      { title: "British Museum — object record", url: "https://www.britishmuseum.org", issuer: "British Museum" },
      { title: "UNESCO 1970 Convention", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
    ],
  },
  {
    id: "lydian-hoard",
    title: "Lydian Hoard (Karun Treasure)",
    culture: "Lydian / Achaemenid",
    period: "c. 7th–6th c. BCE",
    icon: "💰",
    accent: "#b08d2e",
    image: {
      file: "objects/lydian-hoard.jpg",
      credit: "Dosseman",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      source: "https://commons.wikimedia.org/wiki/File:U%C5%9Fak_Museum_Karun_Treasure_gold_bracelet_2162.jpg",
    },
    currentLocation: { institution: "Uşak Museum", city: "Uşak", country: "Turkey" },
    riskScore: 22,
    riskLevel: "high",
    redFlags: [
      { type: "looting-signal", severity: "high", evidence: "Looted from tumuli in the Uşak region of western Turkey in the 1960s." },
      { type: "concealment", severity: "high", evidence: "The Met held the pieces in storage and obscured their origin for years." },
    ],
    repatriation: { status: "repatriated", claimant: "Turkey", year: "1993", note: "Returned by the Met to Turkey in 1993 after litigation." },
    journey: [
      { year: "c. 6th c. BCE", place: "Lydia (Uşak)", country: "Turkey", event: "Interred in burial tumuli", type: "origin" },
      { year: "1960s", place: "Uşak", country: "Turkey", event: "Looted from tombs", type: "looting" },
      { year: "1966–70", place: "New York", country: "United States", event: "Acquired by the Met", type: "museum" },
      { year: "1993", place: "Uşak", country: "Turkey", event: "Repatriated to Turkey", type: "repatriation" },
    ],
    sources: [
      { title: "The Met — return history", url: "https://www.metmuseum.org", issuer: "The Metropolitan Museum of Art" },
      { title: "ICOM red list", url: "https://icom.museum", issuer: "ICOM" },
    ],
  },
  {
    id: "madame-x",
    title: "Madame X (Madame Pierre Gautreau)",
    artist: "John Singer Sargent",
    culture: "American / French",
    period: "1883–84",
    icon: "🖼️",
    accent: "#3f6f8a",
    image: {
      file: "objects/madame-x.jpg",
      credit: "John Singer Sargent",
      license: "Public domain",
      licenseUrl: "",
      source: "https://commons.wikimedia.org/wiki/File:Sargent_MadameX.jpeg",
    },
    currentLocation: { institution: "The Metropolitan Museum of Art", city: "New York", country: "United States" },
    riskScore: 93,
    riskLevel: "low",
    redFlags: [],
    repatriation: { status: "clear", note: "Continuous, documented ownership; acquired from the artist. No outstanding claims." },
    journey: [
      { year: "1884", place: "Paris", country: "France", event: "Exhibited at the Paris Salon", type: "origin" },
      { year: "1884–1916", place: "Paris", country: "France", event: "Retained in the artist's studio", type: "sale" },
      { year: "1916", place: "New York", country: "United States", event: "Purchased by the Met from Sargent", type: "museum" },
    ],
    sources: [
      { title: "The Met — collection record", url: "https://www.metmuseum.org/art/collection", issuer: "The Metropolitan Museum of Art" },
    ],
  },

  // --- Nazi-era spoliation ---------------------------------------------------
  // These two are the cases the Lost Art Database exists for, and they show the
  // two distinct endings such claims have: restitution to the heirs, and a
  // negotiated settlement in which the object does not move.
  {
    id: "adele-bloch-bauer-i",
    title: "Portrait of Adele Bloch-Bauer I",
    artist: "Gustav Klimt",
    culture: "Austrian (Vienna Secession)",
    period: "1907",
    icon: "👗",
    accent: "#c9a227",
    image: {
      file: "objects/adele-bloch-bauer-i.jpg",
      credit: "Gustav Klimt",
      license: "Public domain",
      licenseUrl: "",
      source: "https://commons.wikimedia.org/wiki/File:Gustav_Klimt,_1907,_Adele_Bloch-Bauer_I,_Neue_Galerie_New_York.jpg",
    },
    currentLocation: { institution: "Neue Galerie", city: "New York", country: "United States" },
    riskScore: 74,
    riskLevel: "medium",
    redFlags: [
      { type: "nazi-era-seizure", severity: "high", evidence: "The Bloch-Bauer estate was seized after the 1938 Anschluss; the painting passed to the Austrian Gallery Belvedere, which held it for close to six decades." },
      { type: "contested-title-resolved", severity: "low", evidence: "Title was disputed until an Austrian arbitration panel ruled for the heirs in 2006. The gap is documented, not open." },
    ],
    repatriation: {
      status: "repatriated",
      claimant: "Maria Altmann and the Bloch-Bauer heirs",
      year: "2006",
      note: "After Altmann v. Republic of Austria reached the US Supreme Court in 2004, an Austrian arbitration panel awarded the painting to the heirs in January 2006. It was sold to Ronald Lauder for the Neue Galerie for a reported $135M — then the highest price paid for a painting.",
    },
    journey: [
      { year: "1907", place: "Vienna", country: "Austria", event: "Painted on commission from Ferdinand Bloch-Bauer", type: "origin" },
      { year: "1938", place: "Vienna", country: "Austria", event: "Bloch-Bauer assets seized after the Anschluss; the family flees", type: "looting" },
      { year: "1941", place: "Vienna", country: "Austria", event: "Enters the Austrian Gallery Belvedere", type: "museum" },
      { year: "1998–2005", place: "Vienna", country: "Austria", event: "Restitution claim; litigation reaches the US Supreme Court in 2004", type: "contested" },
      { year: "2006", place: "Vienna", country: "Austria", event: "Arbitration panel awards the painting to the heirs", type: "repatriation" },
      { year: "2006", place: "New York", country: "United States", event: "Acquired for the Neue Galerie", type: "museum" },
    ],
    sources: [
      { title: "Lost Art Database — Nazi-era spoliation register", url: "https://www.lostart.de/en/search", issuer: "German Lost Art Foundation" },
      { title: "Neue Galerie — collection", url: "https://www.neuegalerie.org", issuer: "Neue Galerie New York" },
    ],
    estimatedMarketValueUSD: 135000000,
  },
  {
    id: "portrait-of-wally",
    title: "Portrait of Wally Neuzil",
    artist: "Egon Schiele",
    culture: "Austrian (Expressionism)",
    period: "1912",
    icon: "🎭",
    accent: "#7a4b6b",
    image: {
      file: "objects/portrait-of-wally.jpg",
      credit: "Egon Schiele",
      license: "Public domain",
      licenseUrl: "",
      source: "https://commons.wikimedia.org/wiki/File:Egon_Schiele_-_Portrait_of_Wally_Neuzil_-_Google_Art_Project.jpg",
    },
    currentLocation: { institution: "Leopold Museum", city: "Vienna", country: "Austria" },
    riskScore: 62,
    riskLevel: "medium",
    redFlags: [
      { type: "nazi-era-seizure", severity: "high", evidence: "Taken from Lea Bondi Jaray's Vienna gallery in 1939 under the Nazi 'Aryanisation' of Jewish-owned businesses." },
      { type: "provenance-gap", severity: "medium", evidence: "Post-war restitution machinery misidentified it as part of a different collection, routing it into the Austrian National Gallery and then Rudolf Leopold's collection instead of back to its owner." },
    ],
    repatriation: {
      status: "settled",
      claimant: "Estate of Lea Bondi Jaray",
      year: "2010",
      note: "Seized by US authorities in 1998 while on loan to MoMA in New York. Twelve years of litigation ended in July 2010 with the Leopold Museum paying the Bondi estate $19M and keeping the painting — a settlement, not a return.",
    },
    journey: [
      { year: "1912", place: "Vienna", country: "Austria", event: "Painted; later owned by dealer Lea Bondi Jaray", type: "origin" },
      { year: "1939", place: "Vienna", country: "Austria", event: "Taken from Bondi's gallery under Aryanisation", type: "looting" },
      { year: "1950s", place: "Vienna", country: "Austria", event: "Misidentified in post-war restitution; enters the Austrian National Gallery", type: "museum" },
      { year: "1954", place: "Vienna", country: "Austria", event: "Acquired by Rudolf Leopold", type: "sale" },
      { year: "1998", place: "New York", country: "United States", event: "Seized by US authorities while on loan to MoMA", type: "contested" },
      { year: "2010", place: "Vienna", country: "Austria", event: "$19M settlement; painting stays at the Leopold Museum", type: "sale" },
    ],
    sources: [
      { title: "Lost Art Database", url: "https://www.lostart.de/en/search", issuer: "German Lost Art Foundation" },
      { title: "Leopold Museum — collection", url: "https://www.leopoldmuseum.org", issuer: "Leopold Museum" },
    ],
    estimatedMarketValueUSD: 19000000,
  },

  // --- Currently stolen: the cases the registers were built for --------------
  // Both of these are live entries in police registers rather than historical
  // disputes. They are the objects for which an INTERPOL / FBI check is the
  // whole answer, and where this agent's inability to query those registers
  // directly is most visible.
  {
    id: "the-concert-vermeer",
    title: "The Concert",
    artist: "Johannes Vermeer",
    culture: "Dutch Golden Age",
    period: "c. 1664",
    icon: "🎼",
    accent: "#2f5d50",
    image: {
      file: "objects/the-concert-vermeer.jpg",
      credit: "Johannes Vermeer",
      license: "Public domain",
      licenseUrl: "",
      source: "https://commons.wikimedia.org/wiki/File:Vermeer_The_Concert.jpg",
    },
    currentLocation: { institution: "Unknown — stolen, still at large", city: "—", country: "Unknown" },
    riskScore: 6,
    riskLevel: "high",
    redFlags: [
      { type: "active-theft", severity: "high", evidence: "Stolen from the Isabella Stewart Gardner Museum, Boston, in the early hours of 18 March 1990 by two men posing as police officers. Never recovered." },
      { type: "register-listed", severity: "high", evidence: "Carried on the FBI Art Crime Team's stolen-art listings and INTERPOL's Stolen Works of Art database; the museum's reward for information stands at $10 million." },
      { type: "no-lawful-market-title", severity: "high", evidence: "Title never left the museum. No purchase of this object can be lawful — any offer is prima facie evidence of a crime." },
    ],
    repatriation: {
      status: "contested",
      claimant: "Isabella Stewart Gardner Museum",
      note: "Not a repatriation dispute but an unsolved theft. Ownership is undisputed; the object is missing. The empty frame still hangs in the Dutch Room.",
    },
    journey: [
      { year: "c. 1664", place: "Delft", country: "Netherlands", event: "Painted by Vermeer", type: "origin" },
      { year: "1892", place: "Paris", country: "France", event: "Bought at auction by Isabella Stewart Gardner", type: "sale" },
      { year: "1903", place: "Boston", country: "United States", event: "Installed in the Gardner Museum's Dutch Room", type: "museum" },
      { year: "1990", place: "Boston", country: "United States", event: "Stolen in the Gardner heist with 12 other works", type: "looting" },
      { year: "Present", place: "Unknown", country: "Unknown", event: "Still missing; investigation open", type: "contested" },
    ],
    sources: [
      { title: "FBI Art Crime Team — National Stolen Art File", url: "https://artcrimes.fbi.gov/", issuer: "FBI Art Crime Team" },
      { title: "INTERPOL Stolen Works of Art Database", url: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/Stolen-Works-of-Art-Database", issuer: "INTERPOL" },
    ],
    estimatedMarketValueUSD: 200000000,
  },
  {
    id: "poppy-flowers-van-gogh",
    title: "Poppy Flowers (Vase with Viscaria)",
    artist: "Vincent van Gogh",
    culture: "Dutch / French",
    period: "1887",
    icon: "🌺",
    accent: "#c4452f",
    image: {
      file: "objects/poppy-flowers-van-gogh.jpg",
      credit: "Vincent van Gogh",
      license: "Public domain",
      licenseUrl: "",
      source: "https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Vase_mit_Pechnelken.jpeg",
    },
    currentLocation: { institution: "Unknown — stolen, still at large", city: "—", country: "Unknown" },
    riskScore: 8,
    riskLevel: "high",
    redFlags: [
      { type: "active-theft", severity: "high", evidence: "Stolen twice from the same museum: once in 1977 (recovered a decade later in Kuwait) and again on 21 August 2010, cut from its frame in daylight. Not recovered." },
      { type: "security-failure", severity: "medium", evidence: "Egyptian officials reported that at the time of the 2010 theft only a small fraction of the museum's cameras were operational and the gallery alarms were not working." },
      { type: "register-listed", severity: "high", evidence: "Reported to INTERPOL's Stolen Works of Art database; any appearance on the market is a criminal matter, not a due-diligence question." },
    ],
    repatriation: {
      status: "contested",
      claimant: "Arab Republic of Egypt",
      note: "An unsolved theft from a state museum, not a restitution claim. Egyptian ownership is undisputed.",
    },
    journey: [
      { year: "1887", place: "Paris", country: "France", event: "Painted during Van Gogh's Paris period", type: "origin" },
      { year: "1920s", place: "Cairo", country: "Egypt", event: "Acquired by the collector Mohamed Mahmoud Khalil", type: "sale" },
      { year: "1958", place: "Cairo", country: "Egypt", event: "Passes to the Egyptian state; hangs in the Khalil Museum", type: "museum" },
      { year: "1977", place: "Cairo", country: "Egypt", event: "Stolen from the museum", type: "looting" },
      { year: "1987", place: "Cairo", country: "Egypt", event: "Recovered in Kuwait and returned to the museum", type: "repatriation" },
      { year: "2010", place: "Cairo", country: "Egypt", event: "Stolen a second time; cut from its frame", type: "looting" },
      { year: "Present", place: "Unknown", country: "Unknown", event: "Still missing", type: "contested" },
    ],
    sources: [
      { title: "INTERPOL Stolen Works of Art Database", url: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime/Stolen-Works-of-Art-Database", issuer: "INTERPOL" },
      { title: "UNESCO — fighting illicit trafficking", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
    ],
    estimatedMarketValueUSD: 55000000,
  },
  {
    id: "cellini-saliera",
    title: "Saliera (Cellini Salt Cellar)",
    artist: "Benvenuto Cellini",
    culture: "Italian Mannerist goldsmithing",
    period: "1540–43",
    icon: "🧂",
    accent: "#b8860b",
    image: {
      file: "objects/cellini-saliera.jpg",
      credit: "Benvenuto Cellini",
      license: "CC BY 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by/3.0",
      source: "https://commons.wikimedia.org/wiki/File:Saliera.png",
    },
    currentLocation: { institution: "Kunsthistorisches Museum", city: "Vienna", country: "Austria" },
    riskScore: 71,
    riskLevel: "medium",
    redFlags: [
      { type: "theft-resolved", severity: "low", evidence: "Stolen from the Kunsthistorisches Museum on 11 May 2003 via scaffolding on the facade; recovered in January 2006, buried in a lead box in woodland near Zwettl, Lower Austria. The thief was convicted." },
    ],
    repatriation: {
      status: "clear",
      note: "Continuous documented ownership since the 16th century and undisputed title. The 2003 theft is a closed criminal episode, not a provenance defect — included here precisely because a register hit is not always a title problem.",
    },
    journey: [
      { year: "1543", place: "Paris", country: "France", event: "Made for Francis I of France", type: "origin" },
      { year: "1570", place: "Innsbruck", country: "Austria", event: "Given by Charles IX to Archduke Ferdinand II of Tyrol", type: "sale" },
      { year: "19th c.", place: "Vienna", country: "Austria", event: "Enters the imperial collections, later the Kunsthistorisches Museum", type: "museum" },
      { year: "2003", place: "Vienna", country: "Austria", event: "Stolen from the museum", type: "looting" },
      { year: "2006", place: "Zwettl", country: "Austria", event: "Recovered buried in woodland; returned to the museum", type: "repatriation" },
    ],
    sources: [
      { title: "Kunsthistorisches Museum — collection", url: "https://www.khm.at", issuer: "Kunsthistorisches Museum Vienna" },
      { title: "INTERPOL — cultural heritage crime", url: "https://www.interpol.int/en/Crimes/Cultural-heritage-crime", issuer: "INTERPOL" },
    ],
    estimatedMarketValueUSD: 60000000,
  },

  // --- Standing restitution disputes ----------------------------------------
  {
    id: "parthenon-marbles",
    title: "Parthenon Marbles (Elgin Marbles)",
    culture: "Ancient Greek (Classical Athens)",
    period: "447–432 BCE",
    icon: "🏛️",
    accent: "#8a8f7a",
    image: {
      file: "objects/parthenon-marbles.jpg",
      credit: "Joyofmuseums",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      source: "https://commons.wikimedia.org/wiki/File:The_Parthenon_Marbles_-_British_Museum_-_Joy_of_Museums.jpg",
    },
    currentLocation: { institution: "British Museum", city: "London", country: "United Kingdom" },
    riskScore: 24,
    riskLevel: "high",
    redFlags: [
      { type: "colonial-acquisition", severity: "high", evidence: "Removed from the Parthenon by agents of Lord Elgin between 1801 and 1812 under a disputed Ottoman authorisation. The original firman does not survive; what its terms permitted has been argued over ever since." },
      { type: "source-country-origin", severity: "medium", evidence: "Greece — a UNESCO 1970 source country with a formally lodged and continuously pressed restitution request." },
    ],
    repatriation: {
      status: "contested",
      claimant: "Hellenic Republic (Greece)",
      note: "Greece has sought return since the 19th century. The Acropolis Museum opened in 2009 with the space reserved. UNESCO's intergovernmental committee has repeatedly urged a bilateral settlement; the British Museum cites the British Museum Act 1963 as barring deaccession.",
    },
    journey: [
      { year: "447–432 BCE", place: "Athens", country: "Greece", event: "Carved for the Parthenon under Phidias", type: "origin" },
      { year: "1801–12", place: "Athens", country: "Greece", event: "Removed by Lord Elgin's agents", type: "looting" },
      { year: "1816", place: "London", country: "United Kingdom", event: "Purchased from Elgin by Act of Parliament for £35,000", type: "sale" },
      { year: "1817", place: "London", country: "United Kingdom", event: "Displayed at the British Museum", type: "museum" },
      { year: "2009", place: "Athens", country: "Greece", event: "Acropolis Museum opens with space reserved for their return", type: "contested" },
      { year: "Present", place: "London", country: "United Kingdom", event: "Contested by Greece", type: "contested" },
    ],
    sources: [
      { title: "UNESCO — return and restitution of cultural property", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
      { title: "British Museum — object record", url: "https://www.britishmuseum.org", issuer: "British Museum" },
    ],
  },
  {
    id: "nefertiti-bust",
    title: "Bust of Nefertiti",
    artist: "Attributed to the sculptor Thutmose",
    culture: "Ancient Egyptian (Amarna period)",
    period: "c. 1345 BCE",
    icon: "👑",
    accent: "#3f7f8a",
    image: {
      file: "objects/nefertiti-bust.jpg",
      credit: "Philip Pikart",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      source: "https://commons.wikimedia.org/wiki/File:Nofretete_Neues_Museum.jpg",
    },
    currentLocation: { institution: "Neues Museum", city: "Berlin", country: "Germany" },
    riskScore: 28,
    riskLevel: "high",
    redFlags: [
      { type: "contested-export", severity: "high", evidence: "Left Egypt in the 1913 partage division of the German excavation's finds. Egyptian authorities have long argued the division was obtained by understating the bust's significance to the inspector." },
      { type: "source-country-origin", severity: "medium", evidence: "Egypt — a UNESCO 1970 source country that has requested this object's return repeatedly since the 1920s." },
    ],
    repatriation: {
      status: "contested",
      claimant: "Arab Republic of Egypt",
      note: "Egypt has sought the bust since the 1920s and renewed formal requests in 2005 and 2011. Germany maintains the 1913 division was lawful and the acquisition valid.",
    },
    journey: [
      { year: "c. 1345 BCE", place: "Amarna", country: "Egypt", event: "Carved in the workshop of the sculptor Thutmose", type: "origin" },
      { year: "1912", place: "Amarna", country: "Egypt", event: "Found on 6 December by Ludwig Borchardt's German expedition", type: "excavation" },
      { year: "1913", place: "Cairo", country: "Egypt", event: "Allocated to the German side in the division of finds", type: "sale" },
      { year: "1924", place: "Berlin", country: "Germany", event: "First put on public display in Berlin", type: "museum" },
      { year: "Present", place: "Berlin", country: "Germany", event: "Contested by Egypt", type: "contested" },
    ],
    sources: [
      { title: "UNESCO 1970 Convention", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
      { title: "Staatliche Museen zu Berlin — Ägyptisches Museum", url: "https://www.smb.museum", issuer: "Staatliche Museen zu Berlin" },
    ],
  },
  {
    id: "victorious-youth",
    title: "Victorious Youth (Atleta di Fano)",
    culture: "Ancient Greek bronze",
    period: "c. 300–100 BCE",
    icon: "🥉",
    accent: "#6b7f5e",
    image: {
      file: "objects/victorious-youth.jpg",
      credit: "J. Paul Getty Museum",
      license: "CC0",
      licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
      source: "https://commons.wikimedia.org/wiki/File:Statue_of_a_Victorious_Youth,_front_-_Getty_Museum_(77.AB.30).jpg",
    },
    currentLocation: { institution: "Getty Villa", city: "Malibu", country: "United States" },
    riskScore: 26,
    riskLevel: "high",
    redFlags: [
      { type: "illicit-export", severity: "high", evidence: "Netted by Italian fishermen in the Adriatic in 1964 and moved out of Italy without an export licence; Italian prosecutions followed over its handling." },
      { type: "contested-title", severity: "high", evidence: "Italian courts ordered forfeiture and the Court of Cassation upheld it; in 2024 the European Court of Human Rights rejected the Getty's challenge to the confiscation order." },
      { type: "source-country-origin", severity: "medium", evidence: "Italy — a UNESCO 1970 source country with an enforceable domestic confiscation order outstanding." },
    ],
    repatriation: {
      status: "contested",
      claimant: "Italian Republic",
      note: "Italy's confiscation order stands after the 2024 ECHR ruling. The Getty disputes Italian jurisdiction over an object it says was acquired in international waters and outside Italy, and the bronze remains at the Getty Villa.",
    },
    journey: [
      { year: "c. 300 BCE", place: "Greece", country: "Greece", event: "Cast in a Greek workshop", type: "origin" },
      { year: "1964", place: "Fano", country: "Italy", event: "Recovered in fishing nets in the Adriatic", type: "excavation" },
      { year: "1964–70s", place: "Various", country: "Italy", event: "Moved through dealers; leaves Italy without an export licence", type: "sale" },
      { year: "1977", place: "Malibu", country: "United States", event: "Acquired by the J. Paul Getty Museum", type: "museum" },
      { year: "2018", place: "Rome", country: "Italy", event: "Italian Court of Cassation upholds the forfeiture order", type: "contested" },
      { year: "2024", place: "Strasbourg", country: "France", event: "ECHR rejects the Getty's challenge to the confiscation", type: "contested" },
    ],
    sources: [
      { title: "Getty — Victorious Youth collection record", url: "https://www.getty.edu", issuer: "J. Paul Getty Museum" },
      { title: "Carabinieri TPC — illicitly removed cultural property", url: "https://tpcweb.carabinieri.it/SitoPubblico/ricerca", issuer: "Carabinieri TPC (Italy)" },
    ],
  },

  // --- Completed returns -----------------------------------------------------
  {
    id: "koh-ker-duryodhana",
    title: "Duryodhana of Prasat Chen (Koh Ker warrior)",
    culture: "Khmer (Koh Ker style)",
    period: "10th c.",
    icon: "🗿",
    accent: "#7a6a52",
    currentLocation: { institution: "National Museum of Cambodia", city: "Phnom Penh", country: "Cambodia" },
    riskScore: 20,
    riskLevel: "high",
    redFlags: [
      { type: "looting-signal", severity: "high", evidence: "Hacked from its pedestal at Prasat Chen, Koh Ker, during Cambodia's civil war. The feet were left in situ and later matched to the statue — physical proof of the removal." },
      { type: "trafficking-network", severity: "high", evidence: "Moved through the trafficking network associated with dealer Douglas Latchford, then consigned to a 2011 Sotheby's New York sale halted by a US forfeiture action." },
      { type: "source-country-origin", severity: "medium", evidence: "Cambodia — a UNESCO 1970 source country with active and successful restitution claims for Koh Ker material." },
    ],
    repatriation: {
      status: "repatriated",
      claimant: "Kingdom of Cambodia",
      year: "2013",
      note: "Sotheby's and the consignor agreed to return the statue rather than litigate the US forfeiture case. It was handed to Cambodia in 2013 and displayed alongside other returned Prasat Chen figures.",
    },
    journey: [
      { year: "10th c.", place: "Koh Ker", country: "Cambodia", event: "Carved for the Prasat Chen temple complex", type: "origin" },
      { year: "1970s", place: "Koh Ker", country: "Cambodia", event: "Cut from its pedestal and removed during the civil war", type: "looting" },
      { year: "1970s", place: "Bangkok", country: "Thailand", event: "Trafficked out through Thailand", type: "sale" },
      { year: "1975", place: "London", country: "United Kingdom", event: "Sold at auction in London", type: "sale" },
      { year: "2011", place: "New York", country: "United States", event: "Withdrawn from a Sotheby's sale after US authorities intervened", type: "contested" },
      { year: "2013", place: "Phnom Penh", country: "Cambodia", event: "Returned to Cambodia", type: "repatriation" },
    ],
    sources: [
      { title: "ICOM Red List — Cambodia", url: "https://icom.museum/en/resources/red-lists/", issuer: "ICOM" },
      { title: "UNESCO 1970 Convention", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
    ],
  },
  {
    id: "machu-picchu-collection",
    title: "Machu Picchu excavation collection (Bingham material)",
    culture: "Inca",
    period: "15th c.; excavated 1911–15",
    icon: "⛏️",
    accent: "#9a6b3f",
    currentLocation: { institution: "Museo Machu Picchu, Casa Concha", city: "Cusco", country: "Peru" },
    riskScore: 46,
    riskLevel: "medium",
    redFlags: [
      { type: "contested-export", severity: "medium", evidence: "Removed by Hiram Bingham's Yale expeditions in 1911–1915 under Peruvian decrees Peru maintained were loans requiring return; Yale disputed that reading for decades." },
      { type: "source-country-origin", severity: "medium", evidence: "Peru — a UNESCO 1970 source country that pursued the claim through US federal court." },
    ],
    repatriation: {
      status: "repatriated",
      claimant: "Republic of Peru",
      year: "2011–2012",
      note: "Peru sued Yale in 2008; a 2010 agreement and a memorandum with the Universidad Nacional de San Antonio Abad del Cusco led to the material returning in three shipments across 2011–2012, where it is now held and displayed in Cusco.",
    },
    journey: [
      { year: "15th c.", place: "Machu Picchu", country: "Peru", event: "Made and deposited at the Inca site", type: "origin" },
      { year: "1911–15", place: "Machu Picchu", country: "Peru", event: "Excavated by the Yale Peruvian Expeditions", type: "excavation" },
      { year: "1912–16", place: "New Haven", country: "United States", event: "Shipped to Yale under permits Peru treated as loans", type: "museum" },
      { year: "2008", place: "Washington DC", country: "United States", event: "Peru sues Yale in US federal court", type: "contested" },
      { year: "2011", place: "Cusco", country: "Peru", event: "First shipment returns to Peru", type: "repatriation" },
    ],
    sources: [
      { title: "UNESCO 1970 Convention", url: "https://www.unesco.org/en/fight-illicit-trafficking", issuer: "UNESCO" },
      { title: "ICOM Red List — Latin America", url: "https://icom.museum/en/resources/red-lists/", issuer: "ICOM" },
    ],
  },
];

export function getCatalog(): CatalogObject[] {
  return CATALOG;
}
export function getObject(id: string): CatalogObject | undefined {
  return CATALOG.find((o) => o.id === id);
}

/**
 * Issue a signed Provenance Passport for a catalog object (wallet secp256k1).
 *
 * Runs the stolen-art register checks live rather than baking a stored verdict
 * into the credential. A register result has a timestamp for a reason: an
 * object can be reported stolen tomorrow, and a Passport asserting a check that
 * was really performed months ago would be the wrong kind of durable.
 */
export async function issueObjectPassport(
  obj: CatalogObject,
  /** Reuse an already-computed check instead of re-querying (Pages build). */
  precomputed?: RegistrySummary | null
): Promise<VerifiableCredential> {
  const pk = signingKey();
  const account = privateKeyToAccount(pk);
  const issuerDid = addressToDid(account.address);
  const now = new Date().toISOString();

  let registry: RegistrySummary | null = precomputed ?? null;
  if (!registry) {
    try {
      registry = await checkRegistries(obj.title, obj.artist);
    } catch {
      registry = null; // recorded by its absence from checksRun below
    }
  }

  const body = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "DigitalProvenancePassport"],
    issuer: issuerDid,
    validFrom: now,
    credentialSubject: {
      id: `urn:artwork:${obj.id}`,
      title: obj.title,
      artist: obj.artist ?? null,
      culture: obj.culture ?? null,
      currentLocation: obj.currentLocation,
      provenanceJourney: obj.journey,
      confidenceScore: obj.riskScore,
      redFlags: obj.redFlags,
      repatriation: obj.repatriation,
      sources: obj.sources,
      registryChecks: (registry?.checks ?? []).map((c) => ({
        registry: c.registry,
        assertedBy: c.issuer,
        access: c.access,
        verdict: c.verdict,
        method: c.method,
        caveat: c.caveat,
        hits: c.hits.map((h) => ({ claim: h.claim, source: h.sourceUrl, riskRelevant: h.riskRelevant })),
        officialSearch: c.referralUrl,
        checkedAt: c.checkedAt,
      })),
      checksRun: [
        "catalog-grounding",
        "repatriation-registry",
        ...(registry?.checks ?? []).map((c) => `registry:${c.registryId}#${c.access}`),
      ],
      assessedAt: now,
    },
  };
  return signCredential(body, pk, now);
}
