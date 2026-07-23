/**
 * Demo website server. Serves the single-page UI and streams the agent's
 * progress over Server-Sent Events so judges watch the flow happen live:
 *   intent → grounding → risk → x402 payment decision → signed Passport.
 *
 * Run:  npm run web   (then open http://localhost:3000)
 */
import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, DEMO_MODE, facilitatorLabel } from "../config.js";
import { runProvenance } from "./pipeline.js";
import { getCatalog, getObject, issueObjectPassport, coverageFor } from "./catalog.js";
import { checkRegistries, getRegistries } from "../tools/registries.js";
import { queryWatchlist } from "./watchlist.js";
import { verifyCredential, type VerifiableCredential } from "../lib/signing.js";
import { spentUsd, remainingBudgetUsd } from "../lib/spend.js";
import type { Emit, RunEvent, Intent } from "../lib/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 3000);

// --- Guardrails (all env-tunable, safe defaults so local demo just works) ----
/** Opt-in hard auth: when set, POST /api/run needs this bearer token. */
const API_TOKEN = (process.env.API_TOKEN ?? "").trim();
/** Per-IP sliding-window rate limit for the expensive endpoint. */
const RATE_LIMIT = Number(process.env.RUN_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = Number(process.env.RUN_RATE_WINDOW_MS ?? 60_000);
/** Run buffers are evicted after this long, and the map is hard-capped. */
const RUN_TTL_MS = Number(process.env.RUN_TTL_MS ?? 10 * 60_000);
const MAX_RUNS = Number(process.env.MAX_RUNS ?? 200);
/** Grace period a finished run's buffer is kept for slow SSE clients. */
const DONE_GRACE_MS = Number(process.env.RUN_DONE_GRACE_MS ?? 60_000);

interface Run {
  events: RunEvent[];
  done: boolean;
  listeners: Set<(e: RunEvent) => void>;
  createdAt: number;
}
const runs = new Map<string, Run>();

/** Drop finished/stale runs, then hard-cap the map (insertion order = oldest first). */
function sweepRuns(now = Date.now()): void {
  for (const [id, r] of runs) {
    if (now - r.createdAt > RUN_TTL_MS) {
      r.listeners.clear();
      runs.delete(id);
    }
  }
  while (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next();
    if (oldest.done) break;
    runs.delete(oldest.value);
  }
}

// --- Per-IP rate limiting ----------------------------------------------------
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  if (!Number.isFinite(RATE_LIMIT) || RATE_LIMIT <= 0) return false; // disabled
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.size > 5_000) hits.clear(); // bound the limiter's own memory
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/** Constant-time bearer-token check. No API_TOKEN set => auth is off (local demo). */
function authorized(req: Request): boolean {
  if (!API_TOKEN) return true;
  const header = req.get("authorization") ?? "";
  const presented = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (req.get("x-api-token") ?? "").trim();
  const a = Buffer.from(presented);
  const b = Buffer.from(API_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Guard for the endpoint that can spend money. */
function guardRun(req: Request, res: Response, next: NextFunction) {
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: `rate limit: max ${RATE_LIMIT} runs per ${Math.round(RATE_WINDOW_MS / 1000)}s` });
  }
  if (!config.isMock && remainingBudgetUsd() < config.vendorPrice) {
    return res.status(402).json({
      error: `spend budget exhausted: $${spentUsd().toFixed(2)} of $${config.maxSpendUsd.toFixed(2)} MAX_SPEND_USD used`,
    });
  }
  next();
}

function emitterFor(runId: string, run: Run): Emit {
  return (phase, payload) => {
    const e: RunEvent = { phase, message: payload.message, data: payload.data, at: new Date().toISOString() };
    run.events.push(e);
    for (const l of run.listeners) l(e);
    if (phase === "done" || phase === "error") {
      run.done = true;
      // Keep the buffer around briefly so a slow client can still replay it,
      // then drop it — otherwise the map grows without bound.
      setTimeout(() => {
        run.listeners.clear();
        runs.delete(runId);
      }, DONE_GRACE_MS).unref?.();
    }
  };
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "../../public")));

/** UI bootstrap info. */
app.get("/api/config", (_req, res) => {
  res.json({
    demoMode: DEMO_MODE,
    vendorPriceUSD: config.vendorPrice,
    facilitator: facilitatorLabel(),
    maxSpendUSD: config.maxSpendUsd,
    spentUSD: Number(spentUsd().toFixed(6)),
    authRequired: Boolean(API_TOKEN),
  });
});

/** Catalog grid — the objects we already track. */
app.get("/api/catalog", (_req, res) => {
  res.json(
    getCatalog().map((o) => ({
      id: o.id,
      title: o.title,
      artist: o.artist,
      culture: o.culture,
      period: o.period,
      icon: o.icon,
      accent: o.accent,
      image: o.image,
      riskScore: o.riskScore,
      riskLevel: o.riskLevel,
      repatriation: o.repatriation,
      currentLocation: o.currentLocation,
      stops: o.journey.length,
      // Shipped with the card so the grid can never show a bare score.
      coverageClass: coverageFor(o).coverageClass,
    }))
  );
});

/** Full dashboard data for one tracked object. */
app.get("/api/object/:id", (req, res) => {
  const obj = getObject(req.params.id);
  if (!obj) return res.status(404).json({ error: "not found" });
  res.json({ ...obj, coverage: coverageFor(obj) });
});

/**
 * Issue (sign) a Passport for a catalog object.
 *
 * The try/catch is load-bearing: Express 4 does not catch rejections from an
 * async handler, so an unhandled one becomes an unhandledRejection and takes
 * the whole server down. Issuing touches the wallet key and now the live
 * register checks, both of which can fail on a normal day.
 */
app.post("/api/object/:id/passport", async (req, res) => {
  const obj = getObject(req.params.id);
  if (!obj) return res.status(404).json({ error: "not found" });
  try {
    res.json(await issueObjectPassport(obj));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * The register directory — which stolen-art / cultural-property registers this
 * agent consults, and crucially HOW it can reach each one. Exposed as its own
 * endpoint because the access tier is the most important thing a user can know
 * about a check, and burying it inside a result hides it.
 */
app.get("/api/registries", (_req, res) => {
  res.json(
    getRegistries().map((r) => ({
      id: r.id,
      name: r.name,
      issuer: r.issuer,
      jurisdiction: r.jurisdiction,
      access: r.access,
      coverage: r.coverage,
      referralUrl: r.referralUrl,
      applyUrl: r.applyUrl,
    }))
  );
});

/**
 * The stolen-art watchlist — generated from Wikidata, kept separate from the
 * curated catalog because it is a different kind of evidence. The caveat ships
 * inside the response rather than only in the UI, so a consumer hitting the
 * JSON directly cannot get the rows without the warning attached.
 */
app.get("/api/watchlist", (req, res) => {
  const status = req.query.status === "outstanding" || req.query.status === "resolved"
    ? req.query.status
    : undefined;
  res.json(
    queryWatchlist({
      q: typeof req.query.q === "string" ? req.query.q.slice(0, 120) : undefined,
      status,
      limit: Number(req.query.limit) || undefined,
    })
  );
});

/** Run the register checks for one tracked object, live. */
app.get("/api/object/:id/registries", async (req, res) => {
  const obj = getObject(req.params.id);
  if (!obj) return res.status(404).json({ error: "not found" });
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "rate limit" });
  try {
    res.json(await checkRegistries(obj.title, obj.artist));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Start a run. Returns a runId the client subscribes to over SSE. */
app.post("/api/run", guardRun, (req, res) => {
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== "string" || b.title.length > 300) {
    return res.status(400).json({ error: "title is required (max 300 chars)" });
  }
  const intent: Intent = {
    title: b.title,
    artist: b.artist || undefined,
    origin: b.origin || undefined,
    knownHistory: b.knownHistory || undefined,
    askingPriceUSD: numberOrUndef(b.askingPriceUSD),
    estimatedMarketValueUSD: numberOrUndef(b.estimatedMarketValueUSD),
  };
  sweepRuns(); // evict expired / overflowing run buffers before adding another
  const runId = randomUUID();
  const run: Run = { events: [], done: false, listeners: new Set(), createdAt: Date.now() };
  runs.set(runId, run);
  const emit = emitterFor(runId, run);

  runProvenance(runId, intent, emit).catch((e) => {
    emit("error", { message: (e as Error).message });
  });

  res.json({ runId });
});

/** SSE stream for a run: replays buffered events, then live until done. */
app.get("/api/stream/:runId", (req, res) => {
  const run = runs.get(req.params.runId);
  if (!run) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (e: RunEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  for (const e of run.events) send(e); // replay
  if (run.done) return res.end();

  const listener = (e: RunEvent) => {
    send(e);
    if (e.phase === "done" || e.phase === "error") {
      run.listeners.delete(listener);
      res.end();
    }
  };
  run.listeners.add(listener);
  req.on("close", () => run.listeners.delete(listener));
});

/** Verify a Passport's signature (tamper-evidence demo). */
app.post("/api/verify", async (req, res) => {
  try {
    const result = await verifyCredential(req.body as VerifiableCredential);
    res.json(result);
  } catch (e) {
    res.status(400).json({ valid: false, reason: (e as Error).message });
  }
});

function numberOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

app.listen(PORT, () => {
  console.log(`\n🖼️  Provenance Passport demo: http://localhost:${PORT}`);
  console.log(`    mode: ${DEMO_MODE}  |  x402: ${facilitatorLabel()}  |  premium check: $${config.vendorPrice}\n`);
});
