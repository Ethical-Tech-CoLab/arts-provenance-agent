/**
 * Step 1 — "intent is the interface."
 * Normalizes raw user input into a structured query object the agent works on.
 */
export interface ArtworkIntent {
  title: string;
  artist: string | null;
  period: string | null;
  imageRef: string | null;
  knownHistory: string | null;
}

export function parseIntent(raw: Partial<ArtworkIntent> & { title: string }): ArtworkIntent {
  return {
    title: raw.title.trim(),
    artist: raw.artist?.trim() || null,
    period: raw.period?.trim() || null,
    imageRef: raw.imageRef?.trim() || null,
    knownHistory: raw.knownHistory?.trim() || null,
  };
}

/** A compact search query string from the intent. */
export function intentToQuery(i: ArtworkIntent): string {
  return [i.title, i.artist, i.period, "provenance ownership history repatriation"]
    .filter(Boolean)
    .join(" ");
}
