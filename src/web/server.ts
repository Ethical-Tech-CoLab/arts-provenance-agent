/**
 * Demo website server. Serves the single-page UI and streams the agent's
 * progress over Server-Sent Events so judges watch the flow happen live:
 *   intent → grounding → risk → x402 payment decision → signed Passport.
 *
 * Run:  npm run web   (then open http://localhost:3000)
 */
import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, DEMO_MODE, facilitatorLabel } from "../config.js";
import { runProvenance } from "./pipeline.js";
import { getCatalog, getObject, issueObjectPassport } from "./catalog.js";
import { verifyCredential, type VerifiableCredential } from "../lib/signing.js";
import type { Emit, RunEvent, Intent } from "../lib/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000);

interface Run {
  events: RunEvent[];
  done: boolean;
  listeners: Set<(e: RunEvent) => void>;
}
const runs = new Map<string, Run>();

function emitterFor(run: Run): Emit {
  return (phase, payload) => {
    const e: RunEvent = { phase, message: payload.message, data: payload.data, at: new Date().toISOString() };
    run.events.push(e);
    for (const l of run.listeners) l(e);
    if (phase === "done" || phase === "error") run.done = true;
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
      riskScore: o.riskScore,
      riskLevel: o.riskLevel,
      repatriation: o.repatriation,
      currentLocation: o.currentLocation,
      stops: o.journey.length,
    }))
  );
});

/** Full dashboard data for one tracked object. */
app.get("/api/object/:id", (req, res) => {
  const obj = getObject(req.params.id);
  if (!obj) return res.status(404).json({ error: "not found" });
  res.json(obj);
});

/** Issue (sign) a Passport for a catalog object. */
app.post("/api/object/:id/passport", async (req, res) => {
  const obj = getObject(req.params.id);
  if (!obj) return res.status(404).json({ error: "not found" });
  res.json(await issueObjectPassport(obj));
});

/** Start a run. Returns a runId the client subscribes to over SSE. */
app.post("/api/run", (req, res) => {
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  const intent: Intent = {
    title: b.title,
    artist: b.artist || undefined,
    origin: b.origin || undefined,
    knownHistory: b.knownHistory || undefined,
    askingPriceUSD: numberOrUndef(b.askingPriceUSD),
    estimatedMarketValueUSD: numberOrUndef(b.estimatedMarketValueUSD),
  };
  const runId = randomUUID();
  const run: Run = { events: [], done: false, listeners: new Set() };
  runs.set(runId, run);
  const emit = emitterFor(run);

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
