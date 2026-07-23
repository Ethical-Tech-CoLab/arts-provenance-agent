const $ = (s) => document.querySelector(s);
const gallery = $("#galleryView");
const detail = $("#detailView");

const FLAGS = {
  Italy: "🇮🇹", Greece: "🇬🇷", Egypt: "🇪🇬", Turkey: "🇹🇷", Nigeria: "🇳🇬",
  "United States": "🇺🇸", "United Kingdom": "🇬🇧", Switzerland: "🇨🇭",
  France: "🇫🇷", Cambodia: "🇰🇭", China: "🇨🇳", Iraq: "🇮🇶", Peru: "🇵🇪",
  Austria: "🇦🇹", Germany: "🇩🇪", Netherlands: "🇳🇱", Thailand: "🇹🇭",
  India: "🇮🇳", Mexico: "🇲🇽", Syria: "🇸🇾", Cyprus: "🇨🇾",
  // An object whose current whereabouts are unknown is the most important
  // state on this map, so it gets a mark of its own rather than the fallback.
  Unknown: "❔",
};
const flag = (c) => FLAGS[c] || "📍";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Attribute-safe href builder. esc() does NOT cover the URL scheme, so a
// `javascript:` / `data:` value coming from an external search result would
// otherwise become a clickable XSS sink. Only http(s) survives; anything else
// (including unparseable input) collapses to "#".
// Relative values resolve against document.baseURI, NOT the origin. Pages
// serves this app from /arts-provenance-agent/, so resolving "objects/x.jpg"
// against the origin produced /objects/x.jpg and every photograph 404'd — a
// bug invisible on any test server that happens to serve from the root.
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
function safeUrl(u) {
  const raw = String(u ?? "").trim();
  if (!raw) return "#";
  try {
    const parsed = new URL(raw, document.baseURI);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return "#";
    return esc(parsed.href);
  } catch {
    return "#";
  }
}
const short = (d) => String(d).replace(/(0x[0-9a-fA-F]{6})[0-9a-fA-F]+([0-9a-fA-F]{4})/, "$1…$2");

// ---- bootstrap -------------------------------------------------------------
fetch("/api/config").then((r) => r.json()).then((c) => {
  $("#mode").textContent = `mode: ${c.demoMode} · x402: ${c.facilitator} · check: $${c.vendorPriceUSD}`;
});

// Say what this build is, up front, when it is the published capture. The
// "mode: mock" chip in the header is true but reads as jargon; someone landing
// here deserves a sentence they can actually act on.
if (window.__STATIC_DEMO__) {
  const el = $("#demoNotice");
  el.innerHTML = `<b>Static demo.</b> Register checks and traces below were captured
    ahead of time and are replayed here — GitHub Pages cannot run the agent. Passports are
    signed with a throwaway key, so they verify against themselves and prove nothing about
    any real object. The register findings were queried for real when this snapshot was
    built; everything else is a recording.`;
  el.classList.remove("hidden");
}

// ---- top-level views -------------------------------------------------------
// The methodology is a route rather than a section of the gallery: someone who
// wants to cite how the score works needs a URL that lands on it, and the
// in-page anchors (#m-scoring and friends) have to survive a reload.
const method = $("#methodologyView");
const tabs = [...document.querySelectorAll(".tab")];
const setTab = (name) => tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === name));

function showGallery() {
  detail.classList.add("hidden");
  method.classList.add("hidden");
  gallery.classList.remove("hidden");
  setTab("objects");
}

function showMethodology() {
  gallery.classList.add("hidden");
  detail.classList.add("hidden");
  method.classList.remove("hidden");
  setTab("methodology");
}

$("#home").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname + location.search);
  showGallery();
});

tabs.forEach((t) =>
  t.addEventListener("click", () => {
    if (t.dataset.view === "methodology") {
      location.hash = "methodology";
      showMethodology();
    } else {
      history.replaceState(null, "", location.pathname + location.search);
      showGallery();
      window.scrollTo(0, 0);
    }
  })
);

// `m-*` covers the table-of-contents anchors, so a link straight to one section
// opens the methodology rather than the gallery with an unreachable anchor.
function routeFromHash() {
  const h = location.hash.replace(/^#/, "");
  if (h === "methodology" || h.startsWith("m-")) showMethodology();
}
window.addEventListener("hashchange", routeFromHash);

async function loadGallery() {
  const items = await (await fetch("/api/catalog")).json();
  $("#grid").innerHTML = items.map(cardHTML).join("");
  document.querySelectorAll(".card").forEach((el) => {
    const open = () => openObject(el.dataset.id);
    el.addEventListener("click", open);
    // A card is a control, so it should behave like one: reachable by Tab and
    // activated by Enter/Space, not mouse-only.
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

function routeFlags(stops, country) {
  // build a compact country route from the stops count is unknown here; cards send currentLocation only
  return country ? `${flag(country)} now in ${country}` : "";
}

// A photograph where one exists, the emoji tile where it does not. Two objects
// have no free image of the object itself, and a stand-in — a different statue
// from the same temple, the site the material was dug out of — would be the
// caption error this whole tool argues against. They keep the emoji.
function tileHTML(o, cls) {
  if (!o.image) {
    return `<div class="${cls}" style="background:linear-gradient(135deg, ${o.accent}33, ${o.accent}0a)">${o.icon}</div>`;
  }
  return `<div class="${cls} has-img"><img src="${safeUrl(o.image.file)}" alt="${esc(o.title)}"
     loading="lazy" decoding="async" /></div>`;
}

// The licence on most of these photographs requires attribution, so the credit
// is rendered, not just carried in the data.
function creditHTML(image) {
  if (!image) return "";
  const lic = image.licenseUrl
    ? `<a href="${safeUrl(image.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(image.license)}</a>`
    : esc(image.license);
  return `<div class="img-credit">Photograph: ${esc(image.credit)} · ${lic} ·
    <a href="${safeUrl(image.source)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a></div>`;
}

function cardHTML(o) {
  return `<div class="card" data-id="${o.id}" role="button" tabindex="0"
       aria-label="Open tracing dashboard for ${esc(o.title)}">
    ${tileHTML(o, "tile")}
    <div class="body">
      <h3>${esc(o.title)}</h3>
      <div class="sub">${esc(o.culture || o.artist || "")}${o.period ? " · " + esc(o.period) : ""}</div>
      <div class="meta">
        <span class="badge risk-${o.riskLevel}">risk ${o.riskScore}/100</span>
        <span class="chip ${o.repatriation.status}">${o.repatriation.status}</span>
        ${coverageChip(o.coverageClass)}
      </div>
      <div class="route">${flag(o.currentLocation.country)} ${esc(o.currentLocation.institution)} · ${o.stops} stops</div>
      <div class="open-hint">open dashboard →</div>
    </div>
  </div>`;
}

// ---- evidence coverage ------------------------------------------------------
// The score is a count of what was found. How much COULD have been found varies
// enormously by where an object came from, so the number is shown with its
// coverage class attached and is never rendered alone.
const COVERAGE_LABEL = {
  "well-covered": "well covered",
  "partially-covered": "partly covered",
  "structurally-uncovered": "no register covers this",
};

function coverageChip(cls) {
  if (!cls) return "";
  return `<span class="chip cov cov-${cls}" title="How much of the evidence space could have covered this object">${COVERAGE_LABEL[cls] || cls}</span>`;
}

function coveragePanelHTML(c) {
  if (!c) return "";
  const able = c.identifyingRegisters.length;
  const blind = c.blindRegisters.length;
  return `<div class="panel cov-panel cov-${c.coverageClass}">
    <h3>What the score is worth <span class="sub">evidence coverage</span></h3>
    <div class="cov-bar"><span style="width:${Math.round(c.coverageRatio * 100)}%"></span></div>
    <div class="cov-counts">
      <b>${able}</b> register${able === 1 ? "" : "s"} could systematically name this object ·
      <b>${blind}</b> structurally cannot ·
      alleged route: <b>${esc(c.acquisitionMode)}</b>
    </div>
    <div class="cov-note">${esc(c.note)}</div>
    <div class="cov-note cov-compare">${esc(c.comparability)}</div>
    ${able ? `<ul class="cov-list">${c.identifyingRegisters.map((r) =>
        `<li><b>${esc(r.name)}</b> — requires ${esc(r.requires)}</li>`).join("")}</ul>` : ""}
    ${blind ? `<details class="cov-blind"><summary>${blind} register${blind === 1 ? "" : "s"} that cannot hold this object</summary>
        <ul class="cov-list">${c.blindRegisters.map((r) =>
          `<li><b>${esc(r.name)}</b> — ${esc(r.why)}</li>`).join("")}</ul></details>` : ""}
  </div>`;
}

// ---- stolen-art watchlist ---------------------------------------------------
// Rendered as a dense list rather than cards, and visually plainer than the
// curated grid above. That difference is the point: these rows are generated
// Wikidata leads, and they should not look like the researched case files.
let wlStatus = "";
let wlQuery = "";
let wlTimer = null;

function wlRowHTML(e) {
  const where = e.collections[0] || e.country || "";
  return `<div class="wl-row" role="button" tabindex="0"
       data-title="${esc(e.title)}" data-artist="${esc(e.artist)}"
       aria-label="Run a live provenance trace for ${esc(e.title)}">
    <span class="wl-status s-${e.status}">${e.status}</span>
    <span class="wl-title">${esc(e.title)}</span>
    <span class="wl-artist">${esc(e.artist)}</span>
    <span class="wl-when">${esc(e.eventDate || "—")}</span>
    <span class="wl-where">${esc(where)}</span>
    <a class="wl-wd" href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer"
       title="View on Wikidata">wd</a>
  </div>`;
}

async function loadWatchlist() {
  const params = new URLSearchParams({ limit: "60" });
  if (wlQuery) params.set("q", wlQuery);
  if (wlStatus) params.set("status", wlStatus);

  let data;
  try {
    data = await (await fetch(`/api/watchlist?${params}`)).json();
  } catch {
    $("#wlList").innerHTML = '<div class="wl-empty">Watchlist unavailable.</div>';
    return;
  }

  $("#wlCount").textContent = data.total;
  $("#wlList").innerHTML = data.entries.length
    ? data.entries.map(wlRowHTML).join("")
    : '<div class="wl-empty">No matches. That means nothing was found in <em>this list</em> — not that the object is clear.</div>';

  // Say what was cut. A silently truncated page reads as the whole result set.
  const more = $("#wlMore");
  if (data.matched > data.entries.length) {
    more.textContent = `Showing ${data.entries.length} of ${data.matched} matches — narrow the filter to see the rest.`;
    more.classList.remove("hidden");
  } else {
    more.classList.add("hidden");
  }

  document.querySelectorAll(".wl-row").forEach((el) => {
    const run = (ev) => {
      if (ev.target.closest("a")) return; // let the Wikidata link through
      runSearch(el.dataset.title, el.dataset.artist);
    };
    el.addEventListener("click", run);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(e); }
    });
  });
}

function wireWatchlistControls() {
  $("#wlSearch").addEventListener("input", (e) => {
    wlQuery = e.target.value;
    clearTimeout(wlTimer);
    wlTimer = setTimeout(loadWatchlist, 200); // debounce — this filters server-side
  });
  document.querySelectorAll(".wl-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wl-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      wlStatus = btn.dataset.status;
      loadWatchlist();
    })
  );
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
      ${tileHTML(o, "hero")}
      <div>
        <h1>${esc(o.title)}</h1>
        <div class="sub">${esc(o.artist || o.culture || "")}${o.period ? " · " + esc(o.period) : ""}</div>
        <div class="loc">${flag(o.currentLocation.country)} Currently at <b>${esc(o.currentLocation.institution)}</b>, ${esc(o.currentLocation.city)}, ${esc(o.currentLocation.country)}</div>
        ${creditHTML(o.image)}
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">Provenance confidence</div>
        <div class="v risk-${o.riskLevel}">${o.riskScore}/100</div>
        <div class="stat-qual">${o.coverage ? COVERAGE_LABEL[o.coverage.coverageClass] : ""}</div></div>
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
          ${o.redFlags.length
            ? o.redFlags.map(flagHTML).join("")
            : o.coverage && o.coverage.coverageClass === "structurally-uncovered"
              // "No red flags" is a claim about the record. Where no register
              // could hold the object, there is no record to be clean.
              ? '<div class="repat-note">No red flags surfaced — but see coverage below: no register in this set could have named this object, so this is an absence of coverage rather than a clean record.</div>'
              : '<div class="repat-note">No red flags — well-documented provenance.</div>'}
        </div>
        ${coveragePanelHTML(o.coverage)}
        <div class="panel" id="regPanel">
          <h3>Stolen-art registers</h3>
          <div class="repat-note">checking…</div>
        </div>
        <div class="panel">
          <h3>Sources</h3>
          <ul class="sources">${o.sources.map((s) => `<li><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> — ${esc(s.issuer)}</li>`).join("")}</ul>
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
  loadRegistries(o.id); // async — the dashboard renders before the checks land
}

// ---- stolen-art register checks --------------------------------------------
// The access tier is rendered next to every verdict on purpose. "No evidence
// found" from a domain-scoped web search and "no evidence found" from a real
// query are not the same claim, and a reader who cannot see which one they got
// has been told nothing useful.
const ACCESS_LABEL = {
  "structured-api": "queried directly",
  "grounded-search": "site searched, not the register",
  "referral-only": "no API — human check required",
  "paid-x402": "commercial — paid check",
};
const VERDICT_LABEL = {
  "possible-match": "possible match",
  "no-evidence-found": "no evidence found",
  "not-queryable": "not machine-queryable",
  "not-run": "not run",
};

function registryHTML(c) {
  const hits = (c.hits || []).slice(0, 3);
  return `<div class="reg reg-${c.verdict}">
    <div class="reg-head">
      <span class="reg-name">${esc(c.registry)}</span>
      <span class="reg-verdict v-${c.verdict}">${VERDICT_LABEL[c.verdict] || esc(c.verdict)}</span>
    </div>
    <div class="reg-access">${esc(ACCESS_LABEL[c.access] || c.access)} · ${esc(c.issuer)}</div>
    ${hits.length ? `<ul class="reg-hits">${hits.map((h) =>
      `<li class="${h.riskRelevant ? "hit-risk" : ""}"><a href="${safeUrl(h.source || h.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(h.claim)}</a></li>`
    ).join("")}</ul>` : ""}
    <div class="reg-caveat">${esc(c.caveat)}</div>
    <div class="reg-links">
      <a href="${safeUrl(c.referralUrl || c.officialSearch)}" target="_blank" rel="noopener noreferrer">run the official search →</a>
      ${c.applyUrl ? ` <a href="${safeUrl(c.applyUrl)}" target="_blank" rel="noopener noreferrer">apply for database access →</a>` : ""}
    </div>
  </div>`;
}

function registryPanelHTML(summary) {
  if (!summary || !summary.checks) return '<div class="repat-note">Register checks unavailable.</div>';
  return `<div class="reg-summary">
      ${summary.possibleMatches} possible match(es) · ${summary.notQueryable} of ${summary.checks.length}
      registers have no public API and were not searched. <b>No register here can return “clear”.</b>
    </div>` + summary.checks.map(registryHTML).join("");
}

async function loadRegistries(id) {
  const el = $("#regPanel");
  if (!el) return;
  try {
    const summary = await (await fetch(`/api/object/${id}/registries`)).json();
    el.innerHTML = `<h3>Stolen-art registers <span class="sub">INTERPOL · FBI NSAF · TPC · Lost Art · Getty · ICOM · Wikidata</span></h3>${registryPanelHTML(summary)}`;
  } catch {
    el.innerHTML = '<h3>Stolen-art registers</h3><div class="repat-note">Register checks could not be run. That is not a negative result — nothing was established either way.</div>';
  }
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

function runSearch(title, artist) {
  // On the published static capture the backend is a recording, and it replays
  // the SAME object no matter what was asked for. Show the recorded object's
  // name and say so, rather than printing the query above someone else's
  // provenance — a heading that misattributes findings is worse than no demo.
  const stat = window.__STATIC_DEMO__;
  const heading = stat ? stat.recordedObject : title;
  const subtitle = stat
    ? "Recorded trace — grounding, registers, risk, x402 payment, passport"
    : `${artist ? esc(artist) + " · " : ""}Live agent trace — grounding, registers, risk, x402 payment, passport`;

  detail.innerHTML = `
    <span class="back" id="back">← all tracked objects</span>
    ${stat ? `<div class="replay-note"><b>Recorded demonstration.</b> ${esc(stat.note)}
       You asked for “${esc(title)}”; what follows is the stored run for
       <b>${esc(stat.recordedObject)}</b>. Run the project locally for a real search.</div>` : ""}
    <div class="dash-head">
      <div class="hero" style="background:linear-gradient(135deg,#5b9dff40,#5b9dff10)">🔎</div>
      <div><h1>${esc(heading)}</h1><div class="sub">${subtitle}</div></div>
    </div>
    <div class="cols">
      <div class="panel"><h3>Live trace</h3><ol class="steps" id="steps"></ol></div>
      <div>
        <div class="panel" id="riskPanel"><h3>Risk & red flags</h3><div class="repat-note">running…</div></div>
        <div class="panel" id="covPanel"><h3>What the score is worth</h3><div class="repat-note">waiting…</div></div>
        <div class="panel" id="regPanel"><h3>Stolen-art registers</h3><div class="repat-note">waiting…</div></div>
        <div class="panel"><h3>Sources</h3><ul class="sources" id="srcList"></ul></div>
        <div class="panel"><h3>Passport</h3><div class="actions"><span class="verify" id="verify"></span></div><pre id="passportJson" class="hidden"></pre></div>
      </div>
    </div>`;
  gallery.classList.add("hidden"); detail.classList.remove("hidden"); window.scrollTo(0, 0);
  $("#back").addEventListener("click", showGallery);

  fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, artist }) })
    .then((r) => r.json())
    .then(({ runId }) => {
      const es = new EventSource(`/api/stream/${runId}`);
      es.onmessage = async (ev) => {
        const e = JSON.parse(ev.data);
        addStep(e);
        if (e.phase === "grounding" && Array.isArray(e.data)) {
          $("#srcList").innerHTML = e.data.map((f) => `<li><a href="${safeUrl(f.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(f.issuer || f.sourceTitle)}</a> — ${esc(f.claim)}</li>`).join("");
        }
        if (e.phase === "registry" && e.data) {
          $("#regPanel").innerHTML =
            `<h3>Stolen-art registers <span class="sub">INTERPOL · FBI NSAF · TPC · Lost Art · Getty · ICOM · Wikidata</span></h3>` +
            registryPanelHTML(e.data);
        }
        if (e.phase === "risk" && e.data) {
          const lvl = e.data.confidenceScore >= 75 ? "low" : e.data.confidenceScore >= 50 ? "medium" : "high";
          const cov = e.data.coverage;
          $("#riskPanel").innerHTML =
            `<h3>Risk & red flags</h3>
             <div class="stat" style="margin-bottom:10px"><div class="k">confidence</div>
               <div class="v risk-${lvl}">${e.data.confidenceScore}/100</div>
               <div class="stat-qual">${cov ? COVERAGE_LABEL[cov.coverageClass] : ""}</div></div>` +
            (e.data.redFlags || []).map(flagHTML).join("");
          // Coverage lands in its own panel next to the score, on the live path
          // as well as the catalog one — a number shown without it is the bug.
          const cp = $("#covPanel");
          if (cp && cov) cp.outerHTML = coveragePanelHTML(cov);
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
wireWatchlistControls();
loadWatchlist();
routeFromHash();
