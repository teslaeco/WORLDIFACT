# Approved failed-model hold waiver

This incident-specific operation resolves four failed Studio requests for the
one approved account. It is not a general refund rule or a payment credit.
The owner approved releasing their four 250-point holds, with WORLDIFACT
absorbing the prior provider costs. The stored aggregate provider liability
bound is 324 cents; it is not an invoice or a new payment.

The authenticated preview requires the fixed account and job commitments,
original request times, failed states, original 250-point prices, positive
bounded provider evidence, 1,190 total points and exactly 1,000 held points.
Changed, incomplete or corrupt evidence refuses the operation. Public source
uses commitments rather than private account or request identifiers.

One native account transaction changes only the four customer point-settlement
markers, the aggregate hold from 1,000 to zero, and an immutable incident audit.
The total point balance stays 1,190. Original failure states, prompts, timestamps,
prices, provider liability, usage evidence, legacy fences and model history stay
intact. The distinct `waived` state records the operator's decision; it does not
claim zero provider spending, a provider refund or a completed model. A repeated
application returns the original audit, including after subsequent spending.

Opening `/account/failed-hold-waiver` only reads the authenticated preview or
receipt. Applying requires its explicit button and a same-origin fixed POST.
This standalone page mounts without ordinary account billing or recovery hooks.
Lost or timed-out responses lead to a status read, never an automatic repeat.
The operation never starts a generation. A later paid test is separately bounded.

## Deployment and rollback compatibility

Apply the incident only after the complete new Worker deployment and its live
authenticated preview have been verified. Cached clients should reload before
continuing. The deployment preserves existing production variables, bindings,
secrets, provider caps and Stripe settings. Release probes do not apply the
waiver, settle jobs or call a generation provider.

The older paid-job schema cannot represent an operator waiver alongside
positive provider liability. Unmodified pre-waiver code fails closed on those
rows rather than charging, refunding or redispatching them. Reverting the whole
release after applying the waiver would therefore break older job-detail and
library readers. Never remove or rewrite the audit to make an older reader pass.

A rollback candidate must retain the reviewed compatibility changes in
`server/entitlements.ts`, `server/paidPointsStorage.ts`,
`server/failedHoldWaiver.ts`, `server/studio.ts`,
`src/lib/paidPointsFunding.ts`, `src/lib/failedHoldWaiver.ts`,
`src/lib/studioClient.ts`, `src/lib/recoverHeldPoints.ts` and
`src/pages/ShopPage.tsx`. Retain the standalone receipt page and its route when
the approved operation still needs to be read. These files form a compatibility
overlay on the previous application, not a new waiver authorization.

Validate any such candidate with the incident's native old/new-reader tests,
account-library and failed-job detail tests, API/account isolation tests, and
the ordinary complete release checks before deploying it. Legacy collision
fences and all original provider evidence must remain unchanged. Restoring
unrelated UI or generation behavior must not remove this persisted-state support.
