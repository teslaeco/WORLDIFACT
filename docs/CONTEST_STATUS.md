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
