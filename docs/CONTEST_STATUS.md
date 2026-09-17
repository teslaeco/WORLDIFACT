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
