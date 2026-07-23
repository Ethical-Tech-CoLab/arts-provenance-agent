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
2b. **Register checks** — the object is put to INTERPOL's Stolen Works of Art database,
   the FBI's National Stolen Art File, the Carabinieri TPC archive, the German Lost Art
   Foundation, the Getty Provenance Index, ICOM's Red Lists and Wikidata. Read
   [Stolen-art registers](#stolen-art-registers) before trusting any verdict: only one of
   those is machine-queryable, and **no register check can ever return "clear"**.
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

A web UI for **tracing objects**: a gallery of 15 tracked artifacts, and a per-object
dashboard showing **where it's been** (the provenance journey across places/countries),
**risk** (score + red flags), **repatriation** status, **stolen-art register checks**,
sources, and the signed Passport. A search bar runs the live agent on any new object.

The catalog spans the distinct shapes a provenance problem takes, because they do not
behave alike: archaeological looting (Euphronios Krater, Koh Ker Duryodhana, Lydian
Hoard), colonial acquisition (Benin Bronze, Parthenon Marbles, Rosetta Stone, Nefertiti),
Nazi-era spoliation (Klimt's *Adele Bloch-Bauer I*, Schiele's *Portrait of Wally*),
outright theft still unsolved (Vermeer's *The Concert*, Van Gogh's *Poppy Flowers*),
theft since recovered (Cellini's *Saliera*), contested export (the Getty Bronze), completed
returns (Machu Picchu material) and a clean chain (Sargent's *Madame X*).

---

## Stolen-art registers

The registers that actually certify stolen cultural property **have no public API**. This
was checked, not assumed — see the header of [`src/tools/registries.ts`](src/tools/registries.ts):

| Register | Coverage | How this agent reaches it |
|---|---|---|
| **INTERPOL Stolen Works of Art** | ~52,000 objects, certified police data, global | Domain-scoped search + referral. Real access is the ID-Art app, or an account vetted by your national NCB. |
| **INTERPOL ID-Art** | Same database, phone lookup, no login | Referral only — cannot be automated |
| **FBI National Stolen Art File** | US + foreign law-enforcement submissions | Domain-scoped search + referral (`artcrimes.fbi.gov` blocks non-browser clients) |
| **Carabinieri TPC "Leonardo"** | ~1.1M objects — the largest archive there is | Domain-scoped search + referral |
| **German Lost Art Foundation** | Nazi-era spoliation 1933–45 | Domain-scoped search + referral |
| **Getty Provenance Index** | Auction catalogues, dealer stock books | Domain-scoped search + referral |
| **ICOM Red Lists** | Object *categories* at risk by region | Domain-scoped search + referral |
| **Wikidata** | Dated theft / looting / restitution events | **Genuinely queried** over SPARQL |
| **Art Loss Register** | Commercial stolen-art database | The paid x402 check |

Three things follow, and the code enforces all three:

**A domain-scoped search reads what a register *publishes*, not what it *holds*.** Those
are different claims, so every result carries its access tier next to its verdict.

**No check can return "clear".** The strongest negative in the type is
`no-evidence-found`. This is not pedantry: material taken from an archaeological site or
under colonial rule was never inventoried and never reported stolen, so it *cannot* appear
in a stolen-property register. Rendering that absence as a clean bill of health would be
actively dangerous, and it is the exact objects this project exists for.

**Silence never earns confidence.** A register hit costs score; a register that came back
empty adds nothing. Registers that could not be searched are counted and reported as a
coverage gap, so a thin check cannot be mistaken for a thorough one.

Every check — including the ones that failed and the ones that could not run — is signed
into the Passport alongside its caveat text, so the caveat cannot be stripped downstream.

```bash
npm run smoke-registries -- "The Concert" "Johannes Vermeer"
```

Full methodology: [DPP-Paper.md §8.5–8.14](DPP-Paper.md) (the register layer and the
watchlist) and [§12.6–12.8](DPP-Paper.md) (why access is tiered, why there is no "clear",
why silence earns nothing).

### The score never travels alone

A confidence score is a count of what was **found**. How much *could* have been found
varies enormously by where an object came from — so [coverage.ts](src/lib/coverage.ts)
computes, separately, which registers could have named this object at all, and the score
is always displayed with that class attached.

Each register declares what losses it holds, which regions, whether it can identify an
individual object or only a *category*, and whether it admits material by rule or by
attention. The region used is the **jurisdiction of the loss** — not manufacture, not
current location. Those differ constantly: the Euphronios Krater was made in Athens,
looted in Italy and held in New York, and only the Italian answer reaches the Carabinieri
archive that actually recovered it.

Read straight off the catalog:

| Object | Score | Coverage | What the number means |
|---|---|---|---|
| Getty Bronze | 26/100 | well covered (3) | Italian registers reach it; an ECHR-upheld confiscation order stands |
| Rosetta Stone | 34/100 | **structurally uncovered (0)** | No register can hold a colonial-era seizure from Egypt |
| Koh Ker Duryodhana | 20/100 | partly covered (2) | Only INTERPOL, and only if the theft was ever reported |
| Benin Bronze Plaque | 18/100 | **structurally uncovered (0)** | Nothing in the set records colonial military seizure |

Similar numbers, opposite meanings. Before this existed the interface showed them
identically.

**Coverage is never folded into the score.** Adjusting the number by how much was
reachable would produce one figure meaning two things again — the exact defect being
fixed. It rides alongside, and a score is declared comparable only within its own class.

A structurally-uncovered badge is a claim about the register landscape, **not** about the
object — neither exoneration nor accusation. Where the acquisition route can't be
determined, every register counts as applicable, which biases toward *understating* the
problem rather than raising alarms that can't be justified. Full reasoning:
[DPP-Paper.md §6.7](DPP-Paper.md).

### The watchlist

Below the curated catalog sits a generated list of ~400 works Wikidata records as stolen
or plundered — filterable, and clicking any row runs the live agent on it.

**It is not an extract from INTERPOL or the FBI.** Neither is machine-queryable, as above.
It is community-maintained data: an entry is a lead to verify against the official
registers, not a register hit, and absence from it means nothing. Dates need care —
Wikidata often attaches the *restitution* date to the theft statement, so a recent year on
a Nazi-plunder record is usually a return, not a taking.

```bash
npm run build:watchlist              # regenerate from Wikidata
npm run build:watchlist -- --limit 800
```

Two constraints in that query were bugs first, and both are worth knowing if you edit it.
It is restricted to works of art because the unrestricted form also returns **people and
companies** — spoliation records attach theft events to the dispossessed as well as to
their property. And it walks `P31?/P279*` rather than `P279*` because named incidents like
the *Isabella Stewart Gardner Museum theft* are **instances** of art theft, not subclasses;
the original query silently dropped every object taken in a named heist, Vermeer's *The
Concert* included.

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
| `npm run smoke-registries -- "Title" "Artist"` | Run every stolen-art register check for one object |
| `npm run build:pages` | Regenerate the static GitHub Pages snapshot into `dist-pages/` |
| `npm run deploy:pages` | Publish `dist-pages/` to the `gh-pages` branch |

### The published site

GitHub Pages can't run the Express backend, so the [live site](https://ethical-tech-colab.github.io/arts-provenance-agent/)
is a pre-rendered capture: every API response written to a JSON file, plus
`scripts/pages/static-api.js`, which overrides `fetch`/`EventSource` to read them. The
frontend itself is unmodified.

`build:pages` signs the published passports with a **throwaway per-process key** — they
are demo artifacts that verify against themselves and commit no real identity to a public
branch — while querying the registers **for real**, so the snapshot shows what the tool
actually finds. Pass `--offline` to skip the live calls.

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
- The six permitted sources exclude source-country archives, Getty, and Interpol (S08), biasing coverage away from the motivating cases. — **Stated plainly, and now partly built: see [Stolen-art registers](#stolen-art-registers).**

**Noted strength:** An exceptionally candid limitations section (S13) paired with a genuinely correct core argument: sourcing should be enforced structurally, not merely requested of a language model (S12).


### Revisions applied (peer review, Tier 2)

**The "structurally impossible" overclaim is corrected where it appears in this repo.** The sourcing rule makes *unsourced* history structurally impossible to record — not *false* history. The flow description above now states the limit at the point the claim is made rather than leaving it to a later caveat, since a reader who stops early otherwise leaves with the opposite understanding.

**The accumulation model is designated canonical.** `src/agent/assessRisk.ts` (starts at 30, adds 18 per authoritative source and 8 per press source, subtracts 12 for undated early history) is the canonical scorer, and any score reported as a result comes from it. The deduction model in `src/web/pipeline.ts` (starts at 100, subtracts named penalties) is marked non-canonical in the source.

The reason accumulation wins: an object with no published history should not score 100. A deduction model that starts every object at a perfect score treats absence of evidence as evidence of clean provenance, which inverts the tool's whole purpose.

**The permitted-source list has been extended, and the limit of that fix is stated.** INTERPOL, the FBI's National Stolen Art File, the Carabinieri TPC archive, the German Lost Art Foundation and the Getty Provenance Index are now on the allowlist and have dedicated register checks. What this does *not* do is close the gap the reviewer identified. None of those registers is machine-queryable, so the agent reads what they publish and hands off a link for the search a human must run; the one register it truly queries, Wikidata, certifies nothing. The remaining and most important gap is unchanged: the national heritage authorities of the fourteen source countries the scorer recognises. The register layer is built so that this shows in the output — unreachable registers are counted and reported rather than quietly omitted — because the failure mode here is a thin check that reads like a thorough one.

The two models still return different numbers for the same object. **Reconciling the web pipeline onto the canonical model is committed future work** — scoring behaviour was deliberately not changed in this revision, so no previously reported number silently moves. The divergence is no longer presented as an interesting property of the system.

**The coverage bias of the permitted-source list is stated where it bites.** `AUTHORITATIVE_DOMAINS` in `src/tools/tavily.ts` now carries the finding at the point of definition: the list is five Western institutions and one commercial theft register, so the tool searches best where objects are already well documented and worst exactly where the motivating harm lives — source-country archives, colonial-era and archaeological material. A low score for a Cambodian sculpture and a low score for a Dutch painting do not mean the same thing. S13's observation that the tool cannot distinguish thin evidence from absent evidence is the symptom; this is the cause, and the report now connects them.

**Extending the list is named as the first substantive piece of future work**, not an optional one, since every other improvement operates on evidence the tool was able to find. The named gaps are the Getty Provenance Index, the German Lost Art Foundation, Interpol's stolen works of art database, and the national heritage authorities of the fourteen source countries. The list itself is deliberately unchanged in this revision: adding domains changes what every future run returns, and that belongs in a change that can be validated against known cases rather than bundled into a documentation pass.

> **Note:** the report text (S01–S13) is maintained outside this repository, on the Ethical Tech CoLab site at `/publications/digital-provenance-passport`. The Objective 2 wording, the canonical-scorer designation, and the coverage-bias paragraph have all been applied there.
