# WORLDIFACT status — Oracle preflight passed, 17 September 2026

## New owner-side evidence

The owner supplied the completed read-only Cloud Shell/SSH preflight (screenshot showing 15:13). It reports the actual generator VM, not the temporary Cloud Shell filesystem:

| Check | Owner-side result |
|---|---|
| Worker found / primary source hashes | `true` / `source_matches=true` |
| Architecture and Python | `aarch64`, Python `3.9.25` |
| Installer helper | `ee6e3471d947a69196d1d554a6f22acf080b53e9` |
| Runtime-check helper | `d55115d74925b10661c8407f4db87ec52a9f0d79` |
| Official Codex binaries verified | `true` |
| Existing MCP receipt matches current sources | `true` |
| Unfinished model jobs | `0` |
| Worker / tunnel services | both `active` |
| FAST helper present | `false` |
| Generation requested by preflight | `false` |

This removes the earlier pending preflight blocker. It is owner-provided evidence from a bounded read-only script, not an administrative connection held by this assistant. The screenshot does not mean FAST is installed or that its speed target has been met.

Exact primary hashes and the three reviewed v33/v35 differences are retained in the earlier ledger:
https://github.com/teslaeco/WORLDIFACT/blob/a02d74529a6b9b754f7e46765867e71404b5a48c/docs/CONTEST_STATUS.md

## Prepared next step: an opt-in narrow installer

PR #36 remains the single review branch: `perf/fast-preview-profile-20260917`.

Added:
- `tools/fast_preview/install_v33.py` — exact-v33 maintenance engine, default PLAN ONLY.
- `tools/fast_preview/test_install_v33.py` — ten installation/rollback regression tests.
- `.github/workflows/fast-install-review.yml` — no-paid installation-safety checks.

The installer requires an explicit `--approve-service-restart` flag. It is NOT a Cloud Shell launcher and has NOT run on the owner's VM. A brief service-maintenance authorization and a pinned, verified delivery step remain necessary. Do not tell the owner to run it in Cloud Shell as though that were the VM, or unzip the older v35 source package over the working v33 directory.

### Implemented maintenance safeguards

The engine rechecks the four exact installed files, the existing installer/runtime-check helpers, and the exact offline verifier before stopping anything. Unknown source, active work, a mismatched service directory, an existing FAST override or invalid current verification stops the operation.

It stages only the five reviewed FAST source files and retains the four original files plus the genuine old verification receipt in a new rollback workspace outside the live source. It does not migrate or delete model archives, provider settings, jobs or private keys. A process lock prevents two copies of this installer from running together.

Before stopping the worker, a SQLite write reservation is held while checking the unfinished-job count. The check changes no database rows and prevents a new job row from committing between the idle check and the confirmed worker stop. The existing tunnel is not restarted. Users may see temporary service unavailability during maintenance; this is not a zero-downtime update.

After applying source, the engine runs the exact reviewed `codex_smoke.py --build`: real local Codex/Code Mode/MCP/Blender operations with model responses replaced by fixtures. The genuine verifier, not the installer, creates the new source-verification receipt after passing. It does not run the binary installer, paid-trial script or a new provider generation.

Only then does it set the job-scoped FAST capability flag through an owned systemd user drop-in, start the worker and check the loopback health response. The existing connection token stays on the VM, used only for that local GET, and is never printed or copied. Failures attempt restoration of original source and receipt, restart and local verification. Concurrent unexpected edits are not overwritten; unsuccessful recovery is explicitly marked `RECOVERY_REQUIRED`. A host crash or uncatchable termination is not claimed covered by the tested rollback paths.

## Verified source/test milestone

Source head `f8995f7e8d8c6392b089c98a9872719d3801d641` passed all three checks:

- WORLDIFACT complete verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35228099157
- Existing FAST worker, v33/standard regressions, actual Blender fixture and packaging: https://github.com/teslaeco/WORLDIFACT/actions/runs/35228099072
- New installer safety: https://github.com/teslaeco/WORLDIFACT/actions/runs/35228099194

The installer workflow reports **10/10 tests passed**: approval refusal, active-job refusal, source mismatch, successful source staging/install simulation, offline-verifier failure, failed post-start health, preservation after concurrent source changes, idle recheck failure, partial-write failure after rename, symlink rejection and SQLite admission protection (several cases share a test). It uses real temporary files/SQLite with injected service and verifier operations. It is not an actual systemd/Oracle installation or paid AI run. Python 3.9 syntax is checked; execution on the owner's ARM/Python combination remains a deployment check.

Default execution prints PLAN ONLY and changes no source or service. Later documentation commits require their own final-head check before merge; the verified runtime code above remains unchanged by this ledger update.

## Release decision and remaining work

**GO for requesting scoped maintenance approval. NOT INSTALLED / NOT MERGED / NOT DEPLOYED.**

The next approval should cover the exact-v33 installation, backup, temporary worker stop/restart and controlled rollback. Website PR #36 publication is a separate release step after worker readiness, because a site merge alone cannot update the Oracle process. No new paid trial or additional capacity is included. The installer repeats all preconditions so an old screenshot cannot authorize interrupting a later active job.

The owner’s successful chess-knight generation and approximately 16-minute observation remain the real baseline. Earlier matched Blender fixture measurements (about 41–44 seconds with optional review versus 0.615 seconds without it for the same rocket GLB) exclude real AI, Oracle startup/queue, transfer and browser rendering. FAST's 60–120-second end-to-end target is still unverified. STANDARD is unchanged and remains the default until capability is confirmed.

The last owner screen showed all six original reservations used. No counter reset/refund, seventh attempt, new expiry, new cloud resource or paid benchmark was authorized or performed in this step. A fresh bounded model test must be approved separately after installation and publication.

Working public Shop: https://worldifact.xodobrox.workers.dev/shop
Original hosted Studio, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/
Full instruction: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)

No changes were made on Oracle or production by this task. Preparation and tests used connected GitHub tools; no separate cloud-agent session is claimed. Saved knight/original assets, secrets, private archives and other worlds remain untouched. MAKE remains validation-required, and this work does not establish native 4K/8K detail, sale approval, a public product catalog or competition readiness/submission.
