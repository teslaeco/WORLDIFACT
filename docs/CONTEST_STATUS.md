# WORLDIFACT — Product Hunt comments embed prepared

Date: 19 September 2026.

## PREPARED — NOT MERGED / NOT DEPLOYED

- Branch: `feat/product-hunt-comments-embed`.
- Added the exact Product Hunt comments card supplied by the owner: `https://cards.producthunt.com/cards/comments/5874571?v=1`.
- Added the official Product Hunt featured badge supplied by the owner (`post_id=1254175`) and the official product-review badge (`product_id=1321124`).
- The Product Hunt area is labelled as community feedback, is responsive on mobile, lazy-loads remote Product Hunt assets, and links to the WORLDIFACT Product Hunt product/review surfaces.
- No copy asks for an upvote; the page asks for feedback and reviews.
- No paid API generation, OpenAI/Oracle secret, allowance, model ID or MAKE status changed.
- Merge and production deployment require explicit owner approval after CI is green.

---

# WORLDIFACT — AI Shop generation root-cause fix

Date: 18 September 2026.

## RELEASED — PR #52

- PR #52: https://github.com/teslaeco/WORLDIFACT/pull/52 — **MERGED**.
- Squash merge on `main`: `955eee944dedbe01433dad68e1853bb1fd1a4272`.
- Exact-head verification: **SUCCESS — 206/206 tests PASS**, zero failures.
- Production workflow `35389099460`: **SUCCESS**.
- Cloudflare version: `80a77d03-a19a-4ce9-8cec-aa570b59eeeb`.
- Public URL: https://worldifact.xodobrox.workers.dev

## VERIFIED — root cause

A real public FAST Studio job was accepted as `queued` and then failed on the Oracle worker with the exact worker detail:

`No valid current FAST draft exists.`

The failure was not caused by the browser, depleted allowance or missing Oracle connection. Production at diagnosis still had remaining shared allowance and `/api/studio/prepare` returned a valid signed receipt.

Direct Oracle health advertises the FAST profile/revision, but the reviewed FAST monetary/production guard is not present in production health. WORLDIFACT had therefore been exposing FAST as customer-usable before the complete FAST path was verified.

## VERIFIED — STANDARD production E2E

- Real STANDARD job: `9bd056d7-826a-4508-9330-2db93022091c`.
- State progression: `queued → building → succeeded`.
- Retrieved and validated GLB: **923,624 bytes**.
- Production STANDARD E2E test: **PASS**.
- This consumed one real shared reservation; it is genuine production evidence, not a mock.

## FIX

- FAST submissions now fail closed **before paid reservation** unless both the exact FAST capability and reviewed FAST budget guard are confirmed.
- AI Shop automatically switches a restored FAST draft to STANDARD when FAST is not fully verified.
- Failed/cancelled restored jobs are archived and cleared automatically after status recovery; the user's description is preserved.
- STANDARD remains the active verified customer 3D generation path.
- No secret, model identifier or Oracle credential changed.
- MAKE remains **VALIDATION REQUIRED**.

## POST-DEPLOY READ-ONLY STATUS

At `2026-09-18T20:02:44Z`:

```json
{
  "health": {
    "generationReady": true,
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  },
  "studio": {
    "ready": true,
    "reason": "READY",
    "oracle": "CONNECTOR_READY",
    "photoReady": true,
    "fastReady": true,
    "fastBudgetReady": false,
    "allowance": { "used": 23, "limit": 50, "remaining": 27 }
  }
}
```

The Shop uses both FAST readiness signals, so `fastBudgetReady:false` forces the customer flow to STANDARD instead of the broken FAST path.

---

# WORLDIFACT — LIVE generation restored after Product Hunt allowance exhaustion

Date: 18 September 2026.

## RELEASED — PR #51

- PR #51: https://github.com/teslaeco/WORLDIFACT/pull/51 — **MERGED**.
- Squash merge on `main`: `02e04e9a2194a01b124cb67ed16a7f48fef6aaa0`.
- Exact-head verification `35372652498`: **SUCCESS** — **205/205 tests PASS**, zero failures.
- Post-merge verification `35372838941`: **SUCCESS**.
- Production workflow `35372839006`: **SUCCESS**.
- Cloudflare version: `c05df2e0-6487-4d28-b317-e7946f9009e4`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 contract, explicit no-cost DEMO path and origin rejection.

## VERIFIED — generation restored

Production read-only diagnostic after deployment:

```json
{
  "health": {
    "generationReady": true,
    "mode": "READY",
    "allowance": { "used": 15, "limit": 50, "remaining": 35 }
  },
  "oracleWorlds": {
    "oracle": "CONNECTOR_READY"
  },
  "studio": {
    "ready": true,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "READY",
    "allowance": { "used": 15, "limit": 50, "remaining": 35 }
  }
}
```

- The Durable Object counter was **not reset**. The 15 historical reservations remain counted.
- The new cumulative ceiling is **50**, leaving **35** reservations at this verification point.
- Fixed contest expiry remains **2026-09-19T07:00:00Z** and the existing per-IP rate limiter remains active.
- `/api/health` now reads the real persistent allowance and stops advertising LIVE when the allowance is exhausted.
- AI Game Lab stops showing Astra as available after a 429/503 response.
- AI Shop no longer presents a failed/cancelled restored job as an endlessly running multi-hour generation; it provides **Start a new model**, safely archives the old receipt and preserves the draft.
- No secret, OpenAI key, Oracle credential or model ID changed. MAKE remains **VALIDATION REQUIRED**.

---

# WORLDIFACT — restore LIVE generation after launch allowance exhaustion

Date: 18 September 2026.

## VERIFIED — current incident
- Production release from PR #50 is healthy, but the persistent shared generation allowance is exhausted: `used 15 / limit 15 / remaining 0`.
- Customer Android screenshots at launch time show AI Game Lab still labelled "Astra blueprint ready" while a LIVE request returns `Preview generation allowance has ended`, and AI Shop shows a restored failed job with an old multi-hour elapsed timer.
- Root cause #1: `/api/health` previously reported configuration readiness without reading the Durable Object's real remaining allowance.
- Root cause #2: the Shop correctly restored an old receipt, but its failed-state card still rendered the historical elapsed duration and looked like an active hung generation.
- OpenAI Model Guide rechecked 18 Sep 2026: production model remains `gpt-6-astra` through the Responses API: https://developers.openai.com/api/docs/guides/latest-model

## IMPLEMENTED — hotfix branch
- Branch: `hotfix/restore-live-generation-20260918`.
- The cumulative contest ceiling is raised from **15 to 50**. The persistent counter is **not reset**; the 15 already-reserved attempts remain counted, so this change restores at most **35 additional reservations**.
- The fixed contest expiry remains **2026-09-19T07:00:00Z** and the existing per-IP limiter remains active.
- `/api/health` now reads the real shared allowance and advertises `READY` only while `remaining > 0`. When exhausted, it truthfully switches to DEMO instead of showing a misleading Astra-ready state.
- AI Game Lab immediately stops advertising LIVE after a 429/503 response.
- AI Shop no longer shows a failed/cancelled restored job as an endlessly running timer. It exposes a visible **Start a new model** action that safely archives the old receipt before clearing the selection.
- No secret, OpenAI key, Oracle endpoint/token or provider model identifier is changed.
- MAKE remains **VALIDATION REQUIRED**.

## AUTHORIZATION
- The owner previously explicitly authorized API spending through the available API funds and explicitly authorized merge/deploy for the launch recovery. This hotfix uses that authorization while retaining the hard cumulative ceiling, expiry and rate limiter above.
- Merge/deploy only after exact-head CI is green.

---

# WORLDIFACT — Product Hunt live stability hotfix

Date: 18 September 2026.

## VERIFIED — incident cause
- Customer screenshots show AI Game Lab returning `Preview generation allowance has ended. DEMO is still available.` and AI Shop changing from available earlier in the day to unavailable after a long failed job.
- The production safety design uses one persistent Durable Object counter for Astra blueprints, Studio and Oracle submissions. Reservations are cumulative and are intentionally not reset or refunded by deploys or failed requests.
- The authorized contest release ceiling remains 15 total reservations. This hotfix does **not** raise that paid ceiling and does not reset the counter.
- Exact current reserved-attempt count has not been freshly read from production in this branch; no extra paid request is used for diagnosis.

## IMPLEMENTED — no-cost launch resilience
- Branch: `hotfix/producthunt-live-stability-20260918`.
- Astra portal generation falls back immediately to explicit `DEMO · MOCK` when LIVE returns 429/503, without making a second provider request.
- AI Shop exposes an explicit local procedural 3D `DEMO · MOCK` preview while LIVE Studio generation is unavailable. It is never treated as a generated production mesh or MAKE-approved asset.
- Chess Cube 512 no longer starts as a nested heavyweight 3D iframe on the portal route. The route gives an immediate full-screen same-origin guest launch plus the original public build link, reducing mobile WebGL/memory stalls.
- World audio now uses audible locally synthesized 30-second loops with distinct themes for the meadow, Chess, Fix ISS, 8 Planets, Shop and Game Lab. No remote audio asset or generation API is used.

## RELEASED — PR #50
- PR #50: https://github.com/teslaeco/WORLDIFACT/pull/50 — **MERGED**.
- Squash merge on `main`: `bd5dee5b9adff2f53d90150ad8d4c3e7e30e77c7`.
- Exact-head PR verification `35334247265`: **SUCCESS**.
- Post-merge main verification `35343128366`: **SUCCESS**.
- Production workflow `35343128317`: **SUCCESS**.
- Cloudflare version: `4fde199c-c92a-416d-ad18-d18558794f8c`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 behavior, explicit DEMO generation path and origin rejection. No paid API call was made by the release smoke.
- Production `/api/health`: `generationReady: true`, `mode: READY`, model `gpt-6-astra`.
- Oracle bridge: `CONNECTOR_READY`.
- Production Studio read-only diagnostic: `ready: false`, `photoReady: true`, `fastReady: true`, reason `ALLOWANCE_EXHAUSTED`, allowance `used: 15 / limit: 15 / remaining: 0`.

## CURRENT BOUNDARY
- The no-cost launch resilience hotfix is live: Astra/Shop fall back to explicit `DEMO · MOCK`, Chess uses the mobile-safe full-screen guest launcher with watchdog, and each world has a distinct 30-second local audio loop.
- Restoring additional **real paid** Astra/Studio generation after the persistent ceiling is exhausted still requires a new explicit cumulative request ceiling/cost authorization.

---

# WORLDIFACT — FINAL CONTEST LIVE RELEASE STATUS

Date: 18 September 2026.

## VERIFIED — production LIVE

- Public URL: https://worldifact.xodobrox.workers.dev
- Current documented main release: `ef0ea61d2a378ed4d564b5f175f0780dd3d61fdb` (PR #49).
- PR #47: bounded contest LIVE Astra + Studio generation — **MERGED**.
- PR #48: LIVE-safe no-cost release smoke — **MERGED**.
- PR #49: read-only verification of the succeeded contest Studio GLB — **MERGED**.
- Main CI run `35290764716`: **SUCCESS** — **201/201 tests PASS**, 0 failures, lint 10 warnings / 0 errors, typecheck/build/HTTP smoke/foundation assembly/Wrangler dry-run PASS.
- Production run `35290764801`: **SUCCESS**.
- Cloudflare version: `a707acf7-f67b-4ee3-870b-d6c9cdaf3ba2`.
- Public release smoke: **PASS** — LIVE release, 13 HTML routes, 23 matching hub assets, 105 pinned original app entries/assets, API 404 contract, explicit no-cost DEMO path and origin rejection.
- Production `/api/health`: `generationReady: true`, `mode: READY`, model `gpt-6-astra`.
- Oracle bridge: `CONNECTOR_READY`.
- Studio: `ready: true`, `photoReady: true`, `fastReady: true`, reason `READY`.

## VERIFIED — real paid generation evidence

### GPT-6 Astra
- Real LIVE request: `7c73e32a-9ea5-4446-8cfa-88869ef6ce08`.
- OpenAI provider response: `resp_045e51c5890735c7016aac829307e887d2a354469365e377f6`.
- Result: **LIVE · GENERATED**, 3 validated scene objects.
- This proves the production server-side Responses API path returned a real validated Astra result. It does not claim an arbitrary finished 3D production mesh.

### Studio / Oracle / Blender 3D
- Real Studio job: `3fb599e9-c07b-44d9-ac29-af62f04eede9`.
- Job reached: **succeeded**.
- Read-only artifact verification run `35290860092`: **SUCCESS**.
- Retrieved GLB: **30,344 bytes**.
- SHA-256: `dd42f8c5d5853873de21390c11c1261d3ff86a2af52259bd16231ae850c816c2`.
- Structural report: **10 meshes, 39 nodes, 4 materials, 0 animations, 452 declared vertices**.
- Artifact provenance remains **GENERATED-UNREVIEWED**. Binary/container integrity is verified; visual quality and manufacturing suitability require separate review.

## LIVE safety boundary

- Global generation budget is cumulative and never resets.
- Current production allowance after the verified LIVE calls: **used 9 / limit 15 / remaining 6**.
- Fixed LIVE expiry: **2026-09-19T07:00:00Z**.
- Existing per-IP rate limiting remains active.
- The committed base `wrangler.jsonc` remains disabled-by-default; the authorized contest LIVE deployment is derived at release time from the explicit marker.
- MAKE remains **VALIDATION REQUIRED**. No generated GLB is automatically a manufacturing-approved file, supplier approval, quote or order.
- No Product Hunt submission is claimed by this release record.

---

# WORLDIFACT status — contest LIVE activation release

Date: 18 September 2026.

## VERIFIED
- PR #45 is merged on `main` at `81a4ac2493a9d102d816079b494bd18f255c91da`.
- Post-merge CI and Cloudflare deployment for PR #45 succeeded.
- Official OpenAI Model Guide rechecked on 18 Sep 2026: production model ID remains `gpt-6-astra` via the Responses API: https://developers.openai.com/api/docs/guides/latest-model
- Production secrets for OpenAI, Cloudflare and Oracle are synchronized by the existing release workflow without exposing them to the frontend.
- The contest LIVE release keeps the committed `wrangler.jsonc` disabled by default and derives an ephemeral production config only when `ops/CONTEST_LIVE_20260918` exists.

## AUTHORIZED / BOUNDED LIVE RELEASE
- Owner explicitly approved merge, production deployment and API spending on 18 Sep 2026.
- Global cumulative generation ceiling: **15 reservations total**. Existing Durable Object usage remains counted and is never reset.
- Fixed expiry: **2026-09-19T07:00:00Z** (end of the full Sep 18 Product Hunt launch day in Pacific time).
- LIVE deployment enables:
  - GPT-6 Astra structured `/api/blueprint` for all five WORLDIFACT portal IDs;
  - public pilot access through existing same-origin/rate-limit protections;
  - Oracle bridge jobs;
  - native Studio/Blender 3D jobs;
  - existing per-IP limiter and global Durable Object ceiling.
- Legacy one-off FAST approval override is disabled in the contest config so it cannot reduce or replace the new explicit cumulative ceiling.
- MAKE remains **VALIDATION REQUIRED**. No generated artifact becomes manufacturing-approved automatically.

## FINAL RELEASE GATE
- Branch: `release/contest-live-20260918`.
- Required before merge: exact-head CI green, production dry-run green, then merge is pre-authorized by the owner.
- After merge, the normal production workflow deploys the bounded LIVE config automatically.
- A one-time post-deploy workflow is allowed to spend exactly enough for one real Astra blueprint smoke and one real Studio 3D smoke; it does not repeat on later documentation commits.

---

# WORLDIFACT status — PR #45 generator availability hotfix

Date: 18 September 2026.

- PR #45: https://github.com/teslaeco/WORLDIFACT/pull/45 — **OPEN / CI REQUIRED / NOT MERGED**.
- Base: `main@51b263085241b0dfc85c990e357a69efff59ea1b`.
- Goal: keep every contest-facing Astra blueprint generator usable without turning a disabled paid gate into a dead UI.
- Portal generator and AI Game Lab primary actions now choose the reviewed LIVE path only when `/api/health` reports generation ready; otherwise they run an explicit local `DEMO · MOCK` fallback with no API cost.
- Portal generator drawers are expanded by default for immediate reviewer access.
- No OpenAI/Oracle/Cloudflare secret, quota, allowance, paid-generation flag or Oracle job setting changed.
- Detailed Shop 3D model generation is still a separate Oracle/Blender cost gate and remains unavailable when its allowance is zero.
- Merge/deploy: **BLOCKED pending green exact-head CI and owner approval for merge**.
- Paid LIVE Astra / Oracle activation: **BLOCKED pending a new explicit owner cost cap**.

---

# WORLDIFACT status — contest mobile/EVA/avatar hotfix released

Date: 18 September 2026 (production deployment completed 17 Sep 22:28 UTC).

## Released hotfix

- PR #43: https://github.com/teslaeco/WORLDIFACT/pull/43 — **MERGED**.
- Squash merge on `main`: `13920ffa4b8efb4364a5f486bc23d15bacaf73ae`.
- Final pre-merge workflow: `35281920942` — **SUCCESS**.
- Post-merge verification: `35282057435` — **SUCCESS**, **197/197 tests PASS**, zero failures.
- Production workflow: `35282057350` — **SUCCESS**.
- Cloudflare version: `6822bf81-cc94-4a95-9251-e80647d34272`.
- Public URL: https://worldifact.xodobrox.workers.dev
- Release smoke: **PASS** — 13 HTML routes, 23 matching hub assets, 105 original app entries/assets, API 404 behavior, DEMO generation and origin rejection. No paid API call.

## Published behavior

- Fix ISS EVA receives a separate safety hotfix layer with a clamped external camera, visual zero-gravity drift, reset-to-safe-view control and EVA route helper while keeping the reviewed NASA historical ISS exterior visible.
- Android/mobile presentation moves non-critical navigation to a bottom dock and removes large non-critical meadow overlays from the gameplay center.
- Portal pages render the selected world's primary experience before the collapsible Astra generator drawer.
- Game Lab and portal reference uploads accept up to **6 MB** per supported reference flow, with a phone-camera **Scan · BETA** entry.
- The shared meadow defaults to the exact current MPC2 Neptune Queen Oracle job `99397623-e45c-48dc-95ec-6f84446a54d5`; it does not use the old public queen asset.
- A compact player selector also exposes the previously verified Froge MPC2 `rapper-v10.glb` archive model as **Rapper · MPC2 archive**.
- If the exact current Queen artifact is unavailable, the runtime uses a lightweight queen-shaped procedural fallback rather than silently substituting an older Queen file.
- Reading avatar GLBs is read-only and does not reserve generation budget.

## Current generation boundary

The production deployment deliberately keeps the existing cost gate unchanged. Latest read-only post-deploy diagnostic at `2026-09-17T22:28:10.695Z`:

```json
{
  "health": { "generationReady": false, "mode": "DEMO" },
  "oracleWorlds": { "oracle": "CONNECTOR_READY", "connectorVersion": 33, "characterStandard": 20 },
  "studio": {
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "APPROVED_TEST_PENDING_ACTIVATION",
    "allowance": { "used": 7, "limit": 0, "remaining": 0 }
  }
}
```

This release does **not** claim a new paid Astra generation, a refreshed allowance, ISS manufacturing approval, or a new supplier order.

---

# WORLDIFACT contest status — current canonical state

Date: 17 September 2026.

This file records the current contest/release state. Older milestone detail remains available in Git history and the linked pull requests/workflow runs.

## Production release — PR #42

- PR: https://github.com/teslaeco/WORLDIFACT/pull/42 — **MERGED**.
- Reviewed runtime head: `6fba3120f2082a5521ddb59d7fc31a8bcdecc7a1`.
- Final documentation-only head: `0b595f050da86196802481465fd951b595a8e032`.
- Squash merge on `main`: `17b7d2b92b412b25177965cf1bca2ba8a7b9ff0f`.
- Final reviewed branch verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35272650802 — **SUCCESS**.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35275080694 — **SUCCESS**.
- Production deployment: https://github.com/teslaeco/WORLDIFACT/actions/runs/35275080859 — **SUCCESS**.
- Cloudflare version: `05bcefa8-4a25-45f3-b48b-c92046b47ce2`.
- Public WORLDIFACT: https://worldifact.xodobrox.workers.dev

## Published product state

WORLDIFACT exposes exactly five primary worlds:

1. Chess Cube 512 AI — `/chess`
2. Terra — Fix ISS — `/iss`
3. 8 Planets in 8 Days — `/planets`
4. Enchanted AI Shop — `/shop`
5. AI Game Lab — `/lab`

The single server-side `/api/blueprint` path now accepts the exact five WORLDIFACT portal IDs and reuses the existing GPT-6 Astra Responses API integration instead of creating five independent AI backends. Legacy calls without `worldId` remain compatible and resolve to AI Game Lab.

Chess Cube, Fix ISS, 8 Planets and Enchanted AI Shop have a reusable Astra portal surface with prompt + optional reference image, procedural preview, explicit `LIVE · GENERATED` / `DEMO · MOCK` provenance and `MAKE: VALIDATION REQUIRED`. AI Game Lab keeps its existing native Astra workbench.

Unknown portal IDs are rejected before provider access. The server-only key, schema validation, limiter/budget gate, timeouts, safe errors and no-cost DEMO fallback remain in place.

## Terra / Fix ISS

Fix ISS now describes the product as a repair and preservation simulation exploring the idea of maintaining ISS and treating it as a human-heritage object. It does not claim NASA endorsement and does not claim that preserving the complete station in orbit is proven technically feasible.

The public page says **Sales starting soon** while the model and manufacturing validation are refined. It also labels as **PLANNED** that part of future sales revenue is intended for promotion/awareness supporting the ISS preservation campaign at https://c.org/QkbzHd5kWN. It does not claim a current donation or guaranteed percentage.

For EVA, WORLDIFACT no longer relies only on the previous plain-blue stylized Earth. `public/apps/iss/terra-earth.js` adapts the Terra Observation Earth-source logic reviewed from `Terraforming-Planet/Polar-Sun-Moon-Analysis` commit `c91d59eafb87cf9657f8bf78a5e431fb35665849` under MIT. It uses official NASA GIBS products `BlueMarble_ShadedRelief_Bathymetry` and dated `VIIRS_SNPP_CorrectedReflectance_TrueColor`, with Blue Marble fallback if the dated layer fails. Source/licence attribution is recorded in `ASSET_LICENSES.md`.

The EVA globe is a visual simulator backdrop. It is not labelled as live scientific observation evidence. Terra Observation remains the source/date-aware Earth-observation application.

## Verification evidence

Production verification completed with:

- **191/191 tests PASS**; zero failed, skipped or cancelled tests.
- lint: nine existing warnings, zero errors.
- TypeScript: PASS.
- local HTTP smoke: PASS; deterministic DEMO only, no paid provider request.
- production build: PASS.
- reviewed Chess/Terra/ISS assembly: PASS.
- Wrangler dry-run: PASS.
- deployment: PASS.
- public release smoke: **PASS** for 13 HTML routes, 23 matching hub assets, 103 original app entries/assets, API 404 behavior, DEMO generation and origin rejection.
- deployment smoke made **no paid API generation call**.

## Latest production capability snapshot

Read-only diagnostic at `2026-09-17T21:11:10.610Z`:

```json
{
  "health": {
    "http": 200,
    "mode": "DEMO",
    "generationReady": false,
    "generation": "NOT_REQUESTED"
  },
  "oracleWorlds": {
    "http": 200,
    "oracle": "CONNECTOR_READY",
    "connectorVersion": 33,
    "characterStandard": 20,
    "generation": "NOT_REQUESTED"
  },
  "studio": {
    "http": 200,
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "APPROVED_TEST_PENDING_ACTIVATION",
    "allowance": {
      "used": 7,
      "limit": 0,
      "remaining": 0
    },
    "generation": "NOT_REQUESTED"
  }
}
```

This proves the deployed connector/capability state only. It does not prove a new paid Astra generation, a repaired original ISS mesh, a supplier-approved manufacturing file, a completed order or a Product Hunt submission.

## Remaining hard blockers before claiming full LIVE model-generation readiness

- New real model generation is not currently armed in production; the current allowance reports `used: 7`, `limit: 0`, `remaining: 0`.
- The current Studio/Oracle mesh workflow does not accept the saved original ISS 3MF/GLB as an input mesh, so no output may be described as a repaired version of that exact source until such an input path exists and is used.
- MAKE remains `VALIDATION REQUIRED` until a real manufacturing partner accepts the exact revision/process/size.
- Payment settlement and supplier ordering are not connected.
- Product Hunt publication/submission still requires explicit owner approval at the final submission step.

## Relevant previous production milestones

- PR #41 customer storefront: https://github.com/teslaeco/WORLDIFACT/pull/41
- PR #40 Shop MAKE options: https://github.com/teslaeco/WORLDIFACT/pull/40
- PR #37 editable next-model draft lifecycle: https://github.com/teslaeco/WORLDIFACT/pull/37

Public URLs:

- Home: https://worldifact.xodobrox.workers.dev/
- Chess: https://worldifact.xodobrox.workers.dev/chess
- Fix ISS: https://worldifact.xodobrox.workers.dev/iss
- 8 Planets: https://worldifact.xodobrox.workers.dev/planets
- AI Shop: https://worldifact.xodobrox.workers.dev/shop
- AI Game Lab: https://worldifact.xodobrox.workers.dev/lab
- Terra Observation inside WORLDIFACT: https://worldifact.xodobrox.workers.dev/terra
- Original Terra Observation: https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/
