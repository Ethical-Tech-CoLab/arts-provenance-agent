const $ = (s) => document.querySelector(s);
const gallery = $("#galleryView");
const detail = $("#detailView");

const FLAGS = {
  Italy: "🇮🇹", Greece: "🇬🇷", Egypt: "🇪🇬", Turkey: "🇹🇷", Nigeria: "🇳🇬",
  "United States": "🇺🇸", "United Kingdom": "🇬🇧", Switzerland: "🇨🇭",
  France: "🇫🇷", Cambodia: "🇰🇭", China: "🇨🇳", Iraq: "🇮🇶", Peru: "🇵🇪",
};
const flag = (c) => FLAGS[c] || "📍";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (d) => String(d).replace(/(0x[0-9a-fA-F]{6})[0-9a-fA-F]+([0-9a-fA-F]{4})/, "$1…$2");

// ---- bootstrap -------------------------------------------------------------
fetch("/api/config").then((r) => r.json()).then((c) => {
  $("#mode").textContent = `mode: ${c.demoMode} · x402: ${c.facilitator} · check: $${c.vendorPriceUSD}`;
});

function showGallery() { detail.classList.add("hidden"); gallery.classList.remove("hidden"); }
$("#home").addEventListener("click", showGallery);

async function loadGallery() {
  const items = await (await fetch("/api/catalog")).json();
  $("#grid").innerHTML = items.map(cardHTML).join("");
  document.querySelectorAll(".card").forEach((el) =>
    el.addEventListener("click", () => openObject(el.dataset.id))
  );
}

function routeFlags(stops, country) {
  // build a compact country route from the stops count is unknown here; cards send currentLocation only
  return country ? `${flag(country)} now in ${country}` : "";
}

function cardHTML(o) {
  return `<div class="card" data-id="${o.id}">
    <div class="tile" style="background:linear-gradient(135deg, ${o.accent}33, ${o.accent}0a)">${o.icon}</div>
    <div class="body">
      <h3>${esc(o.title)}</h3>
      <div class="sub">${esc(o.culture || o.artist || "")}${o.period ? " · " + esc(o.period) : ""}</div>
      <div class="meta">
        <span class="badge risk-${o.riskLevel}">risk ${o.riskScore}/100</span>
        <span class="chip ${o.repatriation.status}">${o.repatriation.status}</span>
      </div>
      <div class="route">${flag(o.currentLocation.country)} ${esc(o.currentLocation.institution)} · ${o.stops} stops</div>
    </div>
  </div>`;
}

// ---- object dashboard ------------------------------------------------------
async function openObject(id) {
  const o = await (await fetch(`/api/object/${id}`)).json();
  renderDashboard(o);
}

function renderDashboard(o) {
  const countries = [...new Set(o.journey.map((s) => s.country))];
  const routeline = countries.map((c) => `${flag(c)}`).join(" → ");
  const years = `${o.journey[0]?.year ?? ""} → ${o.journey[o.journey.length - 1]?.year ?? ""}`;

  detail.innerHTML = `
    <span class="back" id="back">← all tracked objects</span>
    <div class="dash-head">
      <div class="hero" style="background:linear-gradient(135deg, ${o.accent}40, ${o.accent}10)">${o.icon}</div>
      <div>
        <h1>${esc(o.title)}</h1>
        <div class="sub">${esc(o.artist || o.culture || "")}${o.period ? " · " + esc(o.period) : ""}</div>
        <div class="loc">${flag(o.currentLocation.country)} Currently at <b>${esc(o.currentLocation.institution)}</b>, ${esc(o.currentLocation.city)}, ${esc(o.currentLocation.country)}</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">Provenance confidence</div><div class="v risk-${o.riskLevel}">${o.riskScore}/100</div></div>
      <div class="stat"><div class="k">Repatriation</div><div class="v" style="font-size:16px;text-transform:capitalize">${o.repatriation.status}${o.repatriation.claimant ? " · " + esc(o.repatriation.claimant) : ""}</div></div>
      <div class="stat"><div class="k">Locations traced</div><div class="v">${o.journey.length}</div></div>
      <div class="stat"><div class="k">Red flags</div><div class="v">${o.redFlags.length}</div></div>
    </div>

    <div class="cols">
      <div>
        <div class="panel">
          <h3>Where it's been <span class="sub">provenance journey</span></h3>
          <div class="routeline">${routeline} <span class="sub" style="font-size:12px">(${esc(years)})</span></div>
          <ul class="timeline">${o.journey.map(stopHTML).join("")}</ul>
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>Repatriation</h3>
          <span class="chip ${o.repatriation.status}">${o.repatriation.status}</span>
          ${o.repatriation.claimant ? `<span class="chip">claimant: ${esc(o.repatriation.claimant)}</span>` : ""}
          ${o.repatriation.year ? `<span class="chip">${esc(o.repatriation.year)}</span>` : ""}
          <div class="repat-note">${esc(o.repatriation.note)}</div>
        </div>
        <div class="panel">
          <h3>Risk & red flags</h3>
          ${o.redFlags.length ? o.redFlags.map(flagHTML).join("") : '<div class="repat-note">No red flags — well-documented provenance.</div>'}
        </div>
        <div class="panel">
          <h3>Sources</h3>
          <ul class="sources">${o.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> — ${esc(s.issuer)}</li>`).join("")}</ul>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>Provenance Passport <span class="sub">signed, tamper-evident credential</span></h3>
      <div class="actions">
        <button class="btn" id="issueBtn" data-id="${o.id}">🔐 Issue & verify passport</button>
        <span class="verify" id="verify"></span>
      </div>
      <pre id="passportJson" class="hidden"></pre>
    </div>`;

  gallery.classList.add("hidden");
  detail.classList.remove("hidden");
  window.scrollTo(0, 0);
  $("#back").addEventListener("click", showGallery);
  $("#issueBtn").addEventListener("click", () => issuePassport(o.id));
}

function stopHTML(s) {
  return `<li>
    <span class="dot ${s.type}"></span>
    <div class="yr">${esc(s.year)}</div>
    <div class="pl">${flag(s.country)} ${esc(s.place)}, ${esc(s.country)}<span class="tag ${s.type}">${s.type}</span></div>
    <div class="ev">${esc(s.event)}</div>
  </li>`;
}
function flagHTML(f) {
  return `<div class="flag"><div class="ttl sev-${f.severity}">⚑ ${esc(f.type)} <span class="sub" style="color:var(--muted);font-size:11px">(${f.severity})</span></div><div>${esc(f.evidence)}</div></div>`;
}

async function issuePassport(id) {
  const v = $("#verify"); v.textContent = "signing…"; v.className = "verify";
  const vc = await (await fetch(`/api/object/${id}/passport`, { method: "POST" })).json();
  const pre = $("#passportJson");
  pre.textContent = JSON.stringify(vc, null, 2);
  pre.classList.remove("hidden");
  const r = await (await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vc) })).json();
  if (r.valid) { v.textContent = `✓ Valid — signed by ${short(r.issuer)}`; v.className = "verify ok"; }
  else { v.textContent = `✗ ${r.reason}`; v.className = "verify no"; }
}

// ---- search (live agent trace) ---------------------------------------------
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("#searchInput").value.trim();
  if (title) runSearch(title);
});

function runSearch(title) {
  detail.innerHTML = `
    <span class="back" id="back">← all tracked objects</span>
    <div class="dash-head">
      <div class="hero" style="background:linear-gradient(135deg,#5b9dff40,#5b9dff10)">🔎</div>
      <div><h1>${esc(title)}</h1><div class="sub">Live agent trace — grounding, risk, x402 payment, passport</div></div>
    </div>
    <div class="cols">
      <div class="panel"><h3>Live trace</h3><ol class="steps" id="steps"></ol></div>
      <div>
        <div class="panel" id="riskPanel"><h3>Risk & red flags</h3><div class="repat-note">running…</div></div>
        <div class="panel"><h3>Sources</h3><ul class="sources" id="srcList"></ul></div>
        <div class="panel"><h3>Passport</h3><div class="actions"><span class="verify" id="verify"></span></div><pre id="passportJson" class="hidden"></pre></div>
      </div>
    </div>`;
  gallery.classList.add("hidden"); detail.classList.remove("hidden"); window.scrollTo(0, 0);
  $("#back").addEventListener("click", showGallery);

  fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })
    .then((r) => r.json())
    .then(({ runId }) => {
      const es = new EventSource(`/api/stream/${runId}`);
      es.onmessage = async (ev) => {
        const e = JSON.parse(ev.data);
        addStep(e);
        if (e.phase === "grounding" && Array.isArray(e.data)) {
          $("#srcList").innerHTML = e.data.map((f) => `<li><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener">${esc(f.issuer || f.sourceTitle)}</a> — ${esc(f.claim)}</li>`).join("");
        }
        if (e.phase === "risk" && e.data) {
          const lvl = e.data.confidenceScore >= 75 ? "low" : e.data.confidenceScore >= 50 ? "medium" : "high";
          $("#riskPanel").innerHTML = `<h3>Risk & red flags</h3><div class="stat" style="margin-bottom:10px"><div class="k">confidence</div><div class="v risk-${lvl}">${e.data.confidenceScore}/100</div></div>` + (e.data.redFlags || []).map(flagHTML).join("");
        }
        if (e.phase === "passport") {
          const pre = $("#passportJson"); pre.textContent = JSON.stringify(e.data, null, 2); pre.classList.remove("hidden");
          const r = await (await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e.data) })).json();
          const v = $("#verify");
          if (r.valid) { v.textContent = `✓ Valid — signed by ${short(r.issuer)}`; v.className = "verify ok"; }
          else { v.textContent = `✗ ${r.reason}`; v.className = "verify no"; }
        }
        if (e.phase === "done" || e.phase === "error") es.close();
      };
      es.onerror = () => es.close();
    });
}

function addStep(e) {
  const li = document.createElement("li");
  li.className = `step p-${e.phase.replace(/:/g, "-")}`;
  li.innerHTML = `<div class="ph">${e.phase.replace(/:/g, " · ")}</div><div>${esc(e.message || "")}</div>`;
  $("#steps")?.appendChild(li);
}

loadGallery();
