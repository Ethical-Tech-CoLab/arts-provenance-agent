/**
 * Step 2 (cont.) — build a structured provenance timeline from grounded facts.
 * Anti-hallucination rules enforced here:
 *   - No claim without a source URL is recorded (uncited guesses are dropped).
 *   - Every event carries a verifiedBy authority + a verification tier.
 */
import type { TimelineEvent } from "../../schema/passport.js";
import { tavilySearch, tavilyExtract, type GroundedFact } from "../tools/tavily.js";
import { intentToQuery, type ArtworkIntent } from "./parseIntent.js";

const TIER_CONFIDENCE: Record<GroundedFact["tier"], number> = {
  verifiedByAuthority: 0.92,
  reportedInPress: 0.6,
  inferred: 0.3,
};

export interface TimelineResult {
  timeline: TimelineEvent[];
  sources: { url: string; title: string; verifiedBy: string }[];
  dropped: number; // count of uncited facts we refused to record
}

export async function buildProvenanceTimeline(intent: ArtworkIntent): Promise<TimelineResult> {
  const facts = await tavilySearch(intentToQuery(intent), { restrictToAuthoritative: true });

  // Deepen the top authoritative hits with extract (mock returns cached content).
  const topUrls = facts.slice(0, 3).map((f) => f.sourceUrl);
  const extracted = await tavilyExtract(topUrls);

  let dropped = 0;
  const timeline: TimelineEvent[] = [];
  for (const f of facts) {
    if (!f.sourceUrl) { dropped++; continue; } // ANTI-HALLUCINATION: no source -> drop
    timeline.push({
      event: f.claim,
      date: f.date,
      location: f.location,
      source: f.sourceUrl,
      sourceType: f.sourceType,
      verifiedBy: f.verifiedBy,
      tier: f.tier,
      confidence: TIER_CONFIDENCE[f.tier],
    });
    // (extracted[f.sourceUrl] available to enrich event text if desired)
  }

  // Chronological sort; undated events sink to the end.
  timeline.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  const sources = facts.map((f) => ({
    url: f.sourceUrl,
    title: f.sourceTitle,
    verifiedBy: f.verifiedBy,
  }));

  void extracted;
  return { timeline, sources, dropped };
}
