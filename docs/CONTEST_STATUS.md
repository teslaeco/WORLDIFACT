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
