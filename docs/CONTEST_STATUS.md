# WORLDIFACT status — FAST installed and website published

Date: 17 September 2026. Completed scoped maintenance and website release; fresh paid speed benchmark not run.

## Completed release

- PR #36: https://github.com/teslaeco/WORLDIFACT/pull/36 — **MERGED**.
- Reviewed head: `9efe873a71e53997056e8b6a7f442b8cd59a16ab`.
- Deployed merge: `8b95f95c6b015bd645020cded76e174fb78a83fc`.
- Cloudflare version: `9cfc1b17-2c6f-4af5-9464-49cb5cc4ed3a`.
- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Production workflow: https://github.com/teslaeco/WORLDIFACT/actions/runs/35236567410 — all steps SUCCESS.
- Post-merge main verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35236567421 — SUCCESS.
- Full executed task: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md).

The owner had authorized this website release after successful exact-v33 installation, restart and local verification. That condition was satisfied by the owner-side installer screenshot. No repeated consent or new paid-test authorization was inferred.

## Oracle installation evidence

The completed Cloud Shell output supplied by the owner (phone at 16:43) reported `INSTALLED_AND_LOCALLY_VERIFIED`, source package `a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b`, `worker_service=active`, `tunnel_service=active`, and `paid_generation_requested=false`. At that moment `site_deployed=false` correctly indicated that the later website release was still separate; it is now superseded by the successful Cloudflare evidence above.

The preserved rollback workspace is `/home/opc/.local/state/worldifact-fast/20260917T143508Z-16dbbba6`. Do not delete it or run the installer again merely to enable a model test. The installer's genuine local Codex/MCP/Blender verification used fixture model responses and did not consume a paid generation. The tunnel was not restarted.

This was owner-side execution through their authenticated Cloud Shell/SSH session. The assistant did not obtain an administrative Oracle session. Website source/review/publication was executed through the connected GitHub tools; no separate unobserved Codex/Copilot cloud-agent run is claimed.

## Public, independent post-release check

At **2026-09-17T14:54:27.517Z** (**16:54 Poland/Netherlands**), the existing authorized release probe made credential-free read-only GET requests and returned:

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

The five-world Oracle status endpoint separately returned HTTP 200, `CONNECTOR_READY`, connectorVersion 33 and characterStandard 20. Blueprint `/api/health` remains DEMO with `generationReady=false`.

**FAST capability is installed and visible through the deployed website proxy. New paid generation is deliberately disabled.** These facts are not contradictory: `fastReady` reports installed profile support; `ready` also requires the approved spending gate. The recorded public counter still contains six previously reserved attempts. The normal release has the reviewed zero-limit/empty-expiry configuration; it does not reset the counter or grant new capacity. This read describes the observation time, not an indefinitely current balance.

No new model request, seventh attempt, refund/reset, deadline extension or new cloud resource was performed. The previous pilot expired at `2026-09-17T09:23:37.535Z`. A fresh bounded paid test needs explicit approval; do not tell the owner to reinstall or repeatedly press Generate to resolve that spending gate.

The existing allowance-resume workflow `35236726753` completed its marker check and **skipped every activation/deployment step**. No pilot marker was edited by PR #36. This documentation update uses `[skip ci]` and changes no runtime source or production setting.

## Verification performed

| Check | Actual result |
|---|---|
| Final reviewed-head WORLDIFACT | PASS, run `35236251527` |
| Final FAST worker and real-Blender fixture | PASS, run `35236251415` |
| Exact-v33 installation safety | PASS, run `35236251430` |
| Cloud Shell launcher safety | PASS, run `35236251675` |
| Production full test suite | **166/166 PASS**, no failed/skipped/cancelled tests |
| Production lint / TypeScript / build | PASS; lint nine warnings, zero errors |
| Reviewed application assembly | PASS, existing pinned Chess/Terra and ISS sources |
| Worker dry-run and real deployment | PASS |
| Public release smoke | PASS: 13 HTML routes, 23 matching hub assets, 102 original app entries/assets, API 404, deterministic DEMO and origin rejection |
| Installed FAST via public proxy | VERIFIED `fastReady=true` and Oracle ready in the final no-cost probe |
| New paid FAST model / 120-second end-to-end performance | **NOT TESTED** |

The release probe gained one allowlisted Boolean (`fastReady`) and runs after publication. Two regressions confirm that it does not change readiness, spend capacity, follow authentication redirects, or expose keys, receipts, private URLs or prompts. A successful diagnostic does not invent an AI-generation result.

Existing Chromium coverage exercises the native fetch/client fixture regression only. CPU/SSR/API fixtures and public asset checks do not establish physical Android use of the FAST selector or a complete new generation on the owner's phone. No blocked preview was retried through an alternative browser or path.

## What the user now gets

The Shop includes `Generation mode`: STANDARD remains the default; FAST DRAFT is an explicit choice when the connected worker confirms the exact profile. Choosing FAST does not itself submit a job. If an old model receipt is selected, the existing separate-model action must be used to start a different intent; do not clear site data, which contains the private device archive.

FAST v1 targets a compact text-described single object. It uses one Blender build with bounded AI requests/output and a 110-second orchestration guard, up-to-2K maps, core GLB/materials and an editable Blender checkpoint first. Optional rendered review and full interchange exports are deferred. Reference photos, terrain and larger-texture workflows remain STANDARD. A short work deadline is not a guaranteed 1–2-minute result.

Required file/geometry/current-checkpoint checks remain. FAST output is GENERATED/UNREVIEWED, not visually accepted or manufacturing approved. The proxy checks capability before preparation and again before reservation, so unsupported workers cannot silently run STANDARD for a FAST request. Old STANDARD canonical bytes/digests, native fetch binding, receipt-before-POST, GET-only recovery and exact result identity are preserved.

The page stays on WORLDIFACT, with its return link and all five worlds. No authenticated iframe, automatic external redirect, stock-model replacement or brief-export generation flow is restored. Existing original models, the successful knight, private archives, account settings and other worlds were not migrated or deleted.

Original hosted Studio, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

## Performance and next release boundary

The owner's successful knight and approximately 16-minute wait remain the real baseline. Earlier fixed-scene Blender comparisons (about 41–44 seconds with optional review versus 0.615 seconds without it for identical GLB bytes) exclude AI, queue/startup, transfer and browser display. They are not evidence that a new live FAST job finishes in two minutes.

**Completed:** exact-v33 installation/restart/local verification, authorized PR merge, production publication, public FAST capability confirmation.

**Pending:** explicit bounded budget for a new FAST test, enabling only that approved test capacity, and measuring one real click-to-visible result with its artifact identity and quality review. Do not claim speed, likeness, native 4K/8K, manufacturing suitability, public sale/catalog or competition readiness from the completed infrastructure checks.

## Historical details retained

- Exact v33/source match: https://github.com/teslaeco/WORLDIFACT/blob/a02d74529a6b9b754f7e46765867e71404b5a48c/docs/CONTEST_STATUS.md
- Tested installer/rollback: https://github.com/teslaeco/WORLDIFACT/blob/a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b/docs/CONTEST_STATUS.md
- Approved pinned Cloud Shell launcher: https://github.com/teslaeco/WORLDIFACT/blob/cd0ff1ddded5f5590cea4ac8163bbb530e41a02c/docs/CONTEST_STATUS.md
- Pre-release owner-side installation evidence: https://github.com/teslaeco/WORLDIFACT/blob/9efe873a71e53997056e8b6a7f442b8cd59a16ab/docs/CONTEST_STATUS.md

Contest submission and final eligibility remain separate and were not executed or re-decided in this maintenance release.
