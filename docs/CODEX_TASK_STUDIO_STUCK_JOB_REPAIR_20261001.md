# CODEX TASK — eliminate endless Studio jobs without duplicate paid generation

Date: 2026-10-01
Scope: WORLDIFACT detailed Astra/Blender Studio recovery only.

## Incident
A customer-visible detailed model remained in `Preparing your model…` for more than 92 minutes even though the Oracle worker has bounded execution time. The Shop polling loop stops permanently after four status-read failures while the elapsed timer continues, producing a false impression that generation is still active. The same stop-after-errors pattern exists in WorldCharacterStudio. A separate account-bound 403 (`This model belongs to a different account or has no account receipt.`) can also leave a saved local receipt selected indefinitely.

## Required implementation
1. NEVER auto-submit a second paid generation. Recovery is GET-only.
2. Add explicit recovery constants:
   - normal poll cadence stays 25s;
   - slow reconciliation poll cadence = 60s;
   - after 4 consecutive status-read failures, switch UI to reconciliation/status-review instead of pretending to generate;
   - server stale-review threshold = 40 minutes, exceeding the current 30-minute agent budget with grace.
3. ShopPage:
   - after four transient poll failures, render `Model needs a status review`, stop the elapsed spinner, preserve the signed receipt and continue GET-only polling every 60s;
   - if a later GET succeeds, automatically leave review state and process succeeded/failed/cancelled normally;
   - a server reconciliation response also continues slow GET-only polling instead of stopping forever;
   - provide an explicit `Archive local recovery receipt` control while in reconciliation. This must call the existing receipt-preserving clearSelection path, require user confirmation, and must NOT cancel/refund/resubmit the server job.
4. StudioCoordinator:
   - exact account ownership 403 must become a local reconciliation state, not an endless thrown polling error;
   - keep malformed/expired-receipt safety behavior unchanged.
5. Server:
   - if Oracle still reports a non-terminal job after 40 minutes from signed receipt issue time, return the SAME job id as `pending + reconciliationRequired`;
   - do not settle/refund/cancel the job merely because it is stale;
   - if the worker later reports terminal state, return that terminal state normally;
   - if the entitlement ledger is already failed, preserve that terminal ledger state rather than masking it as reconciliation.
6. WorldCharacterStudio:
   - never stop forever after four polling errors or the current attempt counter;
   - use the same reconciliation state and 60s GET-only cadence;
   - no new POST from polling/recovery.
7. Tests:
   - 4 poll failures -> review state, no POST, a fifth scheduled GET still occurs;
   - later successful status exits review;
   - account ownership 403 -> reconciliation, no receipt deletion, no POST;
   - >40 minute worker building state -> pending reconciliation, credits remain reserved, no refund, no second Oracle POST;
   - later succeeded/failed state supersedes stale review;
   - explicit archive preserves history and only clears current local selection;
   - existing payment/entitlement and generation duplicate-submit tests stay green.
8. Update docs/CONTEST_STATUS.md with VERIFIED/IMPLEMENTED/BLOCKED truth. Do not claim that an already-stuck live job was repaired until production is deployed and read-only/recovery evidence confirms it.

## Safety
Do not change Stripe, PayPal, plan prices, point costs, USD1.75 Astra guard, Oracle 900s request timeout, account entitlements, model identity, or stored model artifacts. Do not run paid Astra. Do not delete old receipts. No production merge/deploy until exact-head CI is green and owner explicitly approves merge/deploy.
