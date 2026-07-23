/**
 * The stolen-art watchlist — a broad, generated companion to the small curated
 * catalog in ./catalog.ts.
 *
 * The two are different kinds of thing and the UI keeps them apart. The catalog
 * is fifteen objects researched by hand, each with a written provenance journey,
 * red flags and cited sources. The watchlist is a few hundred rows generated
 * from Wikidata's theft statements: no narrative, no verification, uneven
 * coverage — a starting point, not a finding.
 *
 * Regenerate with `npm run build:watchlist`. See scripts/build-watchlist.ts for
 * what the data does and does not mean; the caveat travels with the payload so
 * a consumer reading only the JSON still gets it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface WatchlistEntry {
  qid: string;
  title: string;
  artist: string;
  description: string;
  eventDate: string | null;
  collections: string[];
  events: string[];
  country: string | null;
  status: "outstanding" | "resolved";
  source: "wikidata";
  url: string;
}

export interface Watchlist {
  generatedFrom: string;
  caveat: string;
  officialSearches: Record<string, string>;
  count: number;
  entries: WatchlistEntry[];
}

/** Empty shell used when the fixture is missing — never a silent []. */
const EMPTY: Watchlist = {
  generatedFrom: "unavailable",
  caveat:
    "The watchlist fixture is missing. This is an empty list because nothing was loaded, NOT because no stolen works exist. Run `npm run build:watchlist`.",
  officialSearches: {},
  count: 0,
  entries: [],
};

let cached: Watchlist | null = null;

export function getWatchlist(): Watchlist {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(__dirname, "../../fixtures/stolen-watchlist.json"), "utf8")
    ) as Watchlist;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

/**
 * Filter by free text and status.
 *
 * `limit` bounds the response, and the caller is told the true total so a
 * truncated page cannot read as the whole list — the same reason the register
 * layer counts what it could not reach.
 */
export function queryWatchlist(opts: {
  q?: string;
  status?: "outstanding" | "resolved";
  limit?: number;
}): { total: number; matched: number; entries: WatchlistEntry[]; caveat: string } {
  const wl = getWatchlist();
  const needle = (opts.q ?? "").trim().toLowerCase();

  let rows = wl.entries;
  if (opts.status) rows = rows.filter((e) => e.status === opts.status);
  if (needle) {
    rows = rows.filter((e) =>
      `${e.title} ${e.artist} ${e.collections.join(" ")} ${e.country ?? ""}`
        .toLowerCase()
        .includes(needle)
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);
  return {
    total: wl.entries.length,
    matched: rows.length,
    entries: rows.slice(0, limit),
    caveat: wl.caveat,
  };
}
