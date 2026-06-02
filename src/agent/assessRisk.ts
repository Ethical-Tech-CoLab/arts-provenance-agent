/**
 * Step 3 — Risk flagging.
 * Cross-checks the timeline against looting / repatriation signals AND valuation
 * anomalies (money-laundering / wash-trade red flags), plus the AML screen of
 * the x402 payment itself. Outputs a provenance-confidence score (0–100) and a
 * typed array of red flags.
 *
 * The agent NEVER asserts a legal conclusion — it flags signals + cites evidence.
 */
import type { TimelineEvent, RiskFlag } from "../../schema/passport.js";

export interface RiskInput {
  timeline: TimelineEvent[];
  /** Optional: result of the premium ALR check, once paid for. */
  premiumResult?: any | null;
  /** Optional: AML screen of the payment tx (from traceTransaction). */
  cryptoFlag?: RiskFlag | null;
  /** Optional: declared/observed sale price vs comparable median (USD). */
  valuation?: { price: number; comparableMedian: number } | null;
}

export interface RiskResult {
  confidenceScore: number; // 0..100 provenance confidence
  flags: RiskFlag[];
}

export function assessRisk(input: RiskInput): RiskResult {
  const flags: RiskFlag[] = [];
  const { timeline } = input;

  // Base confidence from how well the timeline is attributed.
  const authority = timeline.filter((e) => e.tier === "verifiedByAuthority").length;
  const press = timeline.filter((e) => e.tier === "reportedInPress").length;
  let confidence = Math.min(100, 30 + authority * 18 + press * 8);

  // --- Looting / repatriation signals from the cited timeline ---------------
  const repat = timeline.find((e) =>
    /repatriat|returned to|restitut|illicit|looted|stolen/i.test(`${e.event} ${e.location ?? ""}`)
  );
  if (repat) {
    flags.push({
      type: "repatriationPrecedent",
      severity: "high",
      evidence: `Timeline cites a repatriation/illicit-excavation event: "${repat.event}"`,
      source: repat.source,
    });
    flags.push({
      type: "lootingSignal",
      severity: "medium",
      evidence: "Object history intersects a documented looting/repatriation case.",
      source: repat.source,
    });
  }

  // --- Provenance gap (undated/undocumented early history) ------------------
  const undated = timeline.filter((e) => !e.date).length;
  const earliest = timeline.find((e) => e.date);
  if (undated > 0 || (earliest?.date && earliest.date > "1900")) {
    confidence -= 12;
    flags.push({
      type: "provenanceGap",
      severity: "medium",
      evidence: `Pre-acquisition history is incomplete (${undated} undated event(s); no documented chain before earliest record).`,
      source: earliest?.source ?? timeline[0]?.source ?? "n/a",
    });
  }

  // --- Premium ALR result folds in (after payment) --------------------------
  if (input.premiumResult?.match) {
    const m = input.premiumResult.match;
    confidence = Math.min(100, confidence + (m.confidenceDelta ?? 0));
    if (m.openClaim) {
      flags.push({
        type: "alrPotentialMatch",
        severity: "high",
        evidence: `ALR premium search: OPEN claim — ${m.summary}`,
        source: "Art Loss Register Premium Search",
      });
    } else if (m.historicalClaim) {
      flags.push({
        type: "alrPotentialMatch",
        severity: "low",
        evidence: `ALR premium search: historical (resolved) claim — ${m.summary}`,
        source: "Art Loss Register Premium Search",
      });
    }
  }

  // --- Valuation anomaly (wash-trade / money-laundering signal) -------------
  if (input.valuation && input.valuation.comparableMedian > 0) {
    const ratio = input.valuation.price / input.valuation.comparableMedian;
    if (ratio >= 3) {
      flags.push({
        type: "valuationAnomaly",
        severity: "high",
        evidence: `Sale price $${input.valuation.price.toLocaleString()} is ${ratio.toFixed(1)}× the comparable median $${input.valuation.comparableMedian.toLocaleString()} — possible wash-trade / laundering signal.`,
        source: "valuation comparables",
      });
    }
  }

  // --- AML screen of the on-chain payment (Coinbase trace) ------------------
  if (input.cryptoFlag) flags.push(input.cryptoFlag);

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));
  return { confidenceScore: confidence, flags };
}
