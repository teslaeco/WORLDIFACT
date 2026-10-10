# Owner access and tester codes — review candidate, NOT activated

## Root cause and current evidence

Audited main: `c6b89b42010f24075a2340cbe3d7fa47a5ddc2a9` (merged PR #245).
That PR records preserving publication as `af724878-448c-42c4-83a3-3ca2a89ae91d`;
this is historical release evidence, not an independent current dashboard read.

`server/entitlements.ts` previously had no owner/admin funding entitlement. Its
ordinary admission evaluates paid membership or positive point balance, available
points, Astra runtime readiness and provider funding. A free account can only
use the limited cheap-model route. Top-up points may permit generation without
a subscription; it is therefore inaccurate to say every generation strictly
requires membership. However, SLOW job download and library permissions explicitly
required active membership. Ownership of the business did not change these rules.

`server/billing.ts` sets `allow_promotion_codes: false`. Its invoice validator also
requires `amount_paid` and `total` to equal the full approved plan amount. Simply
enabling a Stripe discount would risk refusing the discounted invoice's grant.
The live connected WORLDIFACT Stripe account returned an empty promotion-code
list with `has_more: false` during this audit. No Stripe write was attempted.

The existing free-Sol revenue pool is not a private coupon registry. The previous
Credits UI is intentionally disabled. PR #245 records an existing private batch
of ten single-use 1,000-point codes, not registered. No replacement codes were
minted, no private batch was fetched or published, and no code was activated.
The new registry reuses the account Durable Object and existing point balance;
it does not claim an unobserved previous registry exists.

Public GET-only evidence at 2026-10-10T15:09:56Z is stored in
`docs/evidence/admin-access-public-status-20261010.json`. The production API
reported ready Astra/Oracle, cost guard, photos and the historical USD 1.75
STANDARD policy, but `tiersReady: false`. A health response is not end-to-end
account acceptance. Do not offer the tiered route as production-ready.

The account matching the owner-selected Google identity was found in the connected
Supabase auth records, with confirmed email and no ban. No user_metadata is used
for authorization. Its UUID and email are intentionally absent from this public
report and all configuration. Final explicit UUID approval remains required.

Cloudflare returned a generic sign-in failure after Google confirmation. Oracle's
cloud console returned Site Unavailable in this browser. No authenticated remote
configuration, Oracle installation revision or current exclusive traffic readback
was obtained. Neither message establishes that production itself is down.

## Implemented, disabled by default

- `WORLDIFACT_ADMIN_ENABLED` and the private `WORLDIFACT_ADMIN_ALLOCATION` must both
  be explicitly configured. No sample allocation is installed in Wrangler or CI.
- Allocation fields: version 1, exact verified account UUID, unique approval UUID,
  millisecond start/expiry, provider-cent ceiling, job ceiling and allowed model
  names. Maximum accepted validity is 31 days; config limits are 1,000 jobs and
  USD 1,000, not default or approved spending. No date-based refill exists.
- Binding checks use the server-authenticated account and its exact Durable Object
  ID. Email, request-supplied role/identity and editable profile metadata confer
  no privilege. Existing authentication and global dispatch/provider checks remain.
- Model reservations atomically record the original allocation and conservative
  provider ceiling with an isolated admin job. No customer point debit, fake
  subscription, Stripe grant or ordinary provider-budget write occurs.
- Duplicate job IDs cannot double reserve or dispatch. Failed/uncertain requests
  retain their full ceiling; this conservative first version does not automatically
  release unused admin capacity. New allocation approval is a separate operation.
- Old readers see inert terminal fences. New admin records cannot be interpreted
  as ordinary paid jobs or switched to another funding allocation.
- Studio continues through the existing signed receipt, Oracle/Blender, GLB
  validation, settlement, per-account library and download handlers. GAME/MAKE
  input processing and provider payloads are unchanged. Blueprint remains a
  procedural specification route, not a detailed Oracle model.
- Completed admin models retain same-account artifact access after allocation
  expiry or disable. Revocation blocks new dispatch; it does not delete outputs.
- Authenticated quotes display zero customer-point cost and the separate budget.
  `/api/account/admin-history` exposes up to 100 isolated job summaries, marked
  truncated when full. It does not return another account's history.

## Cost evidence limitation

Admin budget means reserved maximum API liability, NOT actual provider invoices.
Existing authenticated Oracle terminal receipts provide a maximum-liability bound.
These are retained separately and do not mint points or automatically replenish
capacity. `actualProviderCents` is explicitly null. Exact provider/infrastructure
billing reconciliation and a paginated full cost dashboard remain unimplemented.
No API invoice, USD savings or successful live generation is inferred from fixtures.
This limitation prevents claiming all of the owner's acceptance criteria are done.

## Tester codes

`WORLDIFACT_PROMOTIONS_ENABLED` and private `WORLDIFACT_PROMOTION_DEFINITIONS` are
absent by default. Definitions are an array of at most 50 records with exactly:
`id`, `sha256`, `accountId`, `points`, `startsAt`, `expiresAt`, `maxRedemptions: 1`,
`purpose: "tester"`. Each code is assigned to one approved account; points are
1–1,000 and validity is at most 31 days. Only hashes are configured. The existing
private batch must be mapped and approved separately; never put raw values in
source, URLs, localStorage, logs or this report. Codes are case-sensitive ASCII
letters/digits/underscore/hyphen, 12–128 characters. Verify compatibility with the
original batch before activation; do not silently replace it.

Authenticated same-origin POST `/api/account/promotions` is bounded and rate limited.
A global Durable Object claims the hash/id/account atomically. The account then
independently re-reads the authoritative claim and grants once in a transaction.
Retries recover the same claim after lost acknowledgements, process restart or
partial failure. Expiry blocks new claims, while an already accepted claim can
finish. Removing a definition or disabling promotions also pauses unfinished
application; restoring its exact approved terms allows recovery. Do not delete
claims or grant audit markers. Changing already-claimed terms fails closed.

An invitation adds internal points only, never a subscription or provider funding.
The legacy provider reserve is frozen at its PRE-grant value if not yet initialized,
preventing the old lazy-seeding formula from converting promo points into API funds.
Thus testers still require an approved existing provider funding route. This code
release does not promise free real generations for otherwise unfunded testers.
Revocation cannot claw back spent points automatically; that would be a separate,
explicitly reviewed financial operation. No such operation is introduced here.

The UI remains inactive unless the authenticated endpoint confirms an eligible
configured definition. No automatic redemption or generation occurs. Switching
accounts unmounts the form; late results cannot update the next account.

## Stripe promotions: NO-GO pending a separate compatible design

Do not change prices, subscriptions or `allow_promotion_codes` in this release.
A future optional discount must specify plan/product scope, amount/percentage,
term, account/customer restrictions, expiry, maximum redemptions and revocation.
It also needs discounted/zero-total invoice verification, refund/dispute and
idempotent grant tests. A valid Stripe discount is never an internal point code.
No historical denied activation, correction or waiver may be replayed via this PR.

## Activation and rollback contract

This PR is source-only. No production coupon, point grant, budget allocation,
provider request, merge, deployment or secret/configuration change is authorized
by creating it. Existing operational restrictions remain in force. Do not add
another deployment workflow to evade the historical main publication guard.

Before production: obtain exact-head CI, assess dependency findings, finish
production config/readback access, confirm the exact owner UUID and bounded terms,
and review the supported preserving release path. Explicit owner approval must
cover merge/publication and the particular allocation/activation separately.

Proposed first live acceptance, NOT executed or authorized: one ordinary supervised
STANDARD GAME test, no paid automatic retry, maximum incremental provider liability
USD 1.75, one approved owner UUID, one job, 24-hour allocation. Existing fixed
infrastructure costs are not included in this API ceiling. Verify prompt/reference
contract, provider cost guard, clean-session identity, one dispatch, new original
GLB hash, preview, same-user library, download and provider receipt. MAKE testing
and exact billed-cost reporting require additional evidence. Do not substitute an
existing MCC model or fixture as new success.

Emergency stop: disable ADMIN and/or promotions through the approved configuration
surface. Existing accepted records and artifacts remain intact. Compatible rollback
must preserve all secrets, bindings, migrations, customer balances, subscriptions,
private definitions, claim markers, admin reservations and original models. Old
Workers fail closed on fenced admin jobs; they do not provide admin-job recovery.
A rollback must therefore keep a reviewed read/recovery-capable version available.
Never restore a historical ledger snapshot or reuse a consumed budget approval.

## Decision

GO for code review only. NO-GO for production activation or declaring the project
complete. Live account generation, current Cloudflare settings, original code-batch
registration, exact provider billing, physical browser/device acceptance and final
security sign-off require evidence. Tests with a fixture provider incur no cost
and are not claims of live Astra output.

## Verification recorded before PR publication

- 2,095/2,095 non-browser regression tests passed, with no skipped tests in that
  selected run. This includes 23 new focused tests for admin admission, tampering,
  concurrency, revocation, rollback, UI lifecycle, HTTP pipeline and native SQLite
  restart. The provider was stubbed; no live AI calls were made.
- `npm run typecheck` passed. `npm run lint` completed with existing warnings;
  this is not a warning-free certification. HTTP smoke and Worker deployment
  dry-run passed without production credentials or deployment.
- The two tests in `studio-native-fetch-browser.test.mjs` were deliberately NOT
  retried locally because the recorded browser restriction remains effective.
  No test file or assertion was disabled. Full `npm run verify`, including these
  tests, remains required on the hosted CI head.
- Initial regression run: 2,085 passed, three failed (two membership harness
  dependency omissions and one missing pinned ISS vendor asset). The harness now
  recognizes the separate redemption component, covered by its own lifecycle
  tests. `npm run preverify` restored the exact hashed vendor/assets; the complete
  non-browser rerun then passed. No historical manifest or assertion was weakened.
- `npm audit` reported five HIGH findings involving miniflare, sharp,
  source-map-js, undici and wrangler; zero critical. Dependency manifests were
  not changed by this PR. Their impact and upgrades require separate review;
  the repository does not have a clean security audit.
- Production build and pinned-asset postbuild passed. Remote CI must still be
  checked on the pushed candidate; no prior green run is substituted for this source.
