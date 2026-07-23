# Security Policy

## Reporting a vulnerability

Report privately through GitHub. **Please do not open a public issue for a
security problem.**

1. Open the **[Security](../../security)** tab of this repository
2. Click **Report a vulnerability**

That creates a private advisory visible only to the maintainers. Private
vulnerability reporting is enabled on this repository.

If you cannot use GitHub, open a public issue saying only that you have a
security report and how to reach you — no details.

### What helps

- What an attacker can do, and what access they need in order to do it
- The file and line, or a URL and the steps to reproduce
- Whether you are reporting against the published site or a local checkout

### What to expect

- Acknowledgement within **5 working days**
- An assessment, and either a fix or an explicit decision not to fix, within **30 days**
- Credit in the advisory, if you want it

There is no bug bounty. The Ethical Tech CoLab is a small research group and
this is unfunded work; please be patient.

## Supported versions

There are no releases or version tags. Only the current state of the `main`
branch is supported, and fixes are not backported.

## What this repository is

The Digital Provenance Passport — an agent that traces artwork provenance across permitted sources. Runs a web server, calls third-party APIs, and exercises an x402 micropayment flow on Base Sepolia.

## Scope

**In scope**

- Authentication and authorisation flaws — anything that lets a caller act as
  another user, or reach an endpoint they should not
- Injection of any kind, and cross-site scripting in rendered output
- Any path by which a server-side credential becomes reachable from a client
- Server-side request forgery, or a request whose destination a caller controls
- Uncapped or unauthenticated access to a paid third-party API — cost is a real
  impact here, not a theoretical one
- Exposure of a credential or token in committed code

**Out of scope**

- Findings that require access to a maintainer's machine, or to the deployment's
  environment variables
- Rate-limit tuning, absent a concrete abuse path
- Denial of service by request volume alone

## Not a security issue

Disagreement with the model, the numbers, the methodology, or the legal
analysis is **not** a security report — but we do want to hear it. Open a
normal issue. If a peer review is published in this repository
(`PEER-REVIEW.md`), read it first: the finding may already be recorded there.

These are research outputs and prototypes, published to show method and to be
argued with. They are not production systems and should not be used to make
real operational decisions.
