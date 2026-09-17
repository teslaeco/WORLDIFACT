# WORLDIFACT status — Oracle v33 identified, 17 September 2026

## New owner-side evidence

The owner ran the read-only SSH inventory from OCI Cloud Shell. The latest screenshot (13:56 local display) shows host `froge-blender-vcn`, user `opc`, architecture `aarch64`, and `worker_found: true`. The command reached the generator VM, not the temporary Cloud Shell filesystem. This is owner-provided output, not a direct administrative session held by the assistant.

| Source file | Owner-reported Git blob SHA | Comparison |
|---|---|---|
| `server.py` | `4e40ac5e30b1dadd3c2b97c18d746a630122ccf3` | Exact public v33 blob recovered and reviewed |
| `codex_runner.py` | `55a4442f411a7e2c6060cca298a056004d30d9d4` | Matches the reviewed FAST base |
| `blender_mcp.py` | `1fe58476bd1366c8c8106dc76439db1974fa51a4` | Matches the reviewed FAST base |
| `runtime/run.py` | `48e4e456084b5bbd7e6b399f4210992d41bfdfe7` | Matches the reviewed FAST base |

The public installed server blob was successfully read through the GitHub connector. Three differences from the reviewed v35 server were identified: the connector version number; two advertised reference-acceptance/release fields; and the choice of raw agent acceptance versus the newer host review-evidence result. A local reconstruction of these exact differences reproduces the installed blob SHA, so this is not a guess based on the version label.

The existing FAST updater for v35 must NOT be applied directly to v33, and changing its expected checksum to ignore differences would not be sufficient review. The new narrow v33 adapter preserves the installed release identity and its existing STANDARD acceptance behavior; FAST still returns an explicitly unreviewed result.

## Implemented and tested in the existing PR

- PR #36: https://github.com/teslaeco/WORLDIFACT/pull/36
- Branch: `perf/fast-preview-profile-20260917`
- Full task: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)
- General patch boundaries: [../tools/fast_preview/README.md](../tools/fast_preview/README.md)
- New adapter: `tools/fast_preview/installed_v33.py`
- New regression suite: `tools/fast_preview/test_installed_v33.py`
- Read-only Cloud Shell helper: `tools/fast_preview/oracle_preflight.py`

The v33 adapter verifies all four exact source hashes, applies only reviewed FAST changes, compiles each output and saves five patched source files plus four original copies in a NEW separate staging directory. It does not install them. It rejects changed source, a pre-existing FAST helper, symlinks, an existing destination, or output inside the live worker. It never copies private `state`, jobs, credentials, runtime tools or verification receipts.

Code head `784d26a577b73765b8bf552564a1ad23d07615a3` passed:

- WORLDIFACT full verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35219496836
- Worker review: https://github.com/teslaeco/WORLDIFACT/actions/runs/35219496917

The worker run includes the new exact-v33 staging tests and runs the existing FAST policy/local-HTTP/supervisor regressions with the v33 server variant. Original source preservation, no copying of private sentinels, mismatched-source refusal and preservation of STANDARD behavior are checked. Existing compilation/standard tests and the real Blender fixture still pass. This is source/fixture evidence, not an installation on the owner's ARM VM.

The subsequent Cloud Shell helper is read-only. It resolves the existing running `froge-blender` instance in `eu-amsterdam-1`, uses the existing SSH key with strict host checking, rechecks source identity, reads service states and only the count of unfinished jobs, and checks the existing binary/Blender verification receipt. It neither prints keys nor reads the OpenAI provider configuration. It will import only the reviewed installer helper with exact SHA `ee6e3471d947a69196d1d554a6f22acf080b53e9` for read-only binary verification. A mismatched helper remains UNKNOWN, not executed blindly.

The helper was syntax-checked locally, including its remote program, and tested with mocked OCI/SSH calls for exact VM resolution and strict host verification. Those local tests did not connect to Oracle. The user-facing copy is `WORLDIFACT_FAST_ORACLE_CHECK.py`.

## Next operational boundary

**Four primary source identities: confirmed against owner output and public source. Complete installed runtime/dependency verification: still pending. FAST activation: not performed.**

Changing Codex/MCP source invalidates its current verification receipt. Do not fabricate that receipt or deploy files before checking the supported verifier and ensuring no active job will be interrupted. The next user-side helper reports Python version, installer/runtime-check source identities, existing verified binary/source status, worker/tunnel states and unfinished-job count, without installing or restarting anything.

The old ZIP remains a review artifact. No instruction to unzip it into `$HOME/froge-connector` is given. A later installation must retain rollback copies, preserve all model/job/state data, run genuine verification and obtain the applicable production approval. Neither this source-stage adapter nor a GitHub merge installs Oracle services by itself.

## Preserved FAST task and performance truth

The owner previously showed a working generated chess knight in WORLDIFACT with its local archive and reported about 16 minutes. Its file and STANDARD pipeline are untouched. FAST is a separate capability-gated profile, not a replacement generator or a shorter timeout presented as measured output.

FAST v1 targets one compact text-only object: one Blender build, at most six provider requests/12,000 output tokens and a 110-second orchestration guard, followed by a checked GLB draft. Optional image review and full interchange packaging are deferred. Profile selection is explicit; old workers cannot silently accept it as STANDARD. Old STANDARD canonical input/receipt digests and archive entries remain compatible.

Earlier exact-head `88ead6b` renderer fixture measured STANDARD 41.560 s versus FAST 0.615 s for the same fixed rocket GLB, with identical 397,056-byte output, 1,948 triangles, three materials and one 512x512 image. That comparison excludes real AI, Codex, Oracle queue/startup, transfer and browser rendering. It does not establish a new AI model within two minutes. Physical ARM/Android and fresh AI timing remain unverified.

Earlier detailed evidence, source fixes and artifacts are preserved at:
https://github.com/teslaeco/WORLDIFACT/blob/88ead6b1619bdc4ac18b5c7113ef25360af827a7/docs/CONTEST_STATUS.md

## Production, costs and publication

PR #36 is not merged and FAST is not installed or enabled. This task did not restart the worker/tunnel, modify the production site, overwrite source, change secrets or alter the original model archive. Preparation was performed through GitHub and local offline/source tests, not a claimed separate cloud-agent run.

The last owner generation screenshot showed all six previously approved reservations used. The earlier deadline was `2026-09-17T09:23:37.535Z`. No new paid model request, refund/reset, higher ceiling, expiry extension or cloud resource was authorized or executed here. A paid speed test needs a separate bounded approval after the real FAST worker is ready.

Public existing Shop: https://worldifact.xodobrox.workers.dev/shop
Original hosted Studio, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

No new model-identity, native 4K/8K, manufacturing, public product-catalog or contest-readiness claim is made. No competition decision/submission is part of this source-identification step. Previously recorded browser restrictions remain respected.
