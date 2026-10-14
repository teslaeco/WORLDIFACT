# 14 October 2026 — STUDIO ACCOUNT LIBRARY FOLLOW-UP (MERGED; RELEASE PENDING)

VERIFIED:
- PR #278 merged: completed owned Studio models now preserve validated `studioExecution` (Astra, Sol or Luna; Standard/Fast). Account gallery shows this provenance, and labels older rows as unknown instead of inventing their model.
- PR #279 merged: Sol and Luna Standard use budget-first completion guidance to prioritize a valid first GLB, required review and `finish_model` before discretionary detail revisions. The original prompts, execution model, strict per-job spend ceilings and no-retry policy remain unchanged. This is not evidence that every complex prompt can finish within USD 0.35 / USD 0.10.
- PR #280 merged: an authenticated library first-page GET can surface completed owned assets beyond the first UUID-range page with bounded additional lookups. This improves discovery but does not constitute a full history migration.
- Cloudflare release `5c22ca73a206af8ba1f856dafbf563ee55bf5015` passed `npm run verify`, dry-run, actual preserving `wrangler deploy --keep-vars`, and read-only live Studio API inspection. Proof: https://github.com/teslaeco/WORLDIFACT/actions/runs/38571282122; deployed version `6efec27e-b66f-4475-bccd-b60220fea682`.
- PR #281 merged as `3ab71d14aea922e0c19ad8afe4cb2588015486f3`: bounded account-owned latest-model index for **newly completed explicit-model jobs only**. A library hint never proves success or ownership: the owned canonical completed row must be re-read and validated. Historical settlement write bytes remain unchanged; test first caught and corrected a forbidden legacy write. Exact PR CI passed after correction.

UNKNOWN / PENDING:
- Deployment of #281 is still pending at the time this milestone is recorded; do not claim it is on Cloudflare until the exact release job and public smoke test pass.
- No new signed-in customer-session E2E was performed for the owner's account: actual held-point balance and successful library visibility after reload remain to be checked. Do not release unknown provider liabilities.
- The specific Sol job shown with `MODEL_BUDGET_EXCEEDED` needs its exact signed job ID and terminal budget receipt to determine charge liability. Source semantics establish a failed next guarded request reservation, not guaranteed zero spend, model complexity or automatic refund.
- No additional paid generation was started in this library follow-up; earlier four sequential Luna Standard jobs already passed in production (link below).

# 14 October 2026 — CONTINUOUS STUDIO GENERATION P0 VERIFIED

VERIFIED:
- PR #277 merged as `9dbb81836537fff45b1c2c1584bbbea9275a0705` and deployed through the one-use preserving release `45dca2987c2dd2aecad0a85b1bb5c3d959eaeebc`; the deployment used `--keep-vars`, preserving remote variables, secrets and billing configuration.
- Paid-account Studio preparation now performs a bounded, receipt-only reconciliation of existing terminal provider liabilities before checking the next generation. Only immutable Oracle terminal evidence can release a hold; unknown/uncertain spend remains held. No generation is retried by reconciliation.
- Exact-head CI for the fix passed: full `npm run verify`, Oracle durable admission checks, FAST safety checks, foundations, deploy dry-run and hosted read-only Studio inspection.
- Production continuity acceptance run https://github.com/teslaeco/WORLDIFACT/actions/runs/38554127828 executed four sequential GPT-6 Luna Standard Oracle jobs with fixed IDs and zero automatic retries. All four reached `succeeded`, and all four GLBs were downloaded and validated as GLB v2 containers.
- GLB bytes/SHA-256: #1 663,340 / `e0d36b1b95bf586ca0abb2daadeebe04f3d90921bfc9f5c4c8ad97981c7f3645`; #2 672,824 / `0e5769369a5dcfabaf63b61ee0cd9fc78acc1a036d067cd59d1c239fe1b5a910`; #3 305,932 / `41066f12bd589374b1792c885f1fdcd939e66705202a2ee31977498b44a99607`; #4 709,972 / `79801914b1842b42ea1fa78e0f5baa5625a819cbe75535f389b81bea019ed544`.
- The four-job acceptance used a maximum combined provider guard of USD 0.40. This is a ceiling, not a claimed invoice.
- Public Studio readiness after deployment reports durable admission, Astra/Sol/Luna execution support and an unlimited generation allowance; generation remains point- and provider-budget-gated per request rather than capped to three attempts.

REMAINING PRODUCT QA: account-library presentation still needs explicit model/mode labels (Astra/Sol/Luna + Standard/Fast) and a fresh signed-in browser acceptance for automatic library appearance after successful generation. Do not infer these UI items from the Oracle continuity acceptance alone.

# 13 October 2026 — LIVE SOL + LUNA ACCEPTANCE PASSED

VERIFIED on production Oracle through the repository's one-use protected acceptance workflow:
- GPT-6.1 Sol Standard job `5f017611-1d33-4e9a-8b3d-02f4c6d47001` reached `succeeded`; downloaded GLB is 741,528 bytes, SHA-256 `52131c1ce7e28a667dd61725ffe62f126b9541d8035fd7cfe595a8b0ba09632f`.
- GPT-6 Luna Standard job `5f017611-1d33-4e9a-8b3d-02f4c6d47002` reached `succeeded`; downloaded GLB is 1,057,172 bytes, SHA-256 `7e76ff62316b53108672ecab3199d9c8963f8f98874ab6a3826d96f38c2ed8f8`.
- The live test used durable STAGE + exactly-once START, no automatic retries, and a permanent Git approval tag. Maximum combined provider ceiling was USD 0.45 (Sol <= 0.35, Luna <= 0.10); this is a guard ceiling, not a claimed invoice.
- GitHub Actions run: https://github.com/teslaeco/WORLDIFACT/actions/runs/38398271159 — SUCCESS. Artifact `sol-luna-live-evidence-3bf3e0406bae5addccfa5f8a97d7367bb2c542c4` contains both GLBs and the report.

RELEASE GATE: Oracle durable runtime already verified installed and running. Proceed to final exact-head CI, then merge PR #274 and publish through the existing preserving release workflow only if all required checks remain green. Do not rerun these paid jobs; their fixed IDs and approval tag are consumed.

# WORLDIFACT P0 — 13 October 2026

## Latest verdict: Oracle activation VERIFIED; full Worker release NO-GO

At 05:14:49 UTC, authenticated read-only SSH independently verified that the owner-started production Oracle installation finished. `INSTALL_STATUS.json` reports `WORLDIFACT_DURABLE_ADMISSION_VERIFIED`, `activation_committed=true`, no job-row change, no provider-limit change and no paid generation request. `froge-worker.service` is ACTIVE/RUNNING. No second installation or manual restart was performed.

The installed runtime is the fixed package from `7f357323fafb362bd72cf05799a4bba8f5100d52`. Its 17 installed source hashes and complete receipt chain passed `activation_receipts.validate_installed`. Authenticated Oracle health reports `ready=true`, `studioAdmissionRevision=oracle-durable-admission-v1`, `studioExecutionRevision=studio-execution-v1`, `codexReady=true`, and both maintenance flags false. The installed server SHA-256 is `c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150`.

## Incident: existing model previews unavailable during maintenance

The installation started at 05:00:22 UTC. Its native verification lease intentionally stopped the single `froge-worker.service`, which also serves existing model downloads. `froge-tunnel.service` remained active, but generation and account-model downloads were unavailable during that window. The static public gallery does not depend on this worker. This downtime should have been communicated before maintenance.

Real native generic CLI/MCP/Podman-Blender, cabinet, legacy STANDARD, phased STANDARD, six model/mode gates and staged ingress verification completed before activation. These are genuine local pipeline executions with scripted provider responses, not paid API model-generation evidence.

Live artifact inventory preserved 92 succeeded / 75 failed / 1 cancelled records. All 92 succeeded jobs have their original GLB with valid v2 header and declared byte length; 0 missing or invalid headers. After restoration, two existing original models were downloaded through the authenticated Oracle HTTP endpoint: HTTP 200, `model/gltf-binary`, 1,672,056 and 1,735,360 bytes, both SHA-256-identical to the original disk artifacts. This verifies worker downloads, not the customer's authenticated browser/library end-to-end flow or full geometry quality.

The public Worker `/api/studio/status` returned HTTP 200, `ready=true`, `reason=READY`, and `studioExecutionRevision=studio-execution-v1`. It does NOT expose the new admission revision because the production Worker still uses the old main code. PR #274 has not been merged; main remains `d70adf1c627c9bd5721b6a32e6c020fb3ae59869` at this checkpoint.

## Corrected launcher reporting defect

The installed launcher's line-by-line JSON reader cannot parse the real activation program's indented multiline JSON. Consequently, its separate `result.json` reports `launcher_unconfirmed` despite the verified native installation result. This defect was reproduced locally by executing the original runner body against an inert child emitting the actual pretty-JSON format.

`cloud_shell_activate.py` now accepts one bounded, complete terminal JSON document, rejects contradictory/truncated/nonterminal output and refuses success after a nonzero child exit. Eight new tests execute the actual runner body with an inert child as well as malformed result cases; all eight and the nine existing launcher tests pass locally. Fresh exact-head hosted checks are required. This parser-only change does not alter the reviewed runtime package, release lock, services, installation latch, native gates or spending policy. Existing production logs/results are preserved; do NOT rerun an installation to replace the old reporting record.

## Remaining acceptance and release conditions

The two owner-approved paid Astra Standard reference chessboards remain unsubmitted by this continuation: at most 250 points each, 500 points and USD 4 combined; no automatic retries or replacement jobs. Test 2 follows successful accounted-for completion of Test 1. Paid Copilot/Codex coding-agent tasks remain outside scope.

Before full GO, verify the candidate Worker/account/library/download path and exactly-once point settlement with both approved reference models, obtain green CI for the exact final head, then merge/publish through an exact preserving release envelope. Existing native success and authenticated Oracle downloads do not substitute for this account-bound acceptance. Keep normal generation access enabled, preserve account authorization, point/pricing/provider limits, all customer artifacts and historical held points. No Stripe, subscription, role or balance modification is included.

Earlier evidence is preserved in `docs/history/CONTEST_STATUS_before_20261013_live_activation.md` and its referenced history. See also `docs/ORACLE_ACTIVATION_RUNBOOK_20261013.md`. Its pre-installation status is historical; do not use it to trigger another attempt.
