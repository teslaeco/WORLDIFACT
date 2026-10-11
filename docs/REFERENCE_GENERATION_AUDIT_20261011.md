# Reference generation and model routing audit — 11 October 2026

## Verified defect and correction

The v33 Oracle admission handler measures `agentInstructions` in UTF-16 code
units and rejects values above 12,000 before creating a job. The deployed
adapter produced 12,684 units for a synthetic electrical-cabinet MAKE request
with one side reference. Ordinary prompt validation did not cover that field.

The readback appendix is now shorter while retaining exact view/section enums,
revision/hash-bound pagination, complete snapshot storage, mandatory actual
image inspection and the unchanged completion/budget requirements. The complete
wire body is validated before account/global reservation and dispatch. No brief,
reference bytes, manufacturing requirement or safety gate is truncated.

Tests cover four images, every supported view, generic/cabinet/character
profiles, both priced tiers and the historical route, UTF-16 boundaries, UTF-8
body limits and repeat-submission idempotency. Synthetic fixtures are not new
provider-generated models.

## Incident evidence and limits

- The newly reported photo job is present in the authenticated account review
  list; Oracle returned 404 in diagnostic run 38154450233. This does not prove
  zero cost, the exact rejection reason, or which Oracle endpoint production
  used. The same run confirms worker readiness and connector version 33.
- Read-only production settings inspection, run 38155529898, confirms the
  Oracle/API secret bindings and enabled generation flags. Worker observability
  is disabled. ORACLE_ENDPOINT is a secret binding, so its value was neither
  read nor compared with the separate diagnostic environment.
- A deliberately invalid-ID/empty-prompt validation probe, run 38155171232,
  returned a generic 400 before any job could be created. Oracle masks validation
  exceptions, so this probe cannot identify the photo failure. It was not a
  generation test and must not be described as successful image admission.
- An explicit check of the existing account request still reports 250 points
  held, with no charge or release. Original receipts and models remain intact.
- The supplied Sol screenshot contains an OpenAI response identifier and
  gpt-6.1-sol provenance. The displayed output is a live AI blueprint rendered
  through the fixed Three.js shape catalogue, not an Oracle/Blender build.
  That catalogue cannot faithfully represent arbitrary transmission lines or
  reconstruct a reference image. No detailed Sol/Luna success is established.

## Requested model/speed work — NOT implemented by this patch

OpenAI documents `service_tier: "fast"` independently of model choice and
`reasoning.effort`. Astra/Sol support low through max; Luna also supports none.
The application currently sends default service tier with low reasoning on the
blueprint route. Oracle and its spend guard remain Astra-bound. Labels alone
cannot activate six real model/speed combinations.

A complete change needs immutable per-job model/tier/reasoning bindings,
conservative tier-aware preflight and terminal usage reconciliation, runtime
capability negotiation, actual custom geometry rather than preset substitution,
and end-to-end reference and library tests. Historical rates/receipts must not
be reinterpreted and existing per-model ceilings must not be raised silently.

The current supervised pipeline has historical Blender time alone above one
minute. Fast API documentation does not provide a one-minute complete-3D SLA.
A one-minute customer target requires a bounded first-mesh pipeline and actual
latency measurement; a timer, forced failure or premature 100% is not success.

Official references reviewed:
- https://developers.openai.com/api/docs/guides/fast-mode
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-luna

## Validation

Local lint and TypeScript pass. Of 2,192 tests, 2,190 pass; the two native
Chromium tests are BLOCKED locally because no browser binary is available.
They are mandatory in hosted GitHub CI, not waived. HTTP smoke, production
build, deployment dry-run and the three preserving-release tests pass.
The final exact-commit hosted checks govern merge eligibility.

## Release decision and rollback

GO only for the tested instruction-envelope correction through the exact
preserving source-release scope. NO-GO for claiming the reported photo incident
resolved end-to-end, detailed Sol/Luna, six processing modes, or <=60s generation.
The current Oracle desktop connection is offline; the Oracle console is
unavailable and Cloudflare GitHub login returned a session error. Existing
restricted maintenance access was not expanded to bypass those limitations.

No paid job, credit grant, refund, balance correction, subscription or secret
change is part of this patch. A future controlled image test requires explicit
approval with the unchanged maximum USD 1.75 provider liability; it has not run.
Rollback only these source changes in a separately reviewed preserving release.
Do not rewind account ledgers, remove saved models or retry failed job IDs.
