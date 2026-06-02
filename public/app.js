const $ = (s) => document.querySelector(s);
const steps = $("#steps");
let lastPassport = null;

const EXAMPLES = {
  krater: { title: "Euphronios Krater", artist: "Euphronios (potter Euxitheos)", origin: "Italy (Etruscan, Cerveteri)", knownHistory: "Surfaced on the art market in 1971; acquired by the Met in 1972; repatriated to Italy in 2008.", askingPriceUSD: 1000000, estimatedMarketValueUSD: 250000 },
  clean: { title: "Madame X (Madame Pierre Gautreau)", artist: "John Singer Sargent", origin: "France / United States", knownHistory: "Exhibited 1884 Paris Salon; acquired by the Met from the artist in 1916; continuous documented ownership.", askingPriceUSD: 0, estimatedMarketValueUSD: 0 },
  laundering: { title: "Untitled (attributed antiquity)", artist: "Unknown", origin: "Turkey", knownHistory: "No documented ownership before 1995.", askingPriceUSD: 9000000, estimatedMarketValueUSD: 400000 },
};

// Load mode banner.
fetch("/api/config").then((r) => r.json()).then((c) => {
  $("#mode").textContent =
    `mode: ${c.demoMode} · x402: ${c.facilitator} · premium check: $${c.vendorPriceUSD} · spend cap: $${c.maxSpendUSD}`;
});

document.querySelectorAll(".chip").forEach((btn) =>
  btn.addEventListener("click", () => {
    const ex = EXAMPLES[btn.dataset.ex];
    for (const [k, v] of Object.entries(ex)) {
      const el = document.querySelector(`[name="${k}"]`);
      if (el) el.value = v || "";
    }
  })
);

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
  startRun(body);
});

async function startRun(body) {
  steps.innerHTML = "";
  $("#passportPanel").classList.add("hidden");
  $("#verifyResult").textContent = "";
  $("#go").disabled = true;
  lastPassport = null;

  let runId;
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "failed to start");
    runId = json.runId;
  } catch (err) {
    addStep({ phase: "error", message: err.message });
    $("#go").disabled = false;
    return;
  }

  const es = new EventSource(`/api/stream/${runId}`);
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    addStep(e);
    if (e.phase === "passport") showPassport(e.data);
    if (e.phase === "done" || e.phase === "error") {
      es.close();
      $("#go").disabled = false;
    }
  };
  es.onerror = () => { es.close(); $("#go").disabled = false; };
}

function addStep(e) {
  const li = document.createElement("li");
  li.className = `step p-${e.phase.replace(/[:]/g, "-")}`;
  const label = e.phase.replace(/:/g, " · ");
  li.innerHTML = `<div class="ph">${label}</div><div class="msg">${esc(e.message || "")}</div>`;

  if (e.phase === "grounding" && Array.isArray(e.data)) {
    const ul = document.createElement("ul");
    ul.className = "facts";
    e.data.forEach((f) => {
      const a = `<a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener">${esc(f.issuer || f.sourceTitle)}</a>`;
      ul.innerHTML += `<li>${esc(f.claim)} — ${a}</li>`;
    });
    li.appendChild(ul);
  }
  if (e.phase === "risk" && e.data) {
    const s = e.data.confidenceScore;
    const cls = s >= 75 ? "hi" : s >= 50 ? "mid" : "lo";
    li.querySelector(".msg").innerHTML =
      `Provenance confidence: <span class="score ${cls}">${s}/100</span>`;
    (e.data.redFlags || []).forEach((f) => {
      const d = document.createElement("div");
      d.className = "flag";
      d.innerHTML = `<span class="sev-${f.severity}">⚑ ${esc(f.type)}</span> — ${esc(f.evidence)}`;
      li.appendChild(d);
    });
  }
  steps.appendChild(li);
  li.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showPassport(vc) {
  lastPassport = vc;
  $("#passportPanel").classList.remove("hidden");
  $("#passportJson").textContent = JSON.stringify(vc, null, 2);
}

$("#verifyBtn").addEventListener("click", async () => {
  if (!lastPassport) return;
  const out = $("#verifyResult");
  out.textContent = "verifying…";
  out.className = "";
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lastPassport),
  });
  const r = await res.json();
  if (r.valid) {
    out.textContent = `✓ Valid — signed by ${short(r.issuer)}`;
    out.className = "ok";
  } else {
    out.textContent = `✗ Invalid — ${r.reason || "signature mismatch"}`;
    out.className = "no";
  }
});

$("#copyBtn").addEventListener("click", () => {
  if (lastPassport) navigator.clipboard.writeText(JSON.stringify(lastPassport, null, 2));
});

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function short(did) {
  return String(did).replace(/(0x[0-9a-fA-F]{6})[0-9a-fA-F]+([0-9a-fA-F]{4})/, "$1…$2");
}
