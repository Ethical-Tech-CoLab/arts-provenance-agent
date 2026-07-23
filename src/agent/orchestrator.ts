/**
 * The agent loop — the 5-step demo narrative, in order:
 *   1. Intent          parseIntent
 *   2. Grounding       buildProvenanceTimeline (Tavily)
 *   3. Risk            assessRisk
 *   4/5. x402          payForCheck -> traceTransaction (Coinbase)  [agentic commerce]
 *   then re-score, mint + verify the Passport.
 *
 * Emits a typed event per step so the CLI and the web UI can render the same
 * live timeline.
 */
import { parseIntent, type ArtworkIntent } from "./parseIntent.js";
import { buildProvenanceTimeline } from "./timeline.js";
import { checkRegistries, type RegistrySummary } from "../tools/registries.js";
import { assessRisk } from "./assessRisk.js";
import { payForCheck } from "./payForCheck.js";
import { traceTransaction } from "./traceTransaction.js";
import { mintPassport, verifyPassport, type VerifyResult } from "./passport.js";
import type { Passport } from "../../schema/passport.js";
import { facilitatorLabel, DEMO_MODE } from "../config.js";

export type StepEvent =
  | { step: "intent"; title: string; data: ArtworkIntent }
  | { step: "grounding"; title: string; data: any }
  | { step: "registry"; title: string; data: RegistrySummary }
  | { step: "risk"; title: string; data: any }
  | { step: "payment"; title: string; data: any }
  | { step: "trace"; title: string; data: any }
  | { step: "passport"; title: string; data: { passport: Passport; verify: VerifyResult } }
  | { step: "done"; title: string; data: any };

export interface RunResult {
  passport: Passport;
  verify: VerifyResult;
  events: StepEvent[];
}

export async function runAgent(
  rawInput: Partial<ArtworkIntent> & { title: string },
  emit: (e: StepEvent) => void = () => {},
  opts: { valuation?: { price: number; comparableMedian: number } | null } = {}
): Promise<RunResult> {
  const events: StepEvent[] = [];
  const push = (e: StepEvent) => { events.push(e); emit(e); };

  // 1. Intent
  const intent = parseIntent(rawInput);
  push({ step: "intent", title: "Intent parsed", data: intent });

  // 2. Grounding research
  const ground = await buildProvenanceTimeline(intent);
  push({
    step: "grounding",
    title: `Grounded ${ground.timeline.length} event(s) across ${ground.sources.length} source(s)`,
    data: { timeline: ground.timeline, sources: ground.sources, dropped: ground.dropped },
  });

  // 2b. Stolen-art register checks (INTERPOL, FBI NSAF, TPC, Lost Art, …).
  // Fault-tolerant: a registry layer that throws must not take the run with it,
  // but the absence of checks is then visible rather than silently benign.
  let registry: RegistrySummary | null = null;
  try {
    registry = await checkRegistries(intent.title, intent.artist ?? undefined);
    push({
      step: "registry",
      title: `Registers: ${registry.possibleMatches} possible match(es), ${registry.notQueryable}/${registry.checks.length} not machine-queryable`,
      data: registry,
    });
  } catch { /* recorded by its absence from checksRun */ }

  // 3. Initial risk
  let risk = assessRisk({ timeline: ground.timeline, valuation: opts.valuation ?? null, registry });
  push({ step: "risk", title: `Initial confidence ${risk.confidenceScore}/100`, data: risk });

  // 4/5. Agentic commerce: decide + pay (x402) for the premium check
  const pay = await payForCheck({
    title: intent.title,
    artist: intent.artist ?? undefined,
    currentConfidence: risk.confidenceScore,
  });
  push({
    step: "payment",
    title:
      pay.mode === "skipped"
        ? "Premium check skipped (guardrail)"
        : `Paid ${pay.amountUsd.toFixed(2)} USDC via x402 (${pay.mode}) · ${facilitatorLabel()}`,
    data: pay,
  });

  // Record the settlement tx for audit (no AML screening is implemented yet)
  const trace = await traceTransaction(pay.paymentTx);
  push({ step: "trace", title: `Payment trace: ${trace.verdict} (screening: ${trace.screenedVia})`, data: trace });

  // Re-score with premium result + crypto flag
  risk = assessRisk({
    timeline: ground.timeline,
    premiumResult: pay.result,
    cryptoFlag: trace.flag,
    valuation: opts.valuation ?? null,
    registry,
  });

  // Mint + verify the Passport
  const passport = await mintPassport({
    intent,
    timeline: ground.timeline,
    riskAssessment: risk,
    premiumChecks: [
      {
        vendor: pay.vendor,
        result: pay.result,
        paymentTx: pay.paymentTx,
        amountUsd: pay.amountUsd,
        network: pay.network,
        facilitator: pay.facilitator,
        mode: pay.mode,
        reasoning: pay.reasoning,
      },
    ],
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
  });
  const verify = await verifyPassport(passport);
  push({ step: "passport", title: `Passport signed & verified: ${verify.ok ? "VALID ✅" : "INVALID ❌"}`, data: { passport, verify } });

  push({ step: "done", title: `Done (DEMO_MODE=${DEMO_MODE})`, data: { confidence: risk.confidenceScore, flags: risk.flags.length } });
  return { passport, verify, events };
}
