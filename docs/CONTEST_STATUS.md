# WORLDIFACT — Oracle FAST-spend compatibility checkpoint

Updated 28 September 2026 after the owner's second diagnostic screenshot.

## VERIFIED from the owner's read-only diagnostic

Worker and tunnel are active. `codex_runner.py` has valid Python syntax, one Responses URL literal and a `fast_spend` import. It does not import `astra_spend`; `astra_spend.py` is missing. Runner Git blob: `52c9d68d131178f879bedb9dc496c3c08cc2a3cf`. The earlier base-only installer expected the variant before the FAST-spend update and stopped before restarting or changing generator source.

## VERIFIED — exact source reconstruction and tests

Review PR: https://github.com/teslaeco/WORLDIFACT/pull/138
Tested application/tool commit: `7dc6d5a04f8a0cfc392124a1e19ddb83aa40de5c`.

Dedicated guard run https://github.com/teslaeco/WORLDIFACT/actions/runs/36454576515, job `109037528114`, completed successfully. It reconstructed the entire runner and helper from the pinned Froge source plus the two previously reviewed patches. The runner SHA-256, runner Git blob, fast_preview and fast_spend SHA-256 values exactly match the screenshot. The unchanged install_codex, runtime_check and codex_smoke source hashes match as well. Twenty tests passed without skips or failures, covering source ancestry, preservation of old FAST code, Codex tool namespaces, spending under concurrency, restarts, corrupt state, read-only diagnostics and rollback fixtures. This is not an actual Oracle installation or live model test.

The full `Verify WORLDIFACT` workflow for the tested commit also completed successfully in run `36454576498`. FAST installation safety, Cloud Shell launcher and Oracle project-file review workflows passed. The separate existing FAST draft runtime review was still in progress at this checkpoint; no global all-checks claim or production merge is made.

## Prepared maintenance behavior

The installer supports the exact existing FAST-spend variant using both fingerprint matching and reversal of only the known patch to the reviewed ancestor. It patches current bytes and preserves older safeguards rather than installing an older generator. A changed or mixed source version still fails closed. Models, server.py, blender_mcp.py, account data and billing flags are not replaced.

The same pinned launcher performs an idle-job check, private backups, a controlled worker restart, real offline Codex/MCP/Blender fixture verification and authenticated local health checks. Its new token-count path is mocked only in that offline verification process; production protection and the USD 1.75 conservative per-job ceiling remain active. Guard tests use fixtures, not paid OpenAI requests.

## Next operator action

From the original OCI Cloud Shell, fetch exactly `7dc6d5a04f8a0cfc392124a1e19ddb83aa40de5c` and run:

`python3 -B tools/profit_guard/oracle_launch.py --approve-service-restart`

This is a maintenance installer, not the earlier read-only diagnostic. Do not start it during an active generation; it refuses active jobs. Keep the shell open through the offline verification. A successful result must include `WORLDIFACT_ASTRA_GUARD_VERIFIED`. On STOP, preserve backups and send only the fixed diagnostic, not keys/configuration.

No paid model calls, actual Oracle installation, Stripe writes, live price changes or application deployment were performed in this turn. Astra commercial activation stays blocked pending actual runtime protection and a separately authorized bounded live quality test. Main/application production is unchanged; this is a tested review-branch installer.

Detailed provenance: [Oracle FAST-spend compatibility](ORACLE_FAST_SPEND_COMPAT_20260928.md). The complete earlier release ledger is preserved in [pre-source-inspection history](history/CONTEST_STATUS_before_SOURCE_INSPECTION_20260928.md). This documentation-only checkpoint does not change the tested installer bytes.
