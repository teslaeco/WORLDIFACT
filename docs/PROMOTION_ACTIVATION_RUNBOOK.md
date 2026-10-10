# Private promotion activation

## Exact approval and scope

On 10 October 2026 the owner explicitly requested a NEW private list, registration,
activation and delivery only after activation. This supersedes the previous
original-batch-only restriction. The approved replacement consists of ten
account-bound, single-use codes, 1,000 internal points each, valid for 30 days.
It does not authorize historical denied point corrections, Stripe changes,
provider funding, ADMIN allocation or paid generation. The original encrypted
file remains preserved; its unreadability is no longer the activation blocker.

## Private preparation

Verify the owner UUID against the authenticated account record. Generate ten
cryptographically random codes privately, outside the repository. The offline
compiler accepts accountId, startsAt and codes on stdin and writes only hashed
definitions to an exclusive mode-0600 private file. Raw codes, account identity
and hashes must never appear in commits, public logs or Actions artifacts.
Stage compiled definitions only in Production environment secret
WORLDIFACT_PROMOTION_BATCH_20261010. Existing Cloudflare account/token secrets
supply deployment access; no credentials are exported or permissions expanded.

## One-time activation gates

The branch-only activation workflow is dormant until a NEW regular marker file
.github/activation/private-promotion-20261010.json is added in its own commit.
First publish and pass all five CI workflows for the implementation parent.
The marker names that exact reviewedParent and the explicit approval identifier.
Runtime guards enforce the repository, owner actor, operations branch, push event,
first attempt, single parent and marker-only addition. Reruns are rejected.

The activation validates exactly ten definitions, a single account, 1,000 points,
one redemption, identical start times and 30-day expiry. It uses authenticated
Cloudflare GETs to require the known active version with exclusive 100% traffic,
no existing promotion bindings, no newer unpublished version and no concurrent
publication. A single PATCH /secrets-bulk sets only promotion definitions and the
enabled flag, atomically, preserving omitted secrets. No retry is permitted after
an ambiguous write. No account ledger or generation provider endpoint is called.

After writing, require a new stable active version at 100%, identical code etag,
handlers, runtime and all unrelated bindings; only two secret bindings may be
added. Emit an allowlisted receipt without identity, hashes or secret values.
An uncertain write means STOP and inspect metadata, never rerun activation.
Official API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/bulk_update/

## Verification and delivery

Passing synthetic tests proves authorization, duplicate protection and preservation
behavior in tests. Successful API publication/readback proves batch configuration
activation; it is not proof of a real account redemption or provider funding.
The owner redeems through Account / Credits (Subscriptions), using the verified
account. A real redemption consumes a code; do not label it unused, replace it or
reverse its ledger to conceal the test. Deliver the ten private codes only after
the deployment receipt verifies activation, with exact expiry and account scope.
Never attach the file to GitHub or publish it as an Actions artifact.

## Revocation and rollback

Emergency disable sets only WORLDIFACT_PROMOTIONS_ENABLED to false using the
existing deployment access; preserve definitions, claim/grant markers and ledger
history. Re-enable only after reconciliation. If an individual code needs
revocation, remove its active definition after reconciling any unfinished grant,
and preserve all other definitions plus its historical claim/grant records. Disabling prevents new/unfinished redemptions; it does not
reverse already granted points. A source rollback must preserve runtime bindings.
Removing the branch workflow retires the operation but does not revoke codes.
Internal points do not fund provider API consumption. ADMIN budgets and any paid
real-generation test require their own bounded approval.
