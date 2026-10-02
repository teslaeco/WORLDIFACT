# CODEX TASK — durable cloud Studio generation, no lost jobs or premature point loss

Date: 2026-10-02
Severity: P0 / customer-money and result-recovery path
Owner approval: implement, open PR, merge and deploy only after exact-head green CI.

## Incident

Production Android evidence shows a paid 250-point Astra/Blender generation starting, then the page returning to the default/example preview instead of presenting the active/result job. The visible credit balance dropped immediately. A customer must never lose the only recovery state for a paid cloud job because React remounted, local browser state disappeared, polling failed, or the page refreshed.

## Required invariant

A detailed Studio generation is a durable cloud job. Browser state is a cache, never the source of truth.

### Server/cloud job record
- The verified account ledger stores the exact Studio UUID, input fingerprint, safe prompt copy, creation/update time, financial state/cost and quality profile before Oracle submission.
- Keep one current Studio pointer per account for recovery. A fresh signed receipt for that exact UUID may be issued to the same verified account.
- A browser with no local receipt must GET the current cloud job before it is allowed to show the example/sample preview.
- Recovery is GET-only and must never submit another Oracle generation.

### Idempotency
- Client sends `X-WORLDIFACT-Idempotency-Key` equal to the signed receipt UUID.
- A mismatched explicit key fails before point reservation or Oracle.
- The signed UUID remains canonical for older clients that omit the extra header.
- Repeated same-UUID submissions can only return/recover the existing ledger/job state; no second Oracle POST.

### Customer points
- Detailed Studio paid jobs use a hold, not an immediate destructive debit.
- Account exposes `credits`, `reservedCredits`, and `availableCredits`.
- While a Studio job runs: credits remain unchanged; cost is included in reservedCredits and excluded from availableCredits.
- A structurally valid completed model commits the held cost exactly once.
- Oracle rejection, invalid output, cancellation, explicit missing job reconciliation, or watchdog timeout releases the hold exactly once.
- This does not replenish provider/API spend budget. Provider guard accounting remains conservative and separate.
- Existing blueprint/Sol/Luna accounting is not migrated by this fix; preserve existing semantics.

### UI lifecycle
- Never replace an active/recoverable cloud job with the sample/example image.
- On app mount with no local receipt, check cloud current-job state first.
- Terminal failure/cancel stays visible until the user explicitly dismisses it; do not auto-clear into sample preview.
- Transient polling errors use bounded exponential backoff and keep the same job selected. Never stop silently after N errors.
- Reconciliation state continues periodic same-job checks and does not unlock a duplicate paid submit.
- On succeeded downloadable job, fetch the exact GLB, save it to the device archive, refresh gallery/Game Lab signals, and retain the job identity.
- Explicit dismissal clears only the current pointer/selection after preserving receipt history.

### Timeout
- Keep the verified 15-minute Astra provider-request timeout and existing Oracle budgets.
- Whole Studio recovery watchdog is separate and conservative (35 minutes in this revision). If still nonterminal after that window, mark failed/release customer hold/no auto retry.
- Do not claim provider cancellation if only WORLDIFACT reconciliation timed out.

### UX
- Global/account credit UI visibly distinguishes held points from actual balance.
- Generation quotes use availableCredits when a hold exists.
- User messages explicitly say whether points are held, committed, or released.

## Security and payment boundaries
- Cross-account receipts remain invalid.
- Do not expose prompts publicly.
- Do not change Stripe, PayPal, subscription pricing, plan grants, model point prices, Astra USD1.75 spend guard, or manufacturing claims.
- Do not run a paid generation merely to merge this code fix.

## Regression requirements
- same job submitted concurrently => one Oracle POST and one hold;
- browser local receipt lost => cloud current job recovered by GET only;
- transient poll failure => no sample reset and no new POST;
- failed job remains visible until explicit dismissal;
- mismatched idempotency key => reject before reserve/Oracle;
- failed/invalid/timeout => hold released once, credits unchanged;
- valid success => held 250 committed once;
- quote/account status show held vs available points;
- all existing receipt, cross-account, billing, library-sync, quality-gate, artifact and deployment tests stay green;
- full lint/typecheck/tests/browser smoke/build/foundations/deploy-check green.

## Release
After exact-head green checks, squash merge under the owner's explicit approval and require the normal production Cloudflare deployment to pass. Then perform read-only production smoke only; do not run paid Astra without separate cost approval.
