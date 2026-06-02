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

export type RepatriationStatus = "repatriated" | "contested" | "clear";

export interface CatalogObject {
  id: string;
  title: string;
  artist?: string;
  culture?: string;
  period?: string;
  icon: string; // emoji used as a clean placeholder tile
  accent: string; // gradient accent hex
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
];

export function getCatalog(): CatalogObject[] {
  return CATALOG;
}
export function getObject(id: string): CatalogObject | undefined {
  return CATALOG.find((o) => o.id === id);
}

/** Issue a signed Provenance Passport for a catalog object (wallet secp256k1). */
export async function issueObjectPassport(obj: CatalogObject): Promise<VerifiableCredential> {
  const pk = signingKey();
  const account = privateKeyToAccount(pk);
  const issuerDid = addressToDid(account.address);
  const now = new Date().toISOString();
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
      checksRun: ["catalog-grounding", "repatriation-registry"],
      assessedAt: now,
    },
  };
  return signCredential(body, pk, now);
}
