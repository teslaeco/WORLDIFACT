# WORLDIFACT P0 — 13 October 2026

## Current release verdict: NO-GO — implementation tested, VM activation pending

PR #274 remains the repair branch. Main remains `d70adf1c627c9bd5721b6a32e6c020fb3ae59869` at this checkpoint. No new production activation, merge, deployment or paid generation is claimed.

## Completed implementation and hosted evidence

Commit `7f357323fafb362bd72cf05799a4bba8f5100d52` implements the full separate `activation.py` transaction: exact predecessor/candidate source authority, unchanged historical native gate pins, complete receipt rebinding, original pidfd guardian/idle controls, bounded native subprocess supervision, staged HTTP/SQLite/immutable-term restart verification, authenticated health, pre-activation rollback and no automatic recovery after an ambiguous activation latch. The earlier `install_admission.py` remains preparation-only; its refusal was not removed.

All NINE workflows passed on `7f357323`. [Oracle run 38340496020](https://github.com/teslaeco/WORLDIFACT/actions/runs/38340496020) passed 57 tests on Python 3.9 and 3.12, built a 59-file public-code-only flat installation package, verified its inert default and unchanged native dependency pins. The downloaded package independently matched all 59 SHA-256 entries locally. These results do not prove actual VM native installation.

Ten full-transaction fixture tests cover every approved write with pre-write failure and lost acknowledgement, invalid native/ingress evidence, preservation of models/balances and old prices, active/unknown/cancelled-job rejection, concurrent unknown edits, and ambiguous post-latch state. Native service identities/witnesses are explicit fixtures. The production model/cost modules remain byte-identical.

## New detached launch and admission-fence tests

`cloud_shell_activate.py` and `activation_release.json` now bind the 59-file reviewed package to immutable public commits and independent hashes. Default is inert; read-only status never starts a job. Approved launch uses the owner's existing Oracle Cloud Shell identity, SSH key and strict host trust, then an existing lingering VM user manager. A private fsynced attempt directory precedes a `Restart=no` bounded service. Repeating an uncertain or partial launch inspects the original attempt; it never creates a replacement installation. No historical forced-command grant is extended or reused.

Nine new launcher fixtures and six pending-admission/default-inert tests pass locally, including lost dispatch acknowledgement, repeated start, empty attempt, terminal result validation, private file modes, pending authority, orphaned queue records and unchanged SQLite bytes. Their service control is mocked; actual VM detachment remains unverified. Fresh exact-head hosted CI is required for this new launcher commit. See [Oracle activation runbook](ORACLE_ACTIVATION_RUNBOOK_20261013.md).

## Confirmed defect and repaired candidate

A failure writing final timing diagnostics could kill the only queue thread and leak a running identity. The exact old worker regression reproduces this failure. The candidate makes timing output best-effort while always cleaning flags, claims SQLite before advertising RUNNING, handles folder failures within cleanup, and preserves its loop across transient storage errors. Ten sequential inert jobs, real SQLite locks and uncertain-commit tests passed hosted CI. No uncertain provider attempt is executed again or silently refunded.

The new server SHA-256 is `c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150`. It includes immutable nonbillable STAGE, once-only authorized START, fsynced local input preparation and queued-job restart recovery. This confirmed defect does not establish the historical cost or cause of every missing Oracle UUID.

## Actual remaining blockers and cost authorization

Remote Desktop Commander is still OFFLINE at the latest check. The owner has the previously working Node 22 reconnection command. GitHub source publication and hosted tests work. The earlier rejected source-generation script was not executed through another route; new modules were authored independently.

The old live VM probe verified all 15 predecessor hashes, receipt references and SQLite integrity and ran 12 disposable inbox tests. It is not acceptance of the new activation. The latest owner screenshot still reports an absent job and held points; a missing row does not prove zero API cost. Preserve all original receipts, liabilities and historical holds until authoritative reconciliation.

The owner authorizes TWO Astra Standard acceptance models: at most 250 points each, 500 total, within USD 4 combined API cost; no automatic retry or paid replacement. Test 2 follows successful accounted-for completion of Test 1. Use the approved blue/green and violet/amber 8x8 chessboard references. Paid Copilot/Codex coding-agent work is not authorized. No paid acceptance call has been made in this continuation.

Before GO: obtain actual VM access, run the separately approved native-gated activation with current idle/cancellation proof, verify durable admission and health, then test the real Worker/account/library/download flow with both approved models and exactly-once settlement. Only then merge/publish after exact-head CI and a preserving release envelope. Keep ordinary generator access enabled afterward without weakening account, point or provider limits. No Stripe/subscription/role changes, historical hold reset or promise of error-free operation is part of this release.

## Preserved history

The earlier full ledger remains byte-for-byte in [history/CONTEST_STATUS_before_20261013_queue_recovery.md](history/CONTEST_STATUS_before_20261013_queue_recovery.md), original blob `8f4530f137b46f814e3c6dc583617c5dabe5cc9e`. Historical statuses are not current release approval.
