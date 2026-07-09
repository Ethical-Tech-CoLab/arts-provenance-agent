# Deploying the demo

This app is a small Express server that streams the agent's flow over SSE, so it
needs a Node host (not static hosting like GitHub Pages).

## Fastest path — Render (free, no secrets)

The repo ships a `render.yaml` blueprint that runs in **mock mode**: every
external call (Tavily search, the x402 micropayment on Base Sepolia, Coinbase
tracing) is served from cached fixtures. Nothing is spent on-chain and no API
keys are required.

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect this GitHub repo and pick the `main` branch.
3. Render reads `render.yaml`, provisions the web service, and deploys. Done —
   copy the public URL it gives you.

`npm start` runs `tsx src/web/server.ts`, and the server binds to Render's
`$PORT` automatically.

## Going live (optional)

To run real Tavily searches and settle real Base Sepolia USDC micropayments,
set `DEMO_MODE=live` and add the keys from `.env.example`
(`TAVILY_API_KEY`, `WALLET_PRIVATE_KEY`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`,
`VENDOR_PAYTO`, …) as environment variables in the Render dashboard. A public
live deployment will spend testnet funds on every run, so keep the wallet's
balance low and consider gating access.
