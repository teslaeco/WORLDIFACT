# Oracle durable-admission activation runbook

## Release identity and current boundary

The reviewed runtime package is pinned to commit `7f357323fafb362bd72cf05799a4bba8f5100d52`. Its 59 public Python files are independently SHA-256-pinned in `tools/oracle_admission/activation_release.json`; the entire lock has SHA-256 `2b49888f04a3a00fef2294dac9dc6ac699829b02204b7ead168f36a43528f21f`. The new runtime server is `c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150`. The exact package passed all nine GitHub workflows, 57 Oracle tests and flat-package original-native-pin checks. It has NOT been installed on the production VM by those checks.

The launcher is a separate current-source entry point. It downloads only the fixed reviewed public package. No historical forced-command maintenance grant, API credential or source pin is changed. Use the original authorized Oracle Cloud Shell, existing delegated OCI identity, original SSH key and existing strict host trust. Do not copy secrets into chat or a public artifact.

## Default and read-only inspection

`python3 -B tools/oracle_admission/cloud_shell_activate.py` prints PLAN ONLY and performs no network or file action.

`python3 -B tools/oracle_admission/cloud_shell_activate.py --status` locates the existing `froge-blender` VM through its preconfigured Cloud Shell identity and reads the one release attempt. Missing/unknown attempts return `unconfirmed`; they do not create a process, infer completion or reset anything.

The source-preparation utility `install_admission.py` remains preparation-only. Do not remove its explicit activation refusal. The real transaction is `activation.py` inside the verified release package.

## Approved start and durable identity

Once actual VM access and idle/cancellation preflight are verified, use the owner-approved new launcher with `--approve-service-maintenance --source-commit <exact commit containing this launcher and lock>`. If the separately reviewed historical cancellation requires bounded cleanup consent, both `--allow-cancelled-cleanup` and its exact `--expected-cancelled-job` must be provided. Do not guess a job ID or reuse an old grant for this new package.

The new launcher requires the VM's already-enabled lingering user manager. It creates one private fsynced attempt directory, then starts `worldifact-admission-7f357323fafb362bd72cf05799a4bba8f5100d52.service` with `Restart=no`, a bounded runtime and private logs. This service is designed to be independent of the launching SSH/Cloud Shell session. Existing partial attempts, dropped acknowledgements and repeated start commands **only inspect that same attempt**; they never start a second installation. This behavior is unit-tested with mocked service control, not yet proven on the actual VM.

A returned `started` or `running` is NOT completion. Only a validated `finished` result with `WORLDIFACT_DURABLE_ADMISSION_VERIFIED` and `activation_committed=true`, followed by independent authenticated runtime/source/receipt checks, establishes installation. `unconfirmed` never permits deleting the latch, replacing the job, reinstalling or blindly rolling back. Use read-only status and inspect the original private attempt.

## Installer and post-install acceptance

The installer performs exact source/receipt checks, original pidfd guardian/idle protection, private code-only staging, four genuine native CLI/MCP/Blender gates, six model/mode gates, and the actual staged HTTP/SQLite/immutable-model-term reopen gate. All provider responses in native gates are inert. After successful source-bound evidence, it rebinds receipts and activates the exact write set, with pre-activation rollback and no retry after an ambiguous latch.

No paid generation, account/balance/Stripe change or job-row rewrite is performed by the installer or launcher. Do not use successful synthetic tests as proof of original paid request cost or as permission to release old holds.

After verified installation, validate the current Worker canary with the real account-bound generation and library path. Owner authorization is two Astra Standard chessboards, at most 250 points each, 500 points and USD 4 combined, no automatic retries or replacement jobs. Test 2 requires successful accounted-for completion of Test 1. Verify 8x8 geometry, actual downloaded files, persisted library entry and exactly-once cost settlement. The prior historical `p0-paid-pilot.mjs` is NOT this approved test sequence and must not be run.

Merge and publish only after those real acceptance gates, exact-head green CI and the preserving release envelope. Keep ordinary generator access enabled afterward, retaining normal account, point and provider caps. Do not reset customer data or claim error-free operation from health alone.
