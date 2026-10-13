# WORLDIFACT P0 — 13 October 2026

## Current release verdict: NO-GO — activation implemented, not installed

PR #274 remains the repair branch. Main was `d70adf1c627c9bd5721b6a32e6c020fb3ae59869` at this checkpoint. No new production activation, merge, deployment or paid generation is claimed.

## Latest implemented milestone

The full separate `tools/oracle_admission/activation.py` transaction now exists, with exact predecessor/candidate source authority, unchanged historical native-gate pins, complete receipt rebinding, the original pidfd guardian/idle controls, bounded native subprocess supervision, an actual staged HTTP/SQLite/immutable-term restart gate, authenticated health, pre-activation rollback, and no automatic recovery after an ambiguous activation latch. The earlier `install_admission.py` remains preparation-only; its refusal has not been bypassed.

Ten new local synthetic activation tests pass. They exercise the real file transaction, every approved write with both pre-write failure and lost acknowledgement, bad native/ingress evidence, active/unknown/cancelled job rejection, preservation of customer files/balances, concurrent unknown edits, and post-latch uncertainty. Native gates and service identities are explicit fixtures in those tests. Fresh hosted results are required for this new commit; no actual VM native acceptance is inferred.

The candidate server SHA-256 `c3e6b1e2894515ceabb4ec6570b8e68a5398664743212a36ba16a77be8200150` was independently reconstructed in [Oracle run 38339263726](https://github.com/teslaeco/WORLDIFACT/actions/runs/38339263726). That earlier source-identity head passed 46 Oracle tests and all nine workflows. The new release manifest freezes this candidate and the two independently pinned helpers; all original provider/price/model/renderer modules remain byte-identical.

## Confirmed queue defect and correction

A failure writing final timing diagnostics could kill the only queue thread and leak an in-memory running identity. The original-worker regression reproduces that defect. The candidate makes non-authoritative timing output best-effort while always cleaning in-memory flags, claims SQLite before advertising RUNNING, handles input-folder faults inside per-job cleanup, and retains the queue loop across transient storage failures. Ten sequential inert jobs, actual SQLite locking and uncertain-commit tests pass in hosted CI. No uncertain provider request is executed again or silently refunded.

This confirmed defect does not identify the cause or historical cost of every missing Oracle UUID. The owner's current screenshot still shows an absent job and retained points. A missing row is not proof of zero API cost, and old held points must not be released without authoritative reconciliation.

## Operational and acceptance boundary

Remote Desktop Commander remains OFFLINE in the latest check. The owner has the previously working Node 22 reconnection command. GitHub reads, code publication and hosted tests work. The earlier blocked source-generation command was not executed by an alternate route; the new modules were independently authored and reviewed directly.

The earlier live VM probe verified all 15 old-runtime hashes, receipt references and SQLite integrity and ran 12 disposable inbox tests. It does not attest this new activation. The new source package includes only reviewed public code; never include private upstream connector files, live VM configuration, credentials, customer models or account data in public artifacts.

The owner authorizes TWO Astra Standard acceptance jobs: at most 250 points each, 500 total, within the previously approved USD 4 combined API ceiling; no automatic retries or paid replacements. Test 2 follows only successful, accounted-for completion of Test 1. Use the approved blue/green and violet/amber references, exactly 8x8 squares. Paid Copilot/Codex coding-agent work is not authorized. No paid acceptance request has been made in this continuation.

Before GO: run the native-gated installer on the actual authorized VM, confirm durable ingress and service recovery, verify two genuine account-bound models, owned library persistence, original downloads and exactly-once settlement, then require exact-head CI and a preserving release envelope. Keep normal generator availability after testing without weakening account/points/budget gates. No Stripe/subscription/role changes, old-hold reset or promise of error-free operation is part of this release.

## Preserved history

The previous full ledger remains byte-for-byte in [history/CONTEST_STATUS_before_20261013_queue_recovery.md](history/CONTEST_STATUS_before_20261013_queue_recovery.md), original blob `8f4530f137b46f814e3c6dc583617c5dabe5cc9e`. Historical dates/status are not current release approval.
