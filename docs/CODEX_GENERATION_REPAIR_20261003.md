# Codex task: restore account generation in AI Shop and Game Lab

Owner instruction: diagnose the regression relative to the model displayed as
2 October 2026, 00:46:40 Europe/Amsterdam (1.7 MB), implement the repair, and
merge and deploy after successful verification. That timestamp is a comparison
anchor, not proof of a particular deployed Git revision.

## Observed failure

The 3 October 21:48–21:51 screenshots show procedural Blueprint controls:
Sol reports exhausted account provider funding despite available customer
points; Astra and the portal quote remain unknown/checking. Oracle's detailed
runtime was successfully activated at 21:40, but that does not establish the
independent Blueprint/account admission path or a paid generation result.

## Required investigation and implementation

1. Compare the working-time Git baseline and current shared admission, funding
   reservations, dispatch and settlement. Reproduce specific failures before
   editing. Do not use a blanket rollback as a substitute for diagnosis.
2. Prevent new Blueprint attempts rejected before provider dispatch from
   permanently consuming their reserved provider allowance. Use a durable,
   atomic dispatch fence; preserve uncertain, dispatched and historical costs.
   Test late dispatch, cancellation/recovery, concurrency and exact-once release.
3. Reconcile old account-owned terminal Studio jobs using authenticated sealed
   Oracle budget receipts, even when the UI no longer has their current-job
   pointer. Bound enumeration, requests and time; support explicit continuation.
   Missing or inconsistent evidence must retain the existing reservation.
4. Preserve valid account results if auxiliary billing status fails. Bound
   authentication/quote loading, reject stale cross-account results and ensure
   AI Shop, Game Lab and portal controls share actionable availability states.
   Refresh may reconcile verified unused funds; it must never create a model.
5. Preserve funded pool limits and the approved detailed tiers: 250 points with
   maximum USD 2, or 500 points with maximum USD 4 after exact-draft acceptance.
   No point grants, balance resets, invented refunds, extra provider funding,
   automatic paid retries, model switches, or card charges.
6. Keep historical models, exports, billing identity and authentication intact.
   Do not print secrets or bypass the previously recorded browser restrictions.

## Release evidence

Exercise the actual routing and durable storage paths with targeted regressions,
including real SQLite where relevant. Verify quote recovery in the browser
fixtures, then run repository verification and deployment dry-run. Publish an
isolated PR; merge only after the applicable checks pass, then inspect the actual
production deployment and its commit. Update the evidence ledger with what is
reproduced, repaired, deployed and still unverified. Do not claim a live paid
model succeeds from mocks, installation receipts or CI alone.

No new paid generation is part of this repair's automated verification.
