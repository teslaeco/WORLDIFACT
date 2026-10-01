# WORLDIFACT — generation restoration remains open

Updated 30 September 2026. The owner requested one command to install the prepared generator correction while retaining all new payments. [PR156](https://github.com/teslaeco/WORLDIFACT/pull/156) remains a scoped candidate, not a full rollback or a completed live character.

## IMPLEMENTED — one-command Cloud Shell entry point

`tools/profit_guard/oracle_cache_launch.py`, implementation head `c8586f17818f5c0e949c40f553316899a709121b`, is standalone and needs no Commander process. It uses the original OCI Cloud Shell CLI, existing SSH key and mandatory known-host verification to resolve the running `froge-blender` VM in eu-amsterdam-1. It does not look for generation files in Cloud Shell.

The launcher pins the complete ten-file public installer dependency set to `2ec02e9484a313bc40c0dcd9117a778fb1784696`. Every source file is size-bounded, compared against its Git blob identity and syntax-checked before SSH upload; the receiver rechecks those bytes. No key contents, user prompts, photos, payment settings or original models are uploaded. No Node/npm installation is performed. The outer launcher SHA256 is `3945205719c302d0e92a1f4f6df0e1cc56e422533a4830640adcf2c5d3e839bf` and its Git blob is `3238cf10b6d927cb9cde2373ac6daf924ce397f9`; the connector readback matches the locally tested bytes.

Default invocation is PLAN ONLY. The owner-approved `--approve-service-restart` runs the existing exact-ancestry, idle-only cache installer on the actual generator VM. It checks current sources and queue, creates private backups, changes only the output-policy helper/hash receipt, performs the genuine offline Codex/MCP/Blender check, restarts the worker and verifies authenticated local readiness. Active jobs are not cancelled. Verification failure invokes the installer's scoped rollback; unknown/recovery-required outcomes never print success. The installation status marker is `WORLDIFACT_CACHE_FIX_INSTALLED`, not a claim of a generated character. The console must remain open during this maintenance.

The launcher has no model request, no customer refund, no budget reset and no Stripe/PayPal mutation. It cannot resolve an unrelated model-building failure merely by changing cache accounting.

## VERIFIED — preservation boundary and existing implementation

Changes are restricted to `tools/profit_guard/` and this record. Frontend/server payment code, checkout, prices, subscriptions, credit rates, customer balances, deployment configuration and original assets are unchanged. The USD1.75 per-job cap, low reasoning, model, service tier, token ceilings and review expiry are unchanged.

The prepared v2 helper accounts for complete, valid, provider-confirmed cache reads only on the same authenticated completed response. Unknown/partial usage uses the original conservative bound; malformed or incomplete results preserve the full hold. Historical completed holds and uncertain legacy entries are immutable. No cache hit is assumed during preflight. This addresses a concrete possible premature-stop mechanism, but the owner's earlier screenshots do not establish cached-token usage or the original build failure.

Official sources and the complete accounting rationale, unchanged rates, maintenance/rollback restrictions and earlier evidence remain preserved in [the previous PR156 status](https://github.com/teslaeco/WORLDIFACT/blob/2ec02e9484a313bc40c0dcd9117a778fb1784696/docs/CONTEST_STATUS.md), original blob `349fa9adb7ec2348b7614181501bd9f6b0328ab9`. No new model/pricing assumption is introduced by this launcher.

## VERIFIED — testing, not production installation

The unchanged installer/accounting implementation at `5e5a98e1df0922191e62b72c7c5bae49caef9145` passed all six workflows: [56 guard tests](https://github.com/teslaeco/WORLDIFACT/actions/runs/36773686202) and [613 application tests, typecheck, build, HTTP smoke and packaging](https://github.com/teslaeco/WORLDIFACT/actions/runs/36773686033). No tests failed or were skipped in those CI runs. Existing 27 lint warnings and three dependency advisories remain.

The new launcher passed 16 deterministic local tests without OCI/SSH access. A seventeenth CI test verifies every real dependency against the pinned manifest and launches the isolated installer in PLAN ONLY, checking for missing imports without modifying a VM. [Guard CI 36775875347](https://github.com/teslaeco/WORLDIFACT/actions/runs/36775875347), job110093509831, passed at head `c8586f17818f5c0e949c40f553316899a709121b`, including source reconstruction, compilation and test discovery. An initial transfer introduced a missing parenthesis in a test fixture; it was corrected to the locally passing bytes. Nothing was deployed from the failing test revision.

Full application verification on this final implementation head is still being observed at the time of this documentation write. Do not conflate earlier green tests with a new head or a production model. This documentation follow-up does not change launcher/installer bytes.

## BLOCKED / not performed

No Oracle installation or service restart was executed by the assistant in this turn. The user must run the single approved entry point in their existing Cloud Shell because the prior conversation tool connection did not expose a device. The actual command result must be observed before describing the helper as installed. No extra cloud resource is purchased. No paid generation or historical customer credit correction was performed.

A future completed character must still have its real GLB/export and visual fidelity reviewed. A ready service, passing tests or a successful cache-helper installation alone does not prove that outcome. Cloudflare deployment alone does not update Oracle Python files, so this branch is not merged merely to produce another website release.

Release decision: the single-command entry point is prepared; NO-GO for claiming that production character generation is already restored. New payment settings remain preserved.

## Earlier release record

The prior PR153/154 routing/readiness release and its linked historical archives remain at [the immutable production-source status](https://github.com/teslaeco/WORLDIFACT/blob/673be0cecd83ebb5959770fe90716cd2485369e5/docs/CONTEST_STATUS.md), blob `b19650def2d2f36d4e1b35acb31ec1b6e6611980`. PR155 is a separate diagnostic draft. Neither historical readiness nor the old billing evidence is silently relabelled as a successful new character.
