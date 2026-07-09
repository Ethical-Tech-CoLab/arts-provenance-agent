/**
 * Static shim for the Provenance Tracer demo.
 *
 * The real app talks to an Express + SSE backend running in DEMO_MODE=mock.
 * GitHub Pages can't run a server, so this file overrides `fetch` and
 * `EventSource` to serve pre-baked fixtures (captured from the mock backend)
 * from the sibling ./api/ folder. app.js is untouched — it just sees the same
 * shapes it always did. The live "Trace" run replays the recorded event
 * sequence on timers so it still animates like the real stream.
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
    const route = m[1];

    if (route === "config") return ok(await json("config.json"));
    if (route === "catalog") return ok(await json("catalog.json"));
    if (route === "verify") return ok(await json("verify.json"));
    if (route === "run") return ok({ runId: "static" });

    let mm;
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
