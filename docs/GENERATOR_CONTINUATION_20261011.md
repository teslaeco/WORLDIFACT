# Generator continuation — 11 October 2026

## Scope and release status

Baseline: main `9a17d0bc2c56f5caceeb2c7bd19daa6550441398`.
This patch is source preparation, not production repair acceptance. It contains
no paid request, Oracle installation, balance correction, promotion redemption,
merge or deployment. Preserve the existing USD 1.75 provider ceiling.

Read AGENTS.md and NIGHT_SHIFT.md; the active-editor marker is IDLE. Work is on
an isolated branch. Historical browser restrictions remain recorded; do not
report Node adapters as a real phone or desktop session.

## Reverified evidence

- GitHub deployment 38156400332 succeeded on the baseline, updated at
  2026-10-11T16:43:15Z (18:43:15 Europe/Amsterdam).
- Baseline verification run 38156400424 succeeded. This does not establish a
  successful paid photo-to-GLB request.
- Public GET `/api/studio/status` returned READY / CONNECTOR_READY,
  detailedReady=true, photoReady=true, detailedReferenceLimit=4,
  newJobPolicy=legacy-usd175-v1, tiersReady=false, fastBudgetReady=false.
  Readiness is a contract response, not proof of finished geometry.
- Desktop Commander was offline at the initial check. After the owner restored
  Cloud Shell, authenticated read-only SSH responded at 19:31 UTC. The original
  user services `froge-worker.service` and `froge-tunnel.service` were active.
  All current Oracle database jobs were terminal. This does not establish that
  Worker point reservations have settled or that new generation succeeds.
- Read-only metrics run 38156996102 exposes sampled HTTP counts for a historical
  window, not queue/AI/Blender/export/save durations or individual point holds.
- Photo probe 38157168507 deliberately used invalid IDs and empty prompts.
  All three responses were 400 GENERIC_VALIDATION_REJECTED. It created no job
  and does not prove that a valid photograph reaches a model.
- Open PR #251 records Oracle transport installation independently of main;
  PR #248 records promotion activation independently of main. Their open state
  alone is not evidence that these changes are absent from production.

## Implemented corrections

### Artifact content, not just HTTP success

`server/studio.ts` previously relayed any positive-length FBX, BLEND or PBR
response as an attachment. Three arbitrary bytes were accepted by its tests.
The server now probes a bounded prefix before sending attachment headers.
GLB version/declared length, binary or ASCII FBX, Blender project/compressed
headers, and a nonempty ZIP local-file header are recognized. HTML/JSON/error
payloads are refused with a recoverable artifact error. Streamed byte counts
remain enforced. The client independently checks content before creating the
user's downloadable Blob, protecting sessions against older server versions.

This is format recognition, NOT complete FBX/BLEND decoding, ZIP CRC validation,
texture quality, model fidelity or manufacturing approval. Compressed BLEND
headers recognize envelopes only. Existing GLB structural acceptance remains
separate and unchanged. No failed artifact starts generation or changes points.

### Correct eighteen-face geometry

The separate Game Lab jewel used an octagonal antiprism (16 triangles and two
octagons). It now has 12 planar hexagons and 6 squares, with 32 shared vertices
and 48 edges. Hexagons are not regular. It is derived by truncating the six
four-valent vertices of a rhombic dodecahedron. The original FORGE frame asset,
homepage and Shop WebGL sculpture are preserved; the decorative correction
must not be described as a generation backend fix.

## Requirement matrix

| Requirement | Implemented / deployed evidence | End-to-end status and next step |
|---|---|---|
| Text / 1–4 photos to Astra | Baseline protocol preserves photo bytes/order; #261 bounds full instructions before holding points | NOT VERIFIED: run one explicitly approved account job, trace exact ID on Oracle, inspect actual input images and output |
| Astra / Sol / Luna × Fast / Slow | Three combined options only; Sol/Luna use blueprint route and basic Three.js geometry | INCOMPLETE: update installed executor, provider guard, model-specific usage evidence and request contract together before exposing modes |
| One-minute model | Historical failed-job report: 275.81 seconds total, 114.65 AI, 161.16 Blender | TARGET NOT MET by this failed job; queue/export/save are not separately reported and no useful final model was produced |
| Clean composer / preview above input / themes | Present in baseline; Cosmos/Egypt slider and four reference slots | Code evidence only; mobile/desktop visual and recovery acceptance outstanding |
| 18-face shape | Game Lab jewel corrected in this patch; original FORGE asset preserved | Geometry tests, not visual/device proof |
| Account library, thumbnails, Add to scene | Existing account-scoped routes and UI | Authenticated save, relogin, full gallery and scene insertion NOT VERIFIED |
| GLB/FBX/BLEND/textures | GLB gate exists; this patch adds server/client format recognition | Existing repository files checked; new Oracle output and full Blender/texture decoding NOT VERIFIED |
| Held points | Earlier screenshot: 1000 held / 635 available; latest 20:25 screenshots: 1500 held / 135 available | BLOCKED on individual account ledger + Oracle cost evidence. Neither total establishes the number or cost of jobs; no release or balance write |
| Admin without subscription | Admin allocation and dispatch/download checks exist | Live allocation/account use NOT VERIFIED; promotion codes are not equivalent to admin funding |
| Promo batch | PR #248 records ten account-bound 1000-point codes and activation 38074125029 | Current account redemption NOT VERIFIED; never copy private codes to this repo |

## Official model contract checked on 11 October

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/fast-mode

Model IDs are `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`. All accept images.
Astra and Sol accept low/medium/high/xhigh/max reasoning effort; Luna also
accepts none. Fast is a processing tier (`service_tier: fast`, also priority),
not a model ID or reasoning effort. Standard uses default. Fast has premium
pricing; do not opt in silently or raise the ceiling. The response's actual
service_tier can differ from the requested tier. Product labels must reflect
actual execution. Use Responses for tool calling. No six-mode availability is
inferred from a model catalog or from a successful metadata read.

The Oracle health/guard and construction code in this repository currently
pin Astra and default processing. A frontend-only selector change cannot turn
Sol/Luna blueprint outputs into detailed Blender outputs. A safe continuation
must bind model/mode to receipts, idempotency, cost guards and persisted jobs,
retain legacy receipt behavior, pass offline native Blender gates, and then
install the exact reviewed source on an idle Oracle executor.

## Access and acceptance blockers

### Latest user incident, 20:08–20:25 Amsterdam

The supplied screenshots were inspected. At 20:08 a one-photo request showed
"Confirming your request" and a recoverable job identifier. At 20:21 the UI
reported that Oracle could not find a submitted job and showed 385 available
points. At 20:25 the UI reported incomplete review/export, 250 points retained
for the displayed failure, and aggregate balances of 1500 held / 135 available /
1635 total. The next 250-point request was blocked by CREDITS_EXHAUSTED.
The screenshots do not prove that these panels refer to the same job. Do not
infer six equal holds or exact provider charges from the aggregate. Keep the
private job identifier out of this public report.

Read-only workflow 38154450233, job 114514418430, was independently inspected.
Its earlier fixed incident set contains one Oracle 404 and a different failed
job with MODEL_BUDGET_EXCEEDED / WORLDIFACT_ASTRA_COST_GUARD. That failed job
reports ten requests, two build revisions, four tool failures, known usage,
275.81 seconds total, 114.65 AI and 161.16 Blender. Its next conservative
admission required 575942 micro-USD with 566299 remaining. These are reservation
bounds, not an invoice. The existing main already includes readback guidance
for its invalid view/page arguments; do not present that guidance as a new fix
or a demonstrated successful generation. This historical report cannot settle
the newly reported holds. Queue, export and account-save durations are absent.

The latest GitHub check still reports main 9a17d0bc and no newer workflow run
than 38157168507. Local artifact validation changes have not reached production.
An earlier push attempt was rejected by automatic approval review, citing the
repository's publication restriction and insufficient authorization for push.
No alternate publication path was attempted. Explicit approval of this local
patch's push and review PR is still needed; merge/deploy and paid tests remain
separate decisions.

Existing alternate maintenance route: `.github/workflows/oracle-maintenance.yml`
(action=status), using secret-bound restricted SSH and encrypted evidence.
This session has no workflow-dispatch tool, local server credentials, or verified
account session. Do not extract GitHub secrets or rerun a historical paid job.
Required user step: reconnect the existing Desktop Commander process on Oracle
(`npx @wonderwhy-er/desktop-commander@latest remote`) and leave it running.

After read-only reconciliation, request approval for a concrete single live
test with a maximum USD 1.75 cost only if existing authorization does not cover
that exact request. A successful test must provide the request/model IDs,
actual provider model/tier, measured stage times, real GLB geometry, preview,
owned-library persistence after login, downloadable bytes and point settlement.
Further matrix tests require their own authorized total; never silently repeat
a failed paid generation. Merge/deploy require explicit approval for this patch.

## Validation of this patch

- 23 focused artifact, receiver, geometry and release-preservation tests pass.
- Local aggregate: 2204/2206 pass. The two native Chromium regressions fail
  because no Chromium executable is installed; they are not waived. The inert
  browser fixture now includes the new validator and recognized format headers.
- Lint, TypeScript, real local HTTP smoke, production build and Worker packaging
  (`npm run deploy:check`, dry-run only) pass. No production upload was made.
- The existing repository texture ZIP contains 10 entries; Python zipfile CRC
  validation reports no failure. The existing binary FBX is 10,186,796 bytes,
  version 7400. These are historical assets, not outputs from a new paid test.
- The proposed publication scope is pinned to the baseline parent and exact file
  set, requires a single-parent squash result, preserves remote variables,
  secrets and billing, and does not enable any financial waiver. It is prepared
  for review, not authorized for merge/deployment by this document.
