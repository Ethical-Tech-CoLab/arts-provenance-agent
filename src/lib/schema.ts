/**
 * Shared types for the Digital Provenance Passport agent.
 * The whole pipeline reads/writes a single RunContext; tools accumulate
 * state into it, and the passport is assembled from that accumulated state
 * (not re-derived from the LLM) so the signed record is always faithful.
 */
import type { RegistrySummary } from "../tools/registries.js";
import type { CoverageResult } from "./coverage.js";

export type { RegistryCheck, RegistrySummary, RegistryVerdict, RegistryAccess } from "../tools/registries.js";

/** What the user enters on the website. "Intent is the interface." */
export interface Intent {
  title: string;
  artist?: string;
  origin?: string; // country / culture of origin, if known
  knownHistory?: string;
  imageUrl?: string;
  askingPriceUSD?: number; // price it's being bought/sold for, if a transaction
  estimatedMarketValueUSD?: number; // comparable market value, if known
}

/** A single cited fact pulled from an authoritative source. */
export interface GroundedFact {
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceQuote: string;
  /** Which authority asserted this — Met, UNESCO, Art Loss Register, etc. */
  issuer?: string;
}

export type RedFlagSeverity = "low" | "medium" | "high";

export interface RedFlag {
  type: string;
  severity: RedFlagSeverity;
  evidence: string;
}

export interface RiskAssessment {
  confidenceScore: number; // 0–100, higher = cleaner provenance
  redFlags: RedFlag[];
  rationale: string;
  /**
   * What could have been found, for the score to be read against. A confidence
   * number is not interpretable on its own — the same low value means "a
   * documented gap was found" for a well-covered object and "nothing was
   * reachable" for one no register can hold. See src/lib/coverage.ts.
   */
  coverage?: CoverageResult;
}

/** Result of a (possibly paid) premium due-diligence check. */
export interface PremiumCheckResult {
  database: string; // e.g. "Art Loss Register"
  priceUSD: number;
  paid: boolean;
  settlement?: PaymentReceipt;
  outcome: string; // human-readable result
  match: boolean; // did it hit a stolen/looted record?
  issuer: string; // authority that produced this result
}

/** Receipt for an x402 micropayment (real on-chain or mock). */
export interface PaymentReceipt {
  mode: "real" | "mock";
  network: string; // e.g. "base-sepolia"
  asset: string; // e.g. "USDC"
  amount: string; // human units, e.g. "0.50"
  txHash?: string; // on-chain hash when mode === "real"
  payer: string; // wallet address / did
  payee: string; // vendor address / did
  settledAt: string; // ISO timestamp
  /** Coinbase / explorer trace link for the "flag the payment" point. */
  explorerUrl?: string;
}

/** The phases streamed to the website over SSE. */
export type Phase =
  | "intent"
  | "reasoning"
  | "grounding"
  | "registry"
  | "risk"
  | "x402:offer"
  | "x402:decision"
  | "x402:paid"
  | "passport"
  | "done"
  | "error";

export interface RunEvent {
  phase: Phase;
  message?: string;
  data?: unknown;
  at: string; // ISO timestamp
}

export type Emit = (phase: Phase, payload: { message?: string; data?: unknown }) => void;

/** Per-run mutable state shared across all tools. */
export interface RunContext {
  runId: string;
  intent: Intent;
  facts: GroundedFact[];
  /** Stolen-art / cultural-property register checks (src/tools/registries.ts). */
  registry?: RegistrySummary;
  risk?: RiskAssessment;
  premiumChecks: PremiumCheckResult[];
  emit: Emit;
}

export function newRunContext(runId: string, intent: Intent, emit: Emit): RunContext {
  return { runId, intent, facts: [], premiumChecks: [], emit };
}
