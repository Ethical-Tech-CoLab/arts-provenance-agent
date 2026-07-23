/**
 * Static shim for the Provenance Tracer demo.
 *
 * The real app talks to an Express + SSE backend. GitHub Pages can't run a
 * server, so this file overrides `fetch` and `EventSource` to serve pre-baked
 * fixtures from the sibling ./api/ folder. app.js is untouched — it just sees
 * the same shapes it always did. The live "Trace" run replays the recorded
 * event sequence on timers so it still animates like the real stream.
 *
 * This file is the SOURCE of the shim; `npm run build:pages` copies it into the
 * snapshot. It used to exist only on the gh-pages branch, which meant the
 * published site could not be rebuilt from the repo.
 */
(function () {
  // ./api relative to this document, so it works under the /arts-provenance-agent/ Pages subpath.
  const API = new URL("api/", document.baseURI).href;
  const realFetch = window.fetch.bind(window);
  // Use realFetch here — the fixture paths themselves contain "/api/", so going
  // through the override below would match again and recurse forever.
  const json = (path) => realFetch(API + path).then((r) => r.json());
  const ok = (data) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const path = url.replace(/^https?:\/\/[^/]+/, ""); // strip origin
    const m = path.match(/\/api\/(.*)$/);
    if (!m) return realFetch(input, init);
    const [route, qs] = m[1].split("?");
    const params = new URLSearchParams(qs || "");

    // The watchlist filters server-side in the real app; here the whole list
    // ships as one file and the same filtering runs in the browser, so the
    // static site behaves identically instead of losing the controls.
    if (route === "watchlist") {
      const wl = await json("watchlist.json");
      const needle = (params.get("q") || "").trim().toLowerCase();
      const status = params.get("status");
      let rows = wl.entries;
      if (status) rows = rows.filter((e) => e.status === status);
      if (needle) {
        rows = rows.filter((e) =>
          `${e.title} ${e.artist} ${e.collections.join(" ")} ${e.country || ""}`
            .toLowerCase()
            .includes(needle)
        );
      }
      const limit = Math.min(Math.max(Number(params.get("limit")) || 60, 1), 500);
      return ok({
        total: wl.entries.length,
        matched: rows.length,
        entries: rows.slice(0, limit),
        caveat: wl.caveat,
      });
    }

    if (route === "config") return ok(await json("config.json"));
    if (route === "catalog") return ok(await json("catalog.json"));
    if (route === "registries") return ok(await json("registries.json"));
    if (route === "verify") return ok(await json("verify.json"));
    if (route === "run") return ok({ runId: "static" });

    let mm;
    // Register checks for one object. Ordered before the bare-object route
    // because /object/:id would otherwise not match this longer path anyway,
    // but keeping the specific pattern first makes the intent obvious.
    if ((mm = route.match(/^object\/([^/]+)\/registries$/)))
      return ok(await json(`registries/${mm[1]}.json`));
    if ((mm = route.match(/^object\/([^/]+)\/passport$/)))
      return ok(await json(`passport/${mm[1]}.json`));
    if ((mm = route.match(/^object\/([^/]+)$/)))
      return ok(await json(`object/${mm[1]}.json`));

    return realFetch(input, init);
  };

  // Replay the recorded run as a fake EventSource.
  class ReplayEventSource {
    constructor(url) {
      this.url = url;
      this.onmessage = null;
      this.onerror = null;
      this._closed = false;
      this._start();
    }
    async _start() {
      let events;
      try {
        events = await json("run.json");
      } catch {
        this.onerror && this.onerror(new Event("error"));
        return;
      }
      let delay = 250;
      events.forEach((e, i) => {
        // Give the payment/passport steps a beat longer so the flow reads well.
        const gap =
          e.phase && (e.phase.startsWith("x402") || e.phase === "passport")
            ? 900
            : 650;
        delay += i === 0 ? 0 : gap;
        setTimeout(() => {
          if (this._closed || !this.onmessage) return;
          this.onmessage({ data: JSON.stringify(e) });
        }, delay);
      });
    }
    close() {
      this._closed = true;
    }
  }

  const RealEventSource = window.EventSource;
  window.EventSource = function (url, config) {
    if (/\/api\/stream\//.test(String(url))) return new ReplayEventSource(url);
    return new RealEventSource(url, config);
  };
})();
