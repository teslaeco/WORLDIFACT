# Bounded one-time API tests: 6 October 2026

Status: local implementation and offline verification only. No test is activated,
no provider request has been made by these checks, and no deployment is implied.
This delta depends on PR #219 merge `d229a3e37f37bd85476dc3d8d969dd49fdae488d`,
whose reviewed tree is `2714872c8d442ab684aac98f5af4c2de93c37692`. The release
owner must finish that unchanged deployment before coordinating this separately
reviewed test mechanism. This local work does not publish or activate either release.
Its separate release marker accepts only the exact 19-file scope with that sole
parent, preserves remote variables, and skips the five billing setup/check steps.
Missing or changed scope fails before credential setup. Do not use the default
financial release flow for this test mechanism.

## Fixed authority

The user renewed permission for one aggregate maximum USD 4 test run at
`2026-10-06T04:44:44.000Z`. Its fixed new authority is
`api-tests-20261006-044444-usd4`. The user specified no expiry. The conservative
implementation cutoff for new commitments and dispatch is
`2026-10-06T12:00:00.000Z` (14:00 UTC+02); it is not a user-stated deadline. Stop
earlier when the required tests finish or the budget is committed. There is no
automatic extension. The former unpublished window expired at 04:00 UTC with
no test spend, as established by the coordinating operator; its authority is
not revived and no old claims are reset.

- At most two detailed Astra attempts, each reserving 175 cents.
- At most one GPT-6.1 Sol blueprint, reserving 35 cents.
- At most one GPT-6 Luna blueprint, reserving 10 cents.
- The complete matrix reserves 395 cents, leaving 5 cents unused.

Reservations are conservative spending commitments, not invoices. No commitment
is recycled after a failed, rejected, uncertain, cancelled or successful test.
Known actual provider usage may be reported separately. Existing customer-point
holds/refunds retain their normal behavior; points are never API-spend authority.
The ordinary provider ledger and all earlier support/MCC grants remain unchanged.

The fixed pool namespace does not derive dynamically from an account, grant ID,
date, input or configuration value. Actual Durable Object identity enforces it.
Its first claim binds the account and full authority.
Configuration changes cannot refill it. Each claim binds its exact job ID,
fingerprint, workflow, model and cap. Only an identical retry can reuse a claim.
Account reservations use a dedicated internal route, never ordinary-funding
fallback. Corrupt or missing acknowledgements fail closed and keep any committed
ceiling. No reset, refund or reactivation endpoint exists.

## Private account selector

No new key, service or payment setup is required. If the existing private
`WORLDIFACT_ASTRA_PROJECT_BUDGET` setting is structurally valid for the verified
account at its original issue time, it supplies only that account selector. Its
old amount, fingerprint, expiry, attempt and consumed records grant no new
spending permission. The fresh fixed one-time policy supplies this authority.

An optional explicit `WORLDIFACT_OVERNIGHT_TEST_BUDGET` overrides that selector.
If explicitly present but invalid, it fails closed without fallback. If neither
selector works, an owner may set the following private Worker setting using the
already verified account UUID:

```json
{"version":1,"approvalId":"api-tests-20261006-044444-usd4","accountId":"<verified-account-uuid>","issuedAt":"2026-10-06T04:44:44.000Z","expiresAt":"2026-10-06T12:00:00.000Z","totalCents":400}
```

Do not put this account-specific value in a public config, repository, URL or
frontend bundle. Never change old consumed grant records or the ordinary balance.
No explicit setting is needed when the existing private selector verifies.

## Operator procedure after authorized release and review

Only the coordinating operator starts paid requests. The normal generation UI
continues to use normal funding; it is not an overnight-pool activation button.

Use the visible **`/account/overnight-tests`** page after the authorized release.
It uses the existing same-origin HttpOnly session cookies, without reading or
displaying them. No API key, access code, session-token extraction, browser-console
request or separate authentication command is needed. Opening the page only reads
the authenticated pool status. Other accounts cannot see enabled test controls.
The page explicitly identifies itself as temporary testing: it does not restore
ordinary customer funding or claim that the ordinary generator can now start.

Enter a description and use one clearly priced **Start paid** button at a time.
Two fixed Astra slots and one slot each for Sol and Luna preserve account/run/slot
receipts separately from ordinary generator storage. The browser must support
Web Locks; an exclusive, nonqueued account/run lock prevents overlapping starts
across tabs. An occupied slot cannot be overwritten or reset. No automatic retry,
replacement, cloud-job discovery or paid submission occurs on mount or reload.
Use **Recover same request** to inspect that exact receipt, then its explicit GLB
download control when allowed. Blueprint GLBs are exported locally from the
returned specification; they are labeled procedural GAME models. Downloads pass
the existing structural GLB validator, which does not establish visual quality.
The page never writes a test artifact into the ordinary model archive automatically.
New starts disable at the fixed cutoff; same-receipt recovery remains available.

The endpoint details below document the page's own API contract. They are not an
instruction to bypass visible controls or extract authentication credentials.

1. Confirm the exact reviewed base and this delta were released through the
   authorized publication flow. Do not infer deployment from local tests.
2. With the existing authenticated account, read
   the visible page's **Refresh test budget** panel, backed by
   `GET /api/overnight-tests/status`. This endpoint is authenticated and rate
   protected, and does not create a pool record. Confirm the fixed approval,
   deadline, total 400 cents, committed amount and per-workflow attempt counts.
   If unavailable or inconsistent, stop. Do not switch to a normal endpoint.
   Inspect the existing visible generator's configured model and readiness before
   choosing a test. A READY label establishes configured route readiness, not
   account access to a provider model. The selected direct test still requires
   the existing token-count preflight before paid Responses dispatch; denied
   model access stops that dispatch. Detailed Astra uses its existing runtime
   and cost-guard checks. Provider access and live quality remain unverified until
   the actual request reports them. Do not substitute a model or recycle a failed
   test's commitment to seek a successful result.
3. Detailed tests use `POST /api/overnight-tests/studio/prepare`, then
   `POST /api/overnight-tests/studio/jobs` with the same input, returned signed
   receipt and existing idempotency header. Only the existing unpriced STANDARD
   175-cent policy is permitted. Tier upgrades and FAST detailed jobs are refused.
   Test and ordinary signed-input hashes are distinct and cannot switch source.
4. Direct tests use `POST /api/overnight-tests/blueprint`. Preserve the existing
   request UUID, body and model negotiation: Sol is `model: "sol"` with
   `providerModel: "gpt-6.1-sol"`; Luna is `model: "luna"` with
   `providerModel: "gpt-6-luna"`. Astra blueprint is outside this test matrix.
5. Keep each receipt/request UUID. After an uncertain response, recover the same
   request through the normal read-only Studio/Blueprint recovery endpoint.
   Never allocate a replacement UUID automatically. Older deployments return
   an unknown test route rather than silently spending ordinary funds.
6. Start promptly after the reviewed deployment and inspect each result before
   another explicit test. At the technical 12:00 UTC cutoff, new pool claims
   and dispatch leases are refused. Stop earlier once the required checks finish.
   Already accepted work may finish later within its existing committed cap;
   this mechanism does not claim to cancel a running Oracle model at 12:00.
7. Report terminal outcome, available artifacts, exact retained point behavior,
   committed test ceilings and verified usage separately. Do not describe a
   stub/offline fixture as live generation or a capped result as accepted quality.

No normal customer gains an unbounded allowance. Authentication, billing review,
customer-point availability, rate limits, Oracle readiness/concurrency checks,
per-job cost guards, signed receipts and dispatch fences remain in force.
