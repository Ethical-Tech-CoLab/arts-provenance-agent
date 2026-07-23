# Peer Review — The Digital Provenance Passport: An Automated Assistant for Tracing the Ownership History of Artworks and Cultural Objects

**Reviewed as:** A plain-language technical/policy research report (masters research, Ethical Tech CoLab / NYU Center for Global Affairs), held to the standard of a strong interdisciplinary venue at the intersection of cultural-property law, provenance research, and applied AI.

**Reviewer role:** External referee, cultural-property and applied-AI methods.

**Recommendation:** Minor revisions.

**Date:** 22 July 2026

**Note on delivery:** python-docx cannot cleanly emit Word footnotes, so citations are marked inline as `[n]` and collected in a References section. This substitution is noted per the review skill's delivery convention.

## Summary of the submission

The report describes a working prototype, the Digital Provenance Passport, that automates the first pass of provenance research for artworks and cultural objects. Given a title (and optional artist, origin, price, and known history), the system searches a fixed list of authoritative institutional sources, converts each result into a dated, sourced ownership event, applies a short and inspectable set of warning rules to produce a 0 to 100 confidence score plus itemised red flags, optionally buys a commercial due-diligence check on its own initiative under a spending cap, and seals the whole assessment as a tamper-evident Verifiable Credential.

The genuine contribution is not the software but the argument it embodies, and the report is admirably clear on that point (§16). Three design commitments are the real content: (1) sourcing is enforced structurally — a claim without a source address is discarded before it can be recorded, rather than merely requested of a language model; (2) scoring is transparent arithmetic on already-cited evidence rather than a model's opinion, so any number can be disputed by disputing a named rule; and (3) the output is sealed so an assessment cannot be quietly edited after issuance. The report situates these choices against the real legal scaffolding of the field (the 1970 UNESCO Convention, the Washington Principles, the structural blind spot of stolen-art registers) and, unusually, contains a limitations section (§13) more candid and more penetrating than most reviewers would think to demand. It is a strong, honest piece of writing. The issues below are about closing the remaining gap between what the prototype demonstrates and what the report occasionally claims for it.

## Major issues

**1. The headline safeguard is stated as an absolute in one place and correctly qualified in another — the report contradicts itself on its single most important claim.** Objective 2 (§04) reads: "Make hallucinated history structurally impossible to record." The thesis and Executive Summary (§01) echo this ("cannot state a fact about an object unless it can point to the source"), and §12 calls structural sourcing "the single most defensible piece of engineering." But §13, "The risk of plausible falsehood," retracts precisely the word "impossible": the rule "does not guarantee that the source says what the record claims it says, that the source is about the same object, that the extracted sentence has not lost the qualification that made it accurate, or that a page found on an authoritative domain is itself authoritative." Both halves cannot stand. What is structurally prevented is an *unsourced* claim; a *false* claim wearing a real source address is, by the report's own §13, not prevented at all — and is more dangerous for it. This matters because the entire trust proposition of the tool rides on this sentence, and a reader who stops at §04 or §01 leaves with the opposite understanding from the one §13 painstakingly corrects. Path forward: change Objective 2 and the §01 framing to the accurate claim — "make *unsourced* history structurally impossible to record, so that every claim can be traced to and checked against its origin" — and cross-reference §13 at the point of first claim so the qualification travels with the boast.

**2. Two disagreeing scoring systems undermine the auditability thesis, and the report currently files this under "unfinished edge" rather than treating it as central.** §06 documents that the web pipeline uses a deduction model (starts at 100, subtracts named penalties) while the command-line agent uses an accumulation model (starts at 30, adds 18/8 per event, subtracts 12 for undated early history), and §13 confirms they "will not agree on the same object." The stat band even advertises this as a feature-of-note. The problem is that the paper's thesis is that judgments are computed "with arithmetic a non-programmer can read and dispute." An arithmetic that returns two materially different numbers for the same object is not yet disputable — it is ambiguous about what the number even is. This is not a cosmetic inconsistency; it is a direct hit on the paper's core epistemic claim. Path forward: designate one model as canonical for the reported results (the accumulation model is the more defensible, per the paper's own reasoning in §06 that an object with no published history should not score 100), state explicitly which model produced every score shown in §07, and reframe the second model as a discarded alternative rather than a coexisting implementation. If reconciliation is out of scope for this revision, say so in one sentence and commit to it, rather than presenting the divergence as an interesting property.

**3. The permitted-source list structurally excludes the very population of objects the motivation centers on.** §02 and §11 build the case for the tool on objects that stolen-art registers cannot catch: "almost everything looted from an archaeological site or taken under colonial rule," never inventoried and never reported. Yet §08's six permitted domains are the Met, UNESCO, the Art Loss Register, ICOM, and US government heritage sites — Western institutions and a commercial theft register — and the report itself lists the glaring omissions (Getty Provenance Index, German Lost Art Foundation, Interpol, national heritage authorities of the fourteen source countries). The consequence is not stated: the tool searches best where objects are already well documented (major Western museum holdings) and searches worst exactly where the motivating harm lives (source-country archives, colonial-era and archaeological material). §13 notes the tool "does not distinguish thin evidence from absent evidence," which is the symptom; the cause is the source list's bias against the target population, and the two observations are never connected. Path forward: add a paragraph to §08 stating plainly that the current source list biases coverage toward Western-held, well-documented objects and away from the source-country and colonial-legacy material the tool is motivated by, and name adding source-country and Getty/German Lost Art coverage as the first substantive extension rather than an optional one.

**4. Nothing in the report is validated against ground truth, and it is unclear which of the showcased numbers the system actually produced.** §13 is honest that thresholds are unvalidated and there is no test suite, and that the catalogue of five cases is "written by hand from published cases rather than produced by the system." But that candor creates a specific ambiguity the report should resolve: when §07 states that Madame X "scores 93 out of 100" and serves as the clean-record control, was that 93 computed by running the pipeline, or authored by hand alongside the case? If the flagship demonstration numbers are hand-set, the report shows the *design* of a scoring system, not its *behavior*, and the distinction is load-bearing for any reader deciding whether the method works. Path forward: run the pipeline (mock or live) on the five catalogue objects, report the machine-produced scores next to the hand-written narratives, and state explicitly which is which. Even an anecdotal five-object run — does the control land high and the Euphronios Krater land low, using one canonical scorer — converts an argument about how the tool ought to behave into modest evidence that it does.

## Minor issues

- **m1 (§07, §13).** The interface labels the confidence figure as "risk 12 out of 100," which reads exactly backwards (12 is a badly compromised record, not low risk). The report flags this twice but treats it as a documentation caveat; it is a software defect that should be fixed in the interface, not annotated. Recommend framing it as "to be corrected" rather than "to be noted."

- **m2 (§09).** Foregrounding that the payment layer was "a condition of entry" for a hackathon undercuts a feature the report then argues for on its merits. Lead with the merits argument (the administrative-friction case for autonomous micropayment of per-search due diligence is genuinely interesting) and mention the hackathon origin second.

- **m3 (§11).** "It has been ratified by 149 states" for the 1970 UNESCO Convention — please verify against the current UNESCO depositary count, which recent sources place nearer 145 to 147 states parties. **[Verification Required]** A stale or rounded figure in a cited legal claim is an easy target.

- **m4 (§06, stat band).** The stat band presents "2 different confidence scoring systems... which will not agree" as a highlighted figure. Once Major issue 2 is addressed, this stat should be removed or reframed, since it advertises a defect the revision is meant to resolve.

- **m5 (§06, §10).** Terminology collision: the top evidence tier is named "Verified by authority" (weight 0.92), while §10 rightly cautions that the word "verified" oversells what the seal proves. Consider renaming the tier "Institutional record" or similar so the word "verified" is not doing two conflicting jobs in the same document.

- **m6 (§05, stage one).** The search phrase is built by appending "provenance ownership history repatriation" to the user's terms. This biases every query toward restitution-language hits and may itself inflate the looting and repatriation flags (which §13 already admits misfire on keywords). Worth a sentence acknowledging that the query construction, not only the object, shapes what evidence returns.

## Things the report gets right

- **The limitations section (§13) is a model of its kind.** It is specific, ordered by severity, and it names the report's own most dangerous failure mode ("plausible falsehood") in plain terms rather than burying it. Protect this. Most submissions would have to be dragged to this level of candor; here it is volunteered.

- **The structural-versus-instructional argument (§12) is the paper's intellectual core and it is correct.** The distinction between asking a model to cite sources (sometimes ignored, sometimes fabricated) and making a source address a structural precondition for a record to exist is real, well-argued, and the right lesson to generalize. The count-and-disclose treatment of discarded claims is exactly the right touch.

- **The legal grounding (§11) is accurate and genuinely explanatory.** The 1970 dividing line, the fourth Washington Principle on unavoidable gaps, and the structural blind spot of stolen-art registers are explained so a non-specialist understands *why* the rules take the shape they do — the years 1933/1939/1945 and the source-country list are motivated, not asserted.

- **What the seal proves is stated with exactly the right restraint (§10).** "It proves nothing whatever about whether the contents are true... A sealed record of a bad assessment is a bad assessment that cannot be quietly improved later." That sentence should be the model for how the rest of the report calibrates its claims (see Major issue 1).

- **The prose is clean, concrete, and free of hype.** The route-silhouette image in §07 ("a tomb, to a dealer in a neutral-jurisdiction city, to a major museum, within eighteen months") teaches more about provenance red flags in one sentence than a page of definitions would.

## Verdict

Minor revisions. This is a careful, honest, and unusually self-aware report whose remaining problems are almost all about wording and framing rather than missing work, which is why it clears the bar for minor rather than major revision. The single highest-value change is to resolve the contradiction in Major issue 1: the report's most important claim is stated as an absolute ("hallucinated history structurally impossible") in §04 and §01 and then correctly retracted in §13, and until the boast is aligned with the caveat, a reader can leave with the exact opposite of the truth the author worked hardest to establish. Fix that, designate a canonical scorer (issue 2), and the report will match in its claims the discipline it so admirably shows in its limitations.

## References

[1] UNESCO. *Convention on the Means of Prohibiting and Preventing the Illicit Import, Export and Transfer of Ownership of Cultural Property.* 1970.

[2] United States Department of State. *Washington Conference Principles on Nazi-Confiscated Art.* 3 December 1998.

[3] The Art Loss Register. Commercial database of stolen art and due-diligence search service. artloss.com.

[4] International Council of Museums. *Red Lists of Cultural Objects at Risk.* icom.museum.

[5] Getty Research Institute. *Getty Provenance Index.* getty.edu.

[6] World Wide Web Consortium. *Verifiable Credentials Data Model.* w3.org/TR/vc-data-model.

[7] Coinbase. *x402: An Open Payment Standard Using HTTP Status Code 402.* 2025. github.com/coinbase/x402.
