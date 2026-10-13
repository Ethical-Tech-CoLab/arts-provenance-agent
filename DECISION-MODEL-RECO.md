# Decision-model recommendation: artwork evidence triage

Date: 2026-10-11. Status: proposal; no live experiment.
Scope: this repository. Sources and recommendations are public-only.

## Existing contract

Reviewed revision: `eafeff2a0fb7b5aa96d8104b3d837c545dcb0636`.
The [README](https://github.com/Ethical-Tech-CoLab/arts-provenance-agent/blob/eafeff2a0fb7b5aa96d8104b3d837c545dcb0636/README.md)
documents cited provenance, tiered stolen-art register access, paid tools and a
signed passport. The inspected
[coverage module](https://github.com/Ethical-Tech-CoLab/arts-provenance-agent/blob/eafeff2a0fb7b5aa96d8104b3d837c545dcb0636/src/lib/coverage.ts)
distinguishes absence inside coverage from unavailable coverage.

No register response may be promoted to "clear". The strongest negative is
`no-evidence-found`; unavailable access and errors remain visible in the signed
record. A category warning is not a verified match for the particular object.

## Recommended experiment

Use a bounded model after source retrieval to assess:

- Is the retrieved object the same object, a related object, a different object,
  or not distinguishable from available evidence?
- Does the exact source passage support, contradict, or fail to establish the
  proposed claim?

Keep input evidence and typed output separate from confidence/coverage fields.
Perform quote-presence, source availability, IDs and numerical checks in code.
Expose source references to human review, not a free-form invented explanation.

Optional later work: suggest relevant tools from an approved catalogue with a
no-tool option. Suggestions must not authorize payment, bypass access tiers,
or turn an unavailable source into a clean result.

## Alternatives and privacy

Compare current retrieval/synthesis, rules plus a local cross-encoder, Jev's
[citation-checking recipe](https://docs.typesafe.ai/cookbooks/citation_check.md),
Microsoft-Decision-1 on an approved Foundry route, and Sage where permitted.
Keep paid/register content inside its contractual access boundary. Do not assume
permission to call a register includes permission to forward its content.

The named proprietary checkpoints are not downloadable local models. Local
classifiers are separate candidates requiring license and hardware testing.

## Evaluation

Create source/object-disjoint cases with exact matches, similarly named works,
category-only alerts, missing coverage, retrieval errors, paywalled sources,
ambiguous custody and contradictory citations.

Measure candidate recall, pair precision, support false acceptance, calibration,
review burden and total cost per accepted passport analysis. Include repeated
calls, option order, object-order reversal and adversarial source text.

Hard gates: no mutation of source coverage or recorded errors; no automatic
payment; no "clear" status; no suppression of human review. A model failure
must preserve the current result and be surfaced explicitly.

## Pilot

Start offline with approved public fixtures. Then shadow the bounded assessor
behind a feature flag. Retain original and proposed outputs, sources, version
and billing metadata. Only adopt a path that meets an agreed held-out quality
bound and measured end-to-end cost/reviewer-time objective.
