/**
 * Self-contained orchestration for the website. Ties the stable modules
 * together and streams events: intent → grounding (Tavily) → risk → x402 pay →
 * signed Passport. Honors DEMO_MODE=mock so it runs with no funded wallet, and
 * falls back to mock on any live error so the stage demo can't hard-fail.
 *
 * Lives under src/web/ on purpose — it composes the shared modules without
 * touching the teammate's src/agent/ orchestration.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
import { config, IS_MOCK, facilitatorLabel } from "../config.js";
import { searchProvenance } from "../tools/tavily.js";
import { usdToAtomic, preflight402, recordSpendUsd, spentUsd, remainingBudgetUsd } from "../lib/spend.js";
import { signCredential, addressToDid, type VerifiableCredential } from "../lib/signing.js";
import {
  newRunContext,
  type Emit,
  type Intent,
  type RiskAssessment,
  type RedFlag,
  type PremiumCheckResult,
  type PaymentReceipt,
  type RunContext,
} from "../lib/schema.js";

/**
 * UNESCO 1970 source countries, each with the surface forms that actually
 * appear in provenance prose (country name + demonym). Matching is
 * whole-word-only: a bare `corpus.includes("china")` also fires on
 * "Chinatown"/"machina" and "india" on "Indiana", which produced bogus
 * repatriation flags.
 */
const UNESCO_SOURCE_COUNTRIES: { name: string; aliases: string[] }[] = [
  { name: "italy", aliases: ["italy", "italian"] },
  { name: "greece", aliases: ["greece", "greek"] },
  { name: "egypt", aliases: ["egypt", "egyptian"] },
  { name: "turkey", aliases: ["turkey", "turkish", "anatolian"] },
  { name: "cambodia", aliases: ["cambodia", "cambodian", "khmer"] },
  { name: "china", aliases: ["china", "chinese"] },
  { name: "iraq", aliases: ["iraq", "iraqi", "mesopotamian"] },
  { name: "peru", aliases: ["peru", "peruvian"] },
  { name: "mexico", aliases: ["mexico", "mexican"] },
  { name: "nigeria", aliases: ["nigeria", "nigerian"] },
  { name: "india", aliases: ["india", "indian"] },
  { name: "syria", aliases: ["syria", "syrian"] },
  { name: "cyprus", aliases: ["cyprus", "cypriot"] },
  { name: "thailand", aliases: ["thailand", "thai"] },
];

/** Whole-word (plural-tolerant) matcher for a country's surface forms. */
const COUNTRY_MATCHERS: { name: string; re: RegExp }[] = UNESCO_SOURCE_COUNTRIES.map((c) => ({
  name: c.name,
  re: new RegExp(`\\b(?:${c.aliases.join("|")})s?\\b`, "i"),
}));

/** First UNESCO source country named in `texts`, or null. Whole-word matching only. */
export function matchSourceCountry(...texts: string[]): string | null {
  return COUNTRY_MATCHERS.find((c) => texts.some((t) => c.re.test(t)))?.name ?? null;
}

/**
 * Mock-mode demo identity. Generated at most once per process and reused, so
 * every Passport issued by this process shares one issuer DID. Generating a
 * fresh key per call made each catalog Passport come from a different throwaway
 * issuer, which renders the issuer identity meaningless.
 */
let ephemeralKey: Hex | undefined;

/** Get the key used to sign the passport. Falls back to an ephemeral key in mock. */
export function signingKey(): Hex {
  if (config.walletPrivateKey && /^0x[0-9a-fA-F]{64}$/.test(config.walletPrivateKey)) {
    return config.walletPrivateKey;
  }
  if (IS_MOCK) return (ephemeralKey ??= generatePrivateKey()); // stable per-process demo identity
  throw new Error("WALLET_PRIVATE_KEY missing. Run `npm run wallet -- --new` or set DEMO_MODE=mock.");
}

/** Deterministic provenance risk assessment from grounded facts + the intent. */
function assessRisk(ctx: RunContext): RiskAssessment {
  const flags: RedFlag[] = [];
  let score = 100;
  const intent = ctx.intent;
  const corpus = [
    intent.knownHistory ?? "",
    ...ctx.facts.map((f) => `${f.claim} ${f.sourceQuote}`),
  ].join(" ").toLowerCase();

  // 1. Documentation gaps in the timeline (classic Nazi-era / looting red flag).
  if (/(not documented|undocumented|unknown owner|gap|missing|no record|1933|1939|1945)/.test(corpus)) {
    score -= 25;
    flags.push({
      type: "provenance-gap",
      severity: "high",
      evidence: "Authoritative sources show an undocumented period in the ownership timeline.",
    });
  }

  // 2. Origin in a UNESCO 1970 source country → repatriation exposure.
  const origin = (intent.origin ?? "").toLowerCase();
  const matchedCountry = matchSourceCountry(origin, corpus);
  if (matchedCountry) {
    score -= 15;
    flags.push({
      type: "source-country-origin",
      severity: "medium",
      evidence: `Linked to ${matchedCountry} — a UNESCO 1970 source country with active repatriation claims.`,
    });
  }

  // 3. Looting / illicit-trade language.
  if (/(looted|stolen|tomb|excavat|smuggl|repatriat|illicit|tombaroli)/.test(corpus)) {
    score -= 20;
    flags.push({
      type: "looting-signal",
      severity: "high",
      evidence: "Sources contain looting / repatriation language associated with this object or its type.",
    });
  }

  // 4. Valuation sanity — an extreme markup can signal laundering/wash trades.
  const { askingPriceUSD: ask, estimatedMarketValueUSD: mkt } = intent;
  if (ask && mkt && ask > mkt * 3) {
    score -= 30;
    flags.push({
      type: "valuation-outlier",
      severity: "high",
      evidence: `Asking $${ask.toLocaleString()} is ${(ask / mkt).toFixed(1)}× the ~$${mkt.toLocaleString()} market estimate — possible value laundering.`,
    });
  } else if (ask && ask > 10_000_000 && !mkt) {
    score -= 10;
    flags.push({
      type: "high-value-no-comp",
      severity: "low",
      evidence: `High asking price ($${ask.toLocaleString()}) with no comparable market valuation supplied.`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const rationale =
    flags.length === 0
      ? "No red flags surfaced from grounded sources; provenance appears well-documented."
      : `${flags.length} red flag(s) detected from authoritative sources; confidence reduced accordingly.`;
  return { confidenceScore: score, redFlags: flags, rationale };
}

/** Decide whether the premium (paid) check is economically worth running. */
function shouldPayForPremium(risk: RiskAssessment): { pay: boolean; reasoning: string } {
  const price = config.vendorPrice;
  if (price > config.maxSpendUsd) {
    return { pay: false, reasoning: `Check costs $${price} but my per-run cap is $${config.maxSpendUsd}. Skipping.` };
  }
  // MAX_SPEND_USD is a lifetime cap, not a per-request one: a loop of runs must
  // not be able to drain the wallet one micropayment at a time.
  const remaining = remainingBudgetUsd();
  if (price > remaining + 1e-9) {
    return {
      pay: false,
      reasoning: `Lifetime budget exhausted: $${spentUsd().toFixed(2)} of the $${config.maxSpendUsd.toFixed(2)} cap already spent, so a $${price} check is refused.`,
    };
  }
  if (risk.confidenceScore >= 85 && risk.redFlags.length === 0) {
    return { pay: false, reasoning: `Confidence is already ${risk.confidenceScore}/100 with no red flags — a $${price} premium check isn't worth it.` };
  }
  return {
    pay: true,
    reasoning: `Confidence is ${risk.confidenceScore}/100 with ${risk.redFlags.length} red flag(s). A $${price} Art Loss Register search could materially change the record — worth paying.`,
  };
}

/** Run the real (or mock) paid Art Loss Register check via x402. */
async function runPremiumCheck(ctx: RunContext): Promise<PremiumCheckResult> {
  const price = config.vendorPrice;
  const intent = ctx.intent;
  const looksStolen = /(euphronios|krater|looted|stolen|tombaroli)/i.test(
    `${intent.title} ${intent.knownHistory ?? ""}`
  );

  if (IS_MOCK) {
    const receipt: PaymentReceipt = {
      mode: "mock",
      network: "base-sepolia",
      asset: "USDC",
      amount: price.toFixed(2),
      txHash: "0xMOCK_no_settlement_in_demo_mode",
      payer: "did:demo:agent",
      payee: config.vendorPayTo ?? "0xVendor",
      settledAt: new Date().toISOString(),
      explorerUrl: undefined,
    };
    return {
      database: "Art Loss Register",
      issuer: "The Art Loss Register (commercial due-diligence registry)",
      priceUSD: price,
      paid: true,
      settlement: receipt,
      match: looksStolen,
      outcome: looksStolen
        ? "MATCH: object family appears in repatriation/stolen records (MOCK fixture)."
        : "No match in stolen-art records (MOCK fixture).",
    };
  }

  // LIVE: pay the vendor's x402 invoice with the agent wallet, then read the data.
  const signer = await createSigner("base-sepolia", signingKey());
  // Ceiling = what's left of the lifetime cap, in atomic USDC (6 decimals).
  const maxAtomic = usdToAtomic(remainingBudgetUsd());
  const fetchWithPay = wrapFetchWithPayment(fetch, signer, maxAtomic);
  const url = new URL("/alr/premium-search", config.vendorUrl);
  url.searchParams.set("title", intent.title);
  if (intent.artist) url.searchParams.set("artist", intent.artist);

  // Refuse an over-budget 402 before anything is signed.
  const quote = await preflight402(url.toString(), maxAtomic);
  if (!quote.withinBudget) {
    throw new Error(
      `vendor demanded $${(quote.requiredUsd ?? 0).toFixed(6)} but only $${remainingBudgetUsd().toFixed(2)} of the $${config.maxSpendUsd.toFixed(2)} budget remains — refusing to sign`
    );
  }

  const res = await fetchWithPay(url.toString());
  if (!res.ok) throw new Error(`Vendor returned ${res.status}`);
  const data = (await res.json()) as { match?: boolean; outcome?: string; settlementHeader?: string };

  const paidUsd = quote.requiredUsd ?? price;
  recordSpendUsd(paidUsd); // count it against the lifetime MAX_SPEND_USD cap

  const account = privateKeyToAccount(signingKey());
  const receipt: PaymentReceipt = {
    mode: "real",
    network: "base-sepolia",
    asset: "USDC",
    amount: paidUsd.toFixed(2),
    payer: account.address,
    payee: config.vendorPayTo ?? "vendor",
    settledAt: new Date().toISOString(),
    explorerUrl: undefined, // tracing module (teammate) can resolve from the settlement header
  };
  return {
    database: "Art Loss Register",
    issuer: "The Art Loss Register (commercial due-diligence registry)",
    priceUSD: paidUsd,
    paid: true,
    settlement: receipt,
    match: Boolean(data.match),
    outcome: data.outcome ?? (data.match ? "Match found." : "No match."),
  };
}

/** Build and sign the Digital Provenance Passport from accumulated run state. */
async function issuePassport(ctx: RunContext): Promise<VerifiableCredential> {
  const pk = signingKey();
  const account = privateKeyToAccount(pk);
  const issuerDid = addressToDid(account.address);
  const now = new Date().toISOString();
  const risk = ctx.risk!;

  const checksRun = ["tavily-authoritative-grounding"];
  if (ctx.premiumChecks.length) checksRun.push("art-loss-register#x402");

  const body = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "DigitalProvenancePassport"],
    issuer: issuerDid,
    validFrom: now,
    credentialSubject: {
      id: `urn:artwork:${slug(ctx.intent.title)}`,
      title: ctx.intent.title,
      artist: ctx.intent.artist ?? null,
      origin: ctx.intent.origin ?? null,
      provenanceTimeline: ctx.facts.map((f) => ({
        claim: f.claim,
        source: f.sourceUrl,
        assertedBy: f.issuer ?? "unknown source",
        quote: f.sourceQuote,
      })),
      confidenceScore: risk.confidenceScore,
      redFlags: risk.redFlags,
      premiumChecks: ctx.premiumChecks.map((c) => ({
        database: c.database,
        assertedBy: c.issuer,
        match: c.match,
        outcome: c.outcome,
        paidUSD: c.priceUSD,
        payment: c.settlement,
      })),
      checksRun,
      assessedAt: now,
    },
  };
  return signCredential(body, pk, now);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Run the full pipeline for one artwork, streaming events to the website. */
export async function runProvenance(runId: string, intent: Intent, emit: Emit): Promise<VerifiableCredential> {
  const ctx = newRunContext(runId, intent, emit);

  emit("intent", { message: `Assessing “${intent.title}”${intent.artist ? ` by ${intent.artist}` : ""}.`, data: intent });

  // 2. Grounding research
  emit("reasoning", { message: "Searching authoritative sources (Met, UNESCO, Art Loss Register)…" });
  const q = `${intent.title} ${intent.artist ?? ""} provenance ownership history repatriation`;
  try {
    const raw = await searchProvenance(q, { restrictToAuthoritative: true });
    // Normalize across tavily-tool shapes (issuer vs verifiedBy).
    ctx.facts = raw.map((f) => ({
      claim: f.claim,
      sourceUrl: f.sourceUrl,
      sourceTitle: f.sourceTitle,
      sourceQuote: f.sourceQuote,
      issuer: (f as any).issuer ?? (f as any).verifiedBy ?? "web source",
    }));
  } catch (e) {
    emit("reasoning", { message: `Grounding fell back (${(e as Error).message}).` });
    ctx.facts = [];
  }
  emit("grounding", { message: `Grounded ${ctx.facts.length} cited fact(s).`, data: ctx.facts });

  // 3. Risk flagging
  ctx.risk = assessRisk(ctx);
  emit("risk", { message: `Provenance confidence: ${ctx.risk.confidenceScore}/100.`, data: ctx.risk });

  // 4. x402 — economic reasoning, then (maybe) pay for the premium check
  const decision = shouldPayForPremium(ctx.risk);
  emit("x402:offer", {
    message: `Premium Art Loss Register search available for $${config.vendorPrice} (USDC, ${facilitatorLabel()}).`,
    data: { priceUSD: config.vendorPrice, vendor: config.vendorUrl, network: "base-sepolia" },
  });
  emit("x402:decision", { message: decision.reasoning, data: { pay: decision.pay } });

  if (decision.pay) {
    try {
      const result = await runPremiumCheck(ctx);
      ctx.premiumChecks.push(result);
      emit("x402:paid", { message: `Paid $${result.priceUSD} — ${result.outcome}`, data: result });
      // Re-assess with the new evidence.
      if (result.match) {
        ctx.risk.confidenceScore = Math.max(0, ctx.risk.confidenceScore - 40);
        ctx.risk.redFlags.push({
          type: "art-loss-register-match",
          severity: "high",
          evidence: `Art Loss Register premium search: ${result.outcome}`,
        });
        emit("risk", { message: `Confidence revised to ${ctx.risk.confidenceScore}/100 after paid check.`, data: ctx.risk });
      }
    } catch (e) {
      emit("x402:decision", { message: `Premium check failed (${(e as Error).message}); proceeding without it.`, data: { pay: false } });
    }
  }

  // 5. The Passport
  const passport = await issuePassport(ctx);
  emit("passport", { message: "Signed Digital Provenance Passport issued.", data: passport });
  emit("done", { message: "Done." });
  return passport;
}
