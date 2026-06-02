/**
 * Digital Provenance Passport — schema + types (JSON-LD, signed, tamper-evident).
 * The signature covers a canonical hash of everything EXCEPT the signature field.
 */
import { z } from "zod";

export const PASSPORT_CONTEXT = {
  "@vocab": "https://schema.org/",
  prov: "http://www.w3.org/ns/prov#",
  passport: "https://provenance-passport.demo/ns#",
} as const;

/** How strongly a claim is backed — the anti-hallucination spine. */
export const VerificationTier = z.enum([
  "verifiedByAuthority", // Met / UNESCO / ALR / govt record
  "reportedInPress",     // news outlet
  "inferred",            // model inference from cited context (lowest trust)
]);
export type VerificationTier = z.infer<typeof VerificationTier>;

export const TimelineEvent = z.object({
  event: z.string(),
  date: z.string().nullable(),          // ISO or free text; null if unknown
  location: z.string().nullable(),
  source: z.string().url(),             // REQUIRED — no source, no claim
  sourceType: z.string(),               // e.g. "museum record", "news"
  verifiedBy: z.string(),               // the vouching authority
  tier: VerificationTier,
  confidence: z.number().min(0).max(1),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const RiskFlagType = z.enum([
  "lootingSignal",
  "alrPotentialMatch",
  "repatriationPrecedent",
  "valuationAnomaly",
  "provenanceGap",
  "cryptoTransactionFlag", // AML screening of the x402 payment itself (Coinbase trace)
]);
export type RiskFlagType = z.infer<typeof RiskFlagType>;

export const RiskFlag = z.object({
  type: RiskFlagType,
  severity: z.enum(["low", "medium", "high"]),
  evidence: z.string(),
  source: z.string(),
});
export type RiskFlag = z.infer<typeof RiskFlag>;

export const PremiumCheck = z.object({
  vendor: z.string(),
  result: z.any(),
  paymentTx: z.string().nullable(),
  amountUsd: z.number(),
  network: z.string(),
  facilitator: z.string(),
  mode: z.enum(["live", "mock", "skipped"]),
  reasoning: z.string(),
});
export type PremiumCheck = z.infer<typeof PremiumCheck>;

export const Passport = z.object({
  "@context": z.any(),
  type: z.literal("DigitalProvenancePassport"),
  id: z.string(),
  artwork: z.object({
    title: z.string(),
    artist: z.string().nullable(),
    period: z.string().nullable(),
    imageHash: z.string().nullable(),
  }),
  provenanceTimeline: z.array(TimelineEvent),
  riskAssessment: z.object({
    confidenceScore: z.number().min(0).max(100),
    flags: z.array(RiskFlag),
  }),
  premiumChecks: z.array(PremiumCheck),
  issuer: z.object({
    name: z.string(),
    wallet: z.string(), // 0x address — the PKI identity
  }),
  issuedAt: z.string(),
  contentHash: z.string(),  // keccak256 of canonical payload (excl. signature)
  signature: z.string(),    // EIP-191 personal_sign over contentHash
});
export type Passport = z.infer<typeof Passport>;
