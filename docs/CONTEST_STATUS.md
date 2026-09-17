# WORLDIFACT status — five Astra portal surfaces + Terra Earth EVA

Date: 17 September 2026. PR #42 is a reviewed branch milestone; **not merged and not deployed to production**.

## Current branch milestone

- PR #42: https://github.com/teslaeco/WORLDIFACT/pull/42 — **OPEN DRAFT**.
- Branch: `feat/contest-five-portals-terra-earth`.
- Reviewed code head before this documentation-only `[skip ci]` update: `6fba3120f2082a5521ddb59d7fc31a8bcdecc7a1`.
- Final code verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35272650802 — **SUCCESS**. `npm run verify`, reviewed foundation assembly, Wrangler dry-run and hosted-Studio read-only inspection all passed.
- The single server-side `/api/blueprint` path now accepts the exact five WORLDIFACT portal IDs and reuses the existing GPT-6 Astra Responses API integration rather than creating five separate backends. Legacy requests with no `worldId` remain compatible and resolve to AI Game Lab.
- Chess Cube, Fix ISS, 8 Planets and Enchanted AI Shop now have a reusable portal Astra surface with prompt + optional reference image, a procedural preview, explicit `LIVE · GENERATED` / `DEMO · MOCK` provenance and `MAKE: VALIDATION REQUIRED`. AI Game Lab retains its existing native Astra workbench.
- Unknown portal IDs are rejected before any provider call. Server-only credentials, current validation, limiter/budget gate, safe errors and the no-cost DEMO fallback are preserved.
- Fix ISS now explains that it is a repair/preservation simulation exploring whether ISS can be maintained and considered for preservation as a human heritage object. It explicitly does not claim NASA endorsement or prove that preserving the complete station in orbit is feasible.
- Fix ISS displays **Sales starting soon** while model/manufacturing validation is refined and labels as **PLANNED** that part of future sales revenue is intended for promotion/awareness supporting the ISS preservation campaign at `https://c.org/QkbzHd5kWN`. No current donation or guaranteed percentage is claimed.
- EVA Earth now adapts the actual Earth visual-source logic from `Terraforming-Planet/Polar-Sun-Moon-Analysis` commit `c91d59eafb87cf9657f8bf78a5e431fb35665849`, file `web/src/CleanRealisticEarthGlobe.tsx`, under MIT. It uses the same official NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` base/fallback and dated `VIIRS_SNPP_CorrectedReflectance_TrueColor` visual instead of inventing a new Earth asset. Attribution is recorded in `ASSET_LICENSES.md`.
- The EVA globe is explicitly a visual backdrop; it is not labelled as live scientific observation evidence. Terra Observation remains the source/date-aware Earth-observation application.
- No paid model request, new public generation budget, supplier order or production deployment was made by PR #42.
- A fresh paid ISS mesh-repair claim remains **BLOCKED**: production previously reported `used: 7` with no remaining slot, and the current Studio/Oracle mesh workflow does not accept the saved original ISS 3MF/GLB as an input mesh. Do not call a structured prompt/specification a repaired original mesh.

---

# WORLDIFACT status — customer storefront published

Date: 17 September 2026. PR #41 was reviewed, merged and published to production after the final-head checks passed.

## Completed release

- PR #41: https://github.com/teslaeco/WORLDIFACT/pull/41 — **MERGED**.
- Reviewed PR head: `bc9c5788a2474f7d502f3186273ee7da8c764c55`.
- Squash merge on `main`: `a61137ea92c1f55761d103aadd126bd463b0aa0a`.
- Final-head checks: `35261421749` WORLDIFACT verification PASS; `35261421731` FAST draft worker PASS; `35261421745` FAST v33 installation safety PASS; `35261421746` Cloud Shell launcher PASS.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35262509570 — **SUCCESS**.
- Production workflow: https://github.com/teslaeco/WORLDIFACT/actions/runs/35262509550 — **SUCCESS**.
- Cloudflare version: `122e9057-1d38-4ec6-995f-9cfb5cb23fd5`.
- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Production suite: **185/185 PASS**, zero failed, skipped or cancelled tests; lint has nine existing warnings and zero errors; typecheck, local HTTP smoke and production build PASS.
- Release smoke: **PASS** for 13 HTML routes, 23 matching hub assets, 102 original app entries/assets, API 404 behavior, DEMO generation path and origin rejection. The deployment made no paid API generation call.

## Published customer Shop behavior

- Customer-facing Shop hides engineering diagnostics, model IDs, raw recovery/export controls, device archive, owner controls and the internal ISS repair action.
- Customer creation remains prompt + up to **three** reference images. 8K remains unavailable/coming soon; no 8K output is claimed.
- Customer manufacturing options include material/process/finish, quick 5–20 cm presets and explicit custom X/Y/Z dimensions from 5–1000 mm. X/Y/Z changes alter the WebGL preview proportions without silently rewriting the saved source artifact.
- A customer cart and explicit experimental-risk / possible-delivery-delay acknowledgements are visible.
- Customer pricing no longer scales or extrapolates old benchmark prices. A numeric sell price appears only after an exact supplier quote is verified for the exact accepted revision, configuration and size.
- Recorded ISS evidence remains internal: nominal 370 mm WJP full-color route, USD 213.53 print price and an observed USD 55.72 UPS DDP line from 14 September 2026. These values are **not** published as a final checkout price because the supplier flagged thin walls and the repaired revision has not been accepted yet.
- Manufacturing hard rules are appended to both STANDARD and FAST Studio payloads: explicit units/X-Y-Z, non-manifold/open-shell/self-intersection/degenerate/zero-thickness checks, fragile-feature avoidance, conservative resin-wall guidance, practical splits/keyed joints/clearances, material/UV preservation, change reporting and a hard rule that no generated file is called safe/production-ready until a real B2B manufacturing partner accepts that exact revision.
- The next ISS repair prompt remains internal-only and prepares another supplier-validation revision. This release did **not** run a fresh paid Astra repair pass and did not submit an ISS file to a supplier.
- Revolut/payment settlement is **not connected** and no customer or supplier money movement was implemented by this release.
- The visible pre-purchase GLB download button is removed, but secure “full 3D file only after payment” entitlement remains **BLOCKED**: the interactive WebGL preview still receives full GLB bytes in the browser. True enforcement still requires a derived preview-only artifact, server-side protection of the original and a payment-confirmed entitlement endpoint.

## Latest production capability snapshot

The deployment diagnostic at `2026-09-17T19:04:08.220Z` reported:

```json
{
  "health": { "mode": "DEMO", "generationReady": false, "generation": "NOT_REQUESTED" },
  "oracleWorlds": { "oracle": "CONNECTOR_READY", "connectorVersion": 33, "characterStandard": 20, "generation": "NOT_REQUESTED" },
  "studio": {
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "APPROVED_TEST_PENDING_ACTIVATION",
    "allowance": { "used": 7, "limit": 0, "remaining": 0 },
    "generation": "NOT_REQUESTED"
  }
}
```

This proves the published connector/capability state only. It does not prove a new model generation, ISS repair, manufacturing approval, checkout payment or supplier settlement. The storefront is deployed, but new real model generation remains unavailable until a separately controlled generation window is activated.

---

# WORLDIFACT status — Shop MAKE options released

Date: 17 September 2026. PR #40 was reviewed, merged and published to production after all final-head checks passed.

## Completed release

- PR #40: https://github.com/teslaeco/WORLDIFACT/pull/40 — **MERGED**.
- Reviewed PR head: `4c53d2f164e6a9823a3b7f80387414c07aa85dab`.
- Squash merge on `main`: `d63573d39996df8f1b4b61cfa88a3fe52c3c07b9`.
- Final-head checks: `35254977101` FAST v33 installation safety PASS; `35254977119` FAST draft worker PASS; `35254977047` Cloud Shell launcher PASS; `35254977214` WORLDIFACT verification PASS.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35255225486 — **SUCCESS**.
- Production workflow: https://github.com/teslaeco/WORLDIFACT/actions/runs/35255225453 — **SUCCESS**.
- Cloudflare version: `36fd0264-e65a-40df-bf71-6b2bcfd9bc4e`.
- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Production suite: **184/184 PASS**, zero failed, skipped or cancelled tests; lint has nine existing warnings and zero errors; typecheck, local HTTP smoke and production build PASS.
- Release smoke: **PASS** for 13 HTML routes, 23 matching hub assets, 102 original app entries/assets, API 404 behavior, DEMO generation path and origin rejection. The deployment did not make a paid API generation call.

## Published Shop behavior

- Client reference input is limited to **maximum 3 images**.
- 8K remains visible but disabled as **coming soon**. The UI does not claim unavailable 8K output.
- Client MAKE choices now include **Plastic / Metal / Wood / Stone**, **3D printer / Laser / CNC**, size choices from **5 cm through 20 cm**, and plain/full-color paths.
- Promoted client routes reuse the existing stored manufacturing evidence without exposing contractor names. Only evidence-backed benchmark combinations show numeric screening estimates; unsupported combinations say **Quote required**.
- The 5–20 cm plastic price table is explicitly a solid-volume screening extrapolation from the stored 100 mm observations, not a live or binding supplier quote.
- The ISS card records the project-provided source, nominal `370 × 227.3 × 194.1 mm` bounds, `469,984` STL triangles and the prior thin-wall warning around solar-array / fragile structural areas.
- **Prepare ISS print-repair draft** fills a STANDARD Astra/Blender manufacturing draft without generating, ordering or spending credits. It requests geometry cleanup, reinforcement of fragile/thin sections, sensible module splits, joints/clearance, explicit units and color/paintable paths.
- The production UI deliberately keeps ISS at **PRINT-PREP PASS REQUIRED / VALIDATION REQUIRED**. It does not claim that Astra already repaired the uploaded model. Only an actually generated and reviewed corrected artifact may later be labelled `Original source + Astra-assisted print-prep revision · VALIDATION REQUIRED`.

## Latest production capability snapshot

The read-only deployment diagnostic at `2026-09-17T17:52:29.869Z` reported:

```json
{
  "health": { "mode": "DEMO", "generationReady": false, "generation": "NOT_REQUESTED" },
  "oracleWorlds": { "oracle": "CONNECTOR_READY", "connectorVersion": 33, "characterStandard": 20, "generation": "NOT_REQUESTED" },
  "studio": {
    "ready": false,
    "photoReady": true,
    "fastReady": true,
    "oracle": "CONNECTOR_READY",
    "reason": "ALLOWANCE_EXHAUSTED",
    "allowance": { "used": 7, "limit": 7, "remaining": 0 },
    "generation": "NOT_REQUESTED"
  }
}
```

This is the newest timestamped status and supersedes older allowance snapshots below. It proves connector/capability state only; it does not prove a fresh model generation, ISS repair, 8K output or manufacturing approval. No supplier order or Product Hunt submission was made by this release.

---

# WORLDIFACT status — Shop MAKE options and ISS print-prep draft

Date: 17 September 2026. Branch milestone only; **not merged and not deployed**.

## Current branch milestone

Branch: `feat/shop-make-offers-iss`.

Implemented for review:

- Shop reference input is limited in the client UI to **maximum 3 images**.
- 8K remains visible but disabled as **coming soon**; 2K and 4K stay selectable where the current worker allows them.
- Reuses existing manufacturing evidence without exposing contractor names in the new client offer panel.
- Adds client material choices **Plastic / Metal / Wood / Stone** and machine choices **3D printer / Laser / CNC**.
- Adds size choices from **5 cm through 20 cm** and plain/full-color selection.
- Shows a promoted manufacturing route for the current selection. Only stored benchmark combinations get a numeric screening estimate; unsupported combinations say **Quote required** rather than inventing a price.
- The 5–20 cm plastic table derives screening values from the already stored 100 mm calculator observations using explicit solid-volume scaling. These are labelled estimates, not live or binding supplier quotes.
- Adds the uploaded ISS source facts: nominal STL bounds `370 × 227.3 × 194.1 mm`, `469,984` triangles, and the existing thin-wall warning around solar-array / fragile structural areas.
- Adds a no-cost **Prepare ISS print-repair draft** action. It only fills the STANDARD prompt with print-prep requirements: geometry cleanup, solar-array/thin-wall reinforcement, sensible modular splits, joints/clearance, color + paintable paths, explicit units and change reporting.
- The UI deliberately does **not** claim that Astra has already repaired the ISS. Until a real revision exists and is checked, status remains `PRINT-PREP PASS REQUIRED / VALIDATION REQUIRED`. A future verified revision may be labelled `Original source + Astra-assisted print-prep revision · VALIDATION REQUIRED`.
- No paid generation, contractor order, merge, production deployment or Product Hunt action was started by this milestone.

Tests added: `tests/shop-manufacturing.test.ts` for size coverage, preserved 100 mm benchmarks, quote-required routes and ISS validation status. Full CI must pass before GO/NO-GO.

---

# WORLDIFACT status — Shop draft fields repaired and published

Date: 17 September 2026. Scoped UI repair completed; the separately approved paid FAST test has not been activated or executed.

## Completed release

- PR #37: https://github.com/teslaeco/WORLDIFACT/pull/37 — MERGED.
- Reviewed head: `856e7310a1b8fc36b0f1ac9b30a407b535391857`.
- Deployed merge: `94adf640aef3847dcd470c8af240dc497c132074`.
- Cloudflare version: `5ba82762-f24f-4806-b39e-5b756f7d4369`.
- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Production workflow: https://github.com/teslaeco/WORLDIFACT/actions/runs/35240617074 — all steps SUCCESS, job `105267796416`.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35240617012 — SUCCESS.

The requested repair was implemented, tested, reviewed and published directly through connected GitHub tools. No separate unobserved Codex/Copilot agent run is claimed. This documentation-only `[skip ci]` update changes no runtime or production settings.

## Cause and fix

The owner's 17:08 Android screenshot showed the successful restored chess knight but disabled prompt, generation mode and purpose controls. The source used `disabled={busy || !!saved}` and equivalent expressions: a selected receipt remained present after success, so the form stayed locked indefinitely. This was a frontend lifecycle defect, not proof of an Oracle outage or insufficient API credits.

The published fix separates the editable next-model draft from the immutable submitted job/result and from the paid server gate.

- Description, generation mode, purpose and applicable STANDARD photo/texture controls remain editable after a completed model and while a prior result is being checked. Brief submission/photo-preparation operations may lock only the affected inputs.
- A current running or unconfirmed job cannot be replaced or duplicated. Its own terminal status must be confirmed before a new explicit Generate action can prepare another job.
- Editing the next description or switching STANDARD/FAST does not change the old preview, submitted description, file identity, downloads, receipt or archived original.
- The visible `Clear next-model draft` action clears only new text/reference images after confirmation. It does not remove the displayed model, recovery receipt or archive, and does not cancel or create a server job.
- Before a new paid submission, the real coordinator snapshots inputs once, preserves the previous receipt in same-origin device history, and verifies storage of the new receipt. Failed free preparation retains the previous result/selection. Storage failure prevents a paid POST.
- Double-click protection, native fetch binding, exact-input receipt signatures, same-job GET recovery and archive-original preservation remain intact. Late old responses cannot confirm a different current job.
- FAST retains its versioned capability check, text-only v1 scope, no-photo/terrain restriction and up-to-2K map ceiling. Choosing STANDARD restores applicable reference/texture controls. Draft mode never changes the old model's mode or export identity.

No Oracle installation/restart, generator backend change, provider/model change, new cloud resource, new credential, allowance reset/refund or pilot/expiry marker change was part of this repair. The existing hosted Froge application and previous models remain unchanged.

## Verification performed

| Check | Actual result |
|---|---|
| Final-head WORLDIFACT verification | PASS, `35240295838` |
| Final-head FAST worker regression | PASS, `35240295782` |
| Final-head v33 installation safety | PASS, `35240295830` |
| Final-head Cloud Shell launcher safety | PASS, `35240295792` |
| Production complete test suite | **176/176 PASS**, zero failed/skipped/cancelled tests |
| Lint / TypeScript / build | PASS; nine existing lint warnings, zero errors |
| Local HTTP smoke | PASS; deterministic DEMO only, no paid provider request |
| Reviewed Chess/Terra/ISS assembly | PASS |
| Worker dry-run and deployment | PASS |
| Public release smoke | PASS: 13 HTML routes, 23 matching hub assets, 102 original app entries/assets, API 404, DEMO and origin rejection |
| New physical Android interaction / fresh AI generation | NOT TESTED by this repair |

Ten new behavioral cases exercise the actual checked-in Shop component, its effects and event handlers with deterministic hook/storage/timer/HTTP adapters, plus the real coordinator. They restore a completed model with zero allowance, edit prompt/mode/reference fields, keep the old result, reject active-job replacement and verify one paid-intent fixture only after an explicit Generate action.

The existing native Chromium regression remains a standalone data-URL-only browser API test, not a site preview or physical Android test. It now also checks explicit next-job receipt preservation. Initial run `35239946404` passed 175/176 tests; its one failure was an explicit browser fixture dependency list that needed the new reviewed `studioDraft.ts` helper. The exact helper was included without weakening the unexpected-import assertion or removing any test.

No blocked site preview was rerouted through another browser or tool. A tiny deterministic material-bearing GLB proves parser/lifecycle behavior, not AI quality, a new knight or real device rendering.

## Public post-release capability and paid gate

At **2026-09-17T15:31:07.789Z** (**17:31 Poland/Netherlands**), the existing authorized credential-free release probe returned:

```json
{
  "path": "/api/studio/status",
  "http": 200,
  "generation": "NOT_REQUESTED",
  "ready": false,
  "photoReady": true,
  "fastReady": true,
  "oracle": "CONNECTOR_READY",
  "reason": "DISABLED_OR_EXPIRED",
  "allowance": { "used": 6, "limit": 0, "remaining": 0 }
}
```

The five-world Oracle endpoint separately returned CONNECTOR_READY, connectorVersion 33 and characterStandard 20. Blueprint `/api/health` remains DEMO with `generationReady=false`. These are timestamped observations, not an indefinitely current balance.

**Form editing is repaired and published. Installed FAST capability is confirmed. New paid submission remains disabled.** These are separate facts. Do not imply that selecting a mode or refreshing the page activates more capacity.

The user has already approved **one FAST test up to USD 5**. This consent is known and should not be requested again. The prior assistant's instruction to click Generate did not actually activate the server gate. This UI repair has NOT activated or executed that test, and no enforceable new monetary cap or seventh reservation is claimed. The outstanding paid-test work must establish the bounded capacity and execute/measure one explicit intent, without a reset/refund, unlimited opening or silent STANDARD fallback.

No additional paid generation, provider cost or deadline extension was initiated by this repair. The prior six reservations and expired pilot remain intact. A standard disabled-cost deployment does not grant fresh capacity.

## User-facing handoff

Open the same Shop and reload normally once to receive the changed JavaScript. The old knight may remain visible while the next description/mode is edited. Do not clear browser/site storage: it contains the local model archive and recovery receipts. Do not rerun the Oracle installer to fix fields or paid allowance.

`Clear next-model draft` is optional and clears only draft text/photos. The Generate button remains governed by actual server readiness. An unavailable paid window must not prevent writing a draft or selecting supported STANDARD/FAST mode.

## Preserved installation and wider boundaries

Full preceding FAST installation/restart/verification/rollback and website release ledger: https://github.com/teslaeco/WORLDIFACT/blob/19f9cd57573b3966d258c227813a105ca2aed611/docs/CONTEST_STATUS.md.

PR #36 installed-support/website baseline: merge `8b95f95c6b015bd645020cded76e174fb78a83fc`, previous Cloudflare version `9cfc1b17-2c6f-4af5-9464-49cb5cc4ed3a`. Owner-side exact-v33 installer verified/restarted the generator; the tunnel and original data were preserved. No repeat installation was performed here.

Original hosted Studio: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

The owner's successful knight and approximately 16-minute duration remain the live baseline. This repair does not prove a new 1–2-minute FAST result, better likeness, native 4K/8K detail, manufacturing approval, public shop catalog/order or contest readiness. GAME outputs remain review-required and MAKE remains validation-required. No contest eligibility decision or submission was performed.