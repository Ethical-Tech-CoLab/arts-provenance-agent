# Backlog

Known gaps, in the order they would mislead a reader.

---

## Credibility review — 2026-07-27

A hostile-but-fair peer-review sweep of the report copy (canonical in
[DPP-Paper.md](DPP-Paper.md), mirrored on the site in
`website/src/content/publications/digital-provenance-passport.ts`). Fix in both
places. See also [PEER-REVIEW.md](PEER-REVIEW.md).

### 1. ~~The hand-built case count contradicts itself~~ **CLOSED 2026-10-12**

Done. §7.7 now counts fifteen, names all fifteen (the Getty Bronze among them),
and §13.7 and §6.3 use the same number. New §7.8 states that every catalogue
score is hand-authored. Fixed in DPP-Paper.md only; the site mirror still needs
syncing.

The catalogue is described with three different numbers: §07 and §13 say "five
real and well-documented cases," §08 says the tool "is not limited to the
fifteen objects researched by hand," and §06 cites a sixth object (the Getty
Bronze, score 26) not in the five-case list. Fix: reconcile to a single number
and make sure every object referenced — including the Getty Bronze — is covered
by that count.

### 2. (Carried from earlier) Extend the permitted-source list

*Still open 2026-10-12.* Not done: validating against known cases needs live
Tavily runs, which are paid. Skipped on that ground.

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
- [x] **Contradicts itself on its headline safeguard.** Done 2026-10-12: §1.2 and §4.2 reworded, both cross-reference §13.8; §16.3 matched. §04/§01 claim
      "hallucinated history structurally impossible," but §13 retracts exactly
      that: a false claim wearing a real source address is not prevented.
      Reword Objective 2 to "make *unsourced* history structurally impossible,"
      and cross-reference §13 at first claim.
- [x] **Two disagreeing scoring systems undermine the auditability thesis (§06,
      §13).** Web pipeline deducts from 100; CLI agent accumulates from 30; they
      disagree on the same object. Designate one canonical (the accumulation
      model), state which produced each §07 score, reframe the other as
      discarded. (Related to credibility item 1 above.) Done 2026-10-12: §6.3
      rewritten, §6.4 relabelled as the non-canonical model's values, §7.8
      says no §07 score was computed.
- [x] **Source list excludes the motivating population (§02, §08, §11).** The
      six permitted domains bias coverage toward well-documented Western
      holdings and away from source-country/colonial material. State this
      plainly in §08 and name adding Getty/German Lost Art/Interpol/source-
      country coverage as the first substantive extension. (Same as item 2.)
      Done 2026-10-12: bias paragraph added to §8.4.
- [x] **Nothing validated against ground truth (§07, §13).** Unclear whether the
      showcased scores (e.g. Madame X "93/100") were computed or hand-authored.
      Run the pipeline on the five catalogue objects and report machine scores
      next to the narratives, labelling which is which. Partly done
      2026-10-12: the pipeline needs paid Tavily calls, so it was not run; the
      showcased scores are labelled hand-authored in §7.8, §6.3 and §13.7.

Minor, all **CLOSED 2026-10-12**: "risk 12/100" reads backwards (m1): card
label in public/app.js now says "confidence", §7.2 and §13.6 record the fix.
Payment layer led on merits (m2): §9.1 reordered. UNESCO count (m3): 149
corrected to 150 per unesco.org "About 1970 Convention", last updated 5 Oct
2026. "2 scoring systems" stat (m4): §13.5 and §16.2 reframed; the stat band
itself lives in the site mirror and must be removed there. Tier name (m5):
`verifiedByAuthority` renamed `institutionalRecord` in schema, tools, fixtures
and the methods page; §6.2 explains the rename. Search phrase (m6): §5.1 and
§13.2 say the query shapes the evidence.

## Site mirror sync (website repo, out of scope here)

`website/src/content/publications/digital-provenance-passport.ts` must pick
up: §1.2, §4.2 and §16.3 wording; the new §6.3 and §6.4 lead; §6.2 tier
rename; §7.2, new §7.7 and §7.8; the §8.4 bias paragraph; §9.1; the 150-state
count in §11.1; §13.2, §13.5, §13.6, §13.7; removal of the "2 scoring systems"
stat from the stat band.
