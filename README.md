# 🏛️ Digital Provenance Passport

**[Live site](https://ethical-tech-colab.github.io/arts-provenance-agent/)** ·
**[Research report](DPP-Paper.md)** (plain-language, non-technical)

An **x402-native agent** that traces the provenance of artworks and artifacts, flags
looting / repatriation / valuation risk, and issues a **cryptographically signed,
tamper-evident Passport** for each object.

Built for the Microsoft × Coinbase **x402** hackathon (Claude Code Agentic Market) —
with **Tavily** grounding, **Base Sepolia** USDC micropayments over x402, and a
wallet key that doubles as the object's signing authority (*"a wallet is PKI"*).

---

## The flow

1. **Intent** — you enter an artwork (title, artist, origin, price). *Intent is the interface.*
2. **Grounding (Tavily)** — searches an authoritative-source allowlist (Met, UNESCO,
   Art Loss Register, ICOM) and extracts only **cited** facts. A claim with no source is
   never produced — this is the structural block against **unsourced** provenance.
   Note the limit precisely: this makes an *unsourced* claim impossible to record, not a
   *false* one. The rule does not guarantee that the cited source says what the record
   claims, that it concerns the same object, that an extracted sentence has kept the
   qualification that made it accurate, or that a page on an authoritative domain is
   itself authoritative. A false claim wearing a real source address is not prevented,
   and is more dangerous for looking sourced.
3. **Risk flagging** — looting / repatriation signals, provenance gaps, source-country
   origin, and a **valuation sanity check** (extreme markups flag possible laundering) →
   a confidence score (0–100) with red flags.
4. **x402 layer** — premium due-diligence (an Art Loss Register search) is paywalled.
   The agent reads the price, **reasons about whether it's worth paying**, and settles a
   real USDC micropayment on Base Sepolia — *pay for tools you discover*.
5. **The Passport** — a signed JSON-LD Verifiable Credential (`did:pkh`, secp256k1) with
   the provenance journey, sources, confidence, and a signature anyone can verify with
   `ecrecover`. Tamper-evident and interoperable.

## The dashboard

A web UI for **tracing objects**: a gallery of tracked artifacts, and a per-object
dashboard showing **where it's been** (the provenance journey across places/countries),
**risk** (score + red flags), **repatriation** status, sources, and the signed Passport.
A search bar runs the live agent on any new object.

---

## Quick start

```bash
npm install
cp .env.example .env          # fill in keys, or run fully offline (below)

# Fully offline demo — no API keys, no funds, never hard-fails:
DEMO_MODE=mock npm run web    # → http://localhost:3000
```

### Going live (real x402 on Base Sepolia testnet)

```bash
npm run wallet -- --new       # generate a key → paste WALLET_PRIVATE_KEY into .env
#                               fund it with test USDC: https://faucet.circle.com
npm run vendor                # terminal A — the paywalled Art Loss Register vendor
DEMO_MODE=live npm run web    # terminal B — the dashboard; agent pays real USDC
```

## Scripts

| Command | What it does |
|---|---|
| `npm run web` | Demo dashboard + live agent (http://localhost:3000) |
| `npm run vendor` | x402-paywalled "ALR Premium Search" vendor |
| `npm run wallet` | Show wallet address + testnet USDC balance |
| `npm run wallet -- --new` | Generate a fresh Base Sepolia key |
| `npm run pay` | One-shot x402 payment smoke test |
| `npm run smoke-tavily` | Tavily grounding connectivity test |

## Configuration

All config lives in `.env` (see `.env.example`). The master switch is **`DEMO_MODE`**:
`mock` forces every external call (Tavily, vendor, chain, Coinbase tracing) onto cached
fixtures so the demo runs with no network; `live` tries real calls and falls back to a
fixture on any error, so the stage demo can't hard-fail.

> ⚠️ Testnet only. The wallet key is for Base Sepolia — never fund it with real money.
> `.env` and `keys/` are gitignored; never commit secrets.

## Tech

Claude Code · Tavily · Coinbase x402 (`x402-express`, `x402-fetch`) · Base Sepolia ·
viem · TypeScript / Express. Provenance scoring is a transparent, editable heuristic
rubric (see `src/web/pipeline.ts`) — not a black box.

---

## Peer Review

The full independent academic peer review of this report is in [PEER-REVIEW.md](PEER-REVIEW.md) (also available as [Word](peer-review/digital-provenance-passport-Peer-Review.docx) under [`peer-review/`](peer-review/)).

**Recommendation:** Minor revisions

**What the review found:**

- An overclaim the paper itself retracts: hallucinated history is called "structurally impossible" (S04 Objective 2) but S13 concedes the sourcing rule blocks unsourced, not false, claims. — **Fixed, in this repo and in the report text.**
- Two disagreeing scoring systems (deduction vs accumulation) return different numbers for the same object (S06/S13); no canonical scorer is designated. — **Canonical model designated.**
- The six permitted sources exclude source-country archives, Getty, and Interpol (S08), biasing coverage away from the motivating cases. — **Stated plainly, and named as the first extension.**

**Noted strength:** An exceptionally candid limitations section (S13) paired with a genuinely correct core argument: sourcing should be enforced structurally, not merely requested of a language model (S12).


### Revisions applied (peer review, Tier 2)

**The "structurally impossible" overclaim is corrected where it appears in this repo.** The sourcing rule makes *unsourced* history structurally impossible to record — not *false* history. The flow description above now states the limit at the point the claim is made rather than leaving it to a later caveat, since a reader who stops early otherwise leaves with the opposite understanding.

**The accumulation model is designated canonical.** `src/agent/assessRisk.ts` (starts at 30, adds 18 per authoritative source and 8 per press source, subtracts 12 for undated early history) is the canonical scorer, and any score reported as a result comes from it. The deduction model in `src/web/pipeline.ts` (starts at 100, subtracts named penalties) is marked non-canonical in the source.

The reason accumulation wins: an object with no published history should not score 100. A deduction model that starts every object at a perfect score treats absence of evidence as evidence of clean provenance, which inverts the tool's whole purpose.

The two models still return different numbers for the same object. **Reconciling the web pipeline onto the canonical model is committed future work** — scoring behaviour was deliberately not changed in this revision, so no previously reported number silently moves. The divergence is no longer presented as an interesting property of the system.

**The coverage bias of the permitted-source list is stated where it bites.** `AUTHORITATIVE_DOMAINS` in `src/tools/tavily.ts` now carries the finding at the point of definition: the list is five Western institutions and one commercial theft register, so the tool searches best where objects are already well documented and worst exactly where the motivating harm lives — source-country archives, colonial-era and archaeological material. A low score for a Cambodian sculpture and a low score for a Dutch painting do not mean the same thing. S13's observation that the tool cannot distinguish thin evidence from absent evidence is the symptom; this is the cause, and the report now connects them.

**Extending the list is named as the first substantive piece of future work**, not an optional one, since every other improvement operates on evidence the tool was able to find. The named gaps are the Getty Provenance Index, the German Lost Art Foundation, Interpol's stolen works of art database, and the national heritage authorities of the fourteen source countries. The list itself is deliberately unchanged in this revision: adding domains changes what every future run returns, and that belongs in a change that can be validated against known cases rather than bundled into a documentation pass.

> **Note:** the report text (S01–S13) is maintained outside this repository, on the Ethical Tech CoLab site at `/publications/digital-provenance-passport`. The Objective 2 wording, the canonical-scorer designation, and the coverage-bias paragraph have all been applied there.
