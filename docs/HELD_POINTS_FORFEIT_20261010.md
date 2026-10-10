# Owner-approved held-point forfeiture — 10 October 2026

The owner explicitly confirmed closing four identified failed requests (250 points
each) without refund and leaving 190 available points. This is a new bounded
operation, not a replay of the 9 October compensation waiver or any denied grant.
Authenticated production readback before implementation: total 1,190, held 1,000,
available 190. Subscription purchase records, ten active private invitation codes,
models, original job IDs, receipts and the earlier waiver are preserved.

## Exact operation

GET `/api/account/held-points-forfeit` previews. POST accepts only
`{"approvalId":"held-points-forfeit-20261010-v1"}`. The standalone page is
`/account/held-points-forfeit`; entering it only reads. Its POST is explicit and
never automatically retried after a lost response. It mounts outside ordinary
account/billing recovery effects.

Server-side verified UUID and exact Durable Object namespace must match the
approved account commitment. Fixed hashes/timestamps bind exactly four requests;
request parameters, editable profile metadata and environment variables cannot
supply another owner, amount or job. Same-origin POST, authentication, limiter,
strict bounded JSON and live-namespace checks apply.

One native transaction validates the exact balance and held baseline, scans all
paid/legacy holds, verifies terminal bounded provider receipts and original
fences, then updates only four point-settlement markers, balance, held aggregate
and one immutable audit. The operation subtracts 1,000 from both total and held:
**1,190/1,000/190 → 190/0/190** (total/held/available). Changed balances, concurrent
code grants, missing jobs, partial scans, different terms, unknown costs and
corrupt audits fail closed before writes. Four bounded liabilities must sum to
68 cents (the difference between the observed eight-job 392-cent bound and the
preserved four-job 324-cent prior waiver); this assertion is verified against
actual per-job receipts by preview, not treated as an invoice or actual spending.
No provider reserve, liability, Stripe record, subscription or promotion changes.

The new `forfeited` state records zero held/charged points and 250 forfeited points
per failed request. It never means successful generation, provider refund or
waived customer charge. Paid-storage reads require the fixed audit and canonical
original/final job commitments. Ordinary writers cannot replace these rows.
Late completion, settlement, reconciliation and dispatch cannot charge, refund,
reopen or regenerate them. Public responses omit raw account/job IDs, prompts,
provider receipts and authority commitments. Original records remain recoverable
from unchanged job fields plus the audit's exact original settlement and hashes.

## Validation and release

Inert tests cover authorization, cross-account/header spoofing, wrong namespace,
strict body parsing, changed balances/jobs/costs, immutable audit corruption,
concurrent application, rollback after every put, lost acknowledgement, recovery,
receipt persistence and no provider calls. Native SQLite tests exercise production
routes, the production storage adapter and real transaction serialization with
fixture-only source substitution. No runtime authority override is deployed.

Source publication is pinned to main `09639730fc093d4371c7dae56a0c3903fefed03a`,
exact paths/marker, regular files and a single-parent squash. Existing preserving
transport skips billing/secret synchronization, builds a no-vars deployment config
and uses `--keep-vars`. Publication cannot execute the correction; the historical
financial release job is explicitly disabled. Final CI/deployment/application
receipts are recorded in the PR; no success is inferred before each gate passes.

## Rollback and emergency stop

Before application, remove/disable only the new POST in a reviewed source release;
GET can remain read-only. After application, retain the new settlement validator,
immutable audit read barrier and recovery behavior. Do not restore an older writer
that cannot read `forfeited`, delete the audit, reset aggregates, refund points or
replay historical grants. Restore UI separately through the preserving transport.
Any compensating financial entry requires a new exact owner approval. Preserve
remote secrets, active invitation definitions, bindings, migrations and all jobs.
