# Backlog

Known gaps, in the order they would mislead a reader.

---

## Credibility review — 2026-07-27

A hostile-but-fair peer-review sweep of the report copy (canonical in
[DPP-Paper.md](DPP-Paper.md), mirrored on the site in
`website/src/content/publications/digital-provenance-passport.ts`). Fix in both
places. See also [PEER-REVIEW.md](PEER-REVIEW.md).

### 1. The hand-built case count contradicts itself

The catalogue is described with three different numbers: §07 and §13 say "five
real and well-documented cases," §08 says the tool "is not limited to the
fifteen objects researched by hand," and §06 cites a sixth object (the Getty
Bronze, score 26) not in the five-case list. Fix: reconcile to a single number
and make sure every object referenced — including the Getty Bronze — is covered
by that count.

### 2. (Carried from earlier) Extend the permitted-source list

The report and source both name the coverage bias as the first substantive
extension. Adding the Getty Provenance Index, the German Lost Art Foundation,
Interpol, and source-country heritage authorities changes what every run
returns, so it needs validating against known cases, then §08 of
`digital-provenance-passport.ts` updated to match.

---

## Peer-review findings (from PEER-REVIEW.md, 22 Jul 2026 — "minor revisions")

Full referee report in [PEER-REVIEW.md](PEER-REVIEW.md). Verify each against the
current report copy and check off any already fixed.

Major:
- [ ] **Contradicts itself on its headline safeguard.** §04/§01 claim
      "hallucinated history structurally impossible," but §13 retracts exactly
      that: a false claim wearing a real source address is not prevented.
      Reword Objective 2 to "make *unsourced* history structurally impossible,"
      and cross-reference §13 at first claim.
- [ ] **Two disagreeing scoring systems undermine the auditability thesis (§06,
      §13).** Web pipeline deducts from 100; CLI agent accumulates from 30; they
      disagree on the same object. Designate one canonical (the accumulation
      model), state which produced each §07 score, reframe the other as
      discarded. (Related to credibility item 1 above.)
- [ ] **Source list excludes the motivating population (§02, §08, §11).** The
      six permitted domains bias coverage toward well-documented Western
      holdings and away from source-country/colonial material. State this
      plainly in §08 and name adding Getty/German Lost Art/Interpol/source-
      country coverage as the first substantive extension. (Same as item 2.)
- [ ] **Nothing validated against ground truth (§07, §13).** Unclear whether the
      showcased scores (e.g. Madame X "93/100") were computed or hand-authored.
      Run the pipeline on the five catalogue objects and report machine scores
      next to the narratives, labelling which is which.

Minor: "risk 12/100" reads backwards — fix in the interface, not as a caveat
(m1); lead the payment layer on merits not hackathon origin (m2); verify the
1970 UNESCO "149 states" ratification count (m3); remove/reframe the
"2 scoring systems" stat once resolved (m4); "Verified by authority" tier name
collides with §10's caution on "verified" (m5); the appended search phrase
biases queries toward restitution hits (m6).
