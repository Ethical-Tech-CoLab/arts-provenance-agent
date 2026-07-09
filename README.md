# Provenance Tracer — static demo

A static, mock-data snapshot of the `arts-provenance-agent` Provenance Tracer,
deployed to GitHub Pages so it can be linked as a live demo. `static-api.js`
shims `fetch`/`EventSource` to serve pre-baked fixtures (captured from the app
running in `DEMO_MODE=mock`) — no server, no secrets, no on-chain funds. The
live "Trace" run replays a recorded agent event sequence. The full interactive
server app lives on `main`; see `DEPLOY.md` there to run it for real.
