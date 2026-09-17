# WORLDIFACT status — FAST maintenance authorized, 17 September 2026

## Latest owner authorization

After the passed VM preflight and explanation of backup, temporary stop/restart, rollback and later PR #36 publication, the owner replied: "Tak róbmy to tak by działało prawidłowo zrób to ale później uruchamiamy go na nowo".

This authorizes the described exact-v33 maintenance and automatic worker restart. The website merge/publication remains conditional on successful worker verification. It does NOT authorize a new paid model test, a larger allowance, a refund/reset, an expiry extension, another VM or a contest submission. No further repeated consent is needed for the already specified maintenance.

**Current execution boundary: NOT INSTALLED / NOT MERGED / NOT DEPLOYED in this turn.** The assistant can edit and test repository code, but the user's existing Cloud Shell/SSH session is the administrative execution channel. The command delivered to that session is the installation action; writing this ledger or creating a launcher is not proof of its execution.

## Owner-side preflight retained

The screenshot at 15:13 reports the correct `opc` VM with `aarch64`, Python `3.9.25`, source_matches=true, verified Codex binaries, a genuine matching MCP/Blender receipt, zero unfinished jobs, active worker/tunnel services and no FAST helper. This was read-only and requested no model.

Exact v33 source identity and adapter evidence:
https://github.com/teslaeco/WORLDIFACT/blob/a02d74529a6b9b754f7e46765867e71404b5a48c/docs/CONTEST_STATUS.md

Complete prior installer design, failure boundaries and 10/10 installation-safety tests:
https://github.com/teslaeco/WORLDIFACT/blob/a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b/docs/CONTEST_STATUS.md

The exact installer revision `a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b` passed all three final-head checks: installation safety `35228541886`, full WORLDIFACT `35228542037`, and FAST worker/real-Blender fixture `35228541986`. Artifact `10500245980` was downloaded through the authorized GitHub action; its outer SHA-256 `c7994e312dae4c44295ec4a7bde7a665748ab9716446088ea698025eff0f2c87` and all 43 inner-manifest entries were verified locally.

## Implemented delivery step

`tools/fast_preview/oracle_launch.py` is now a self-contained Cloud Shell launcher, not another diagnostic or a replacement generator. It pins the five installation/patch files to `a1dfc7b...` and verifies each SHA-256 both before transfer and on the VM. No ZIP extraction into the running generator is required.

The launcher resolves only the existing RUNNING `froge-blender` instance in eu-amsterdam-1. It uses the existing SSH key via SSH without reading key contents; strict known-host verification stays enabled. It does not upload secrets, configuration, models or job data.

Only the explicit `--approve-service-restart` invocation can start installation. Default invocation is PLAN ONLY, and `--status` cannot start it. The remote intent is saved before the transient service is launched. Repeating the same command, a lost launch acknowledgement, or a phone reconnect observes that same record rather than starting installation again.

The existing user service manager must have lingering enabled; the launcher refuses to change that setting if it is absent. A detached transient `.service` runs the reviewed installer independently of the phone/SSH session. The launcher does not use a synchronous scope, pipe or interactive TTY. Its user-visible status excludes private logs and reports worker/tunnel states plus the rollback directory.

`tools/fast_preview/test_oracle_launch.py` adds 11 no-network regressions using real temporary files with mocked service-manager/transport operations. They cover PLAN ONLY, status-only reads, changed payload/package refusal, one launch after a lost acknowledgement, existing-source protection, linger refusal, symlink rejection, strict SSH, safe rollback reporting and requiring actual running services before reporting success. `.github/workflows/fast-launch-review.yml` runs these tests and Python 3.9 syntax checks. Local execution passed all 11 tests. CI evidence for the final head belongs in the PR handoff; these tests do not claim an actual systemd launch or a completed Oracle installation.

## Actual installer behavior (unchanged)

The reviewed engine rechecks exact source and verifier hashes, active services, the real current binary/source verification and empty queue. It makes original-code and genuine-receipt backups in a separate rollback directory, holds a SQLite reservation while rechecking idle and stopping the worker, and changes no existing model/job rows.

It applies only five source files, runs genuine local `codex_smoke.py --build` with provider responses replaced by fixtures, and lets that verifier create its receipt. It does not fabricate the receipt, run a binary installer or call a paid provider. Only after successful verification does it enable the explicit FAST capability, restart `froge-worker.service` and check loopback health. The tunnel is not restarted.

Failure handling attempts restoration of original code/receipt and checks the restarted original worker. Unexpected concurrent edits are not overwritten. Failed recovery is reported as RECOVERY_REQUIRED; machine failure or uncatchable termination is not claimed covered. The remote installation service is not automatically retried.

Expected handoff on success: `phase=INSTALLED_AND_LOCALLY_VERIFIED`, worker_service=active, tunnel_service=active, paid_generation_requested=false. Only after receiving verified installation output should PR #36 be merged and the existing website release followed. A code merge alone does not install the worker.

## Performance and cost truth

The owner's approximately 16-minute successful chess-knight generation and saved original remain the baseline. FAST is opt-in; STANDARD remains unchanged. Prior fixed-Blender comparisons (roughly 41–44 seconds with optional review versus 0.615 seconds for the same GLB without it) exclude AI, Oracle queue/startup, transfer and browser rendering. A real 60–120-second model is still UNVERIFIED. No new paid test was run.

The last user screenshot showed the original six reservations used. The previous deadline was 2026-09-17T09:23:37.535Z. Nothing in this maintenance increases that counter ceiling, resets/refunds it, or extends the window. A fresh bounded benchmark requires separate approval after installation and publication.

PR #36: https://github.com/teslaeco/WORLDIFACT/pull/36
Task: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)
Working Shop: https://worldifact.xodobrox.workers.dev/shop
Original hosted Studio: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

Existing knight/assets, private archives and other worlds are not migrated. MAKE remains validation-required. No native 4K/8K, likeness, sale approval, public catalog or contest-readiness claim is made. Recorded browser restrictions remain respected.
