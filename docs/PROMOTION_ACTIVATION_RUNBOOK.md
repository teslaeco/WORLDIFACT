# Private promotion activation

The owner authorized the original ten account-bound, single-use 1,000-point codes,
valid for 30 days. This is NOT authority to replay historical denied point
corrections, change Stripe, add provider funding or create a replacement batch.

## Existing access

GitHub environment `Production` already contains `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. The successful preserving release used these credentials.
No new token, login account, permission expansion or credential export is required
for the reviewed Actions route. Never print secret values or put them in artifacts.

The dedicated audit workflow runs only on the named operations branch, attempt 1.
It uses three authenticated Cloudflare GETs: deployments, the pinned active version,
and deployments again. It stops on split traffic, version drift or concurrent
publication. Output is an explicit allowlist of presence booleans and flag states;
no raw configuration, account IDs, code hashes or API error bodies are logged.
It neither deploys nor calls account ledgers, Stripe or generation providers.
Official API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/

## Original batch preparation

Obtain the original batch through the owner's private channel. Its existing PDF is
encrypted; unreadable content is a blocker, never justification to replace codes.
Do not ask for encryption passwords or sign-in credentials in chat.

`scripts/prepare-private-promotion-batch.mjs` accepts a private JSON object on stdin:
`accountId` (verified auth record UUID), `startsAt` (UTC epoch milliseconds), and
`codes` (exactly ten original strings). Do not put these values in shell arguments,
GitHub inputs, commits or logs. The only CLI argument is an output filename in a
private directory outside the repository. Output creation is exclusive, mode 0600.
Raw codes are omitted; claim IDs are stable for the same code/account.
Preparation DOES NOT activate codes and does not prove provider funding.

## Activation gates and preservation

1. Confirm the authenticated owner UUID and original code compatibility. Preserve
   original codes and existing claim identities; never silently regenerate either.
2. Read active Cloudflare configuration through the existing token. If definitions
   already exist, stop for reconciliation; never replace unknown definitions.
3. Stage only the approved hashed definitions privately, keeping promotions disabled
   until verified. Registration must preserve all other secrets, vars, bindings,
   subscriptions, balances, held points, stored models and historical receipts.
4. Enable only this approved batch, record deployment metadata and the exact bounded
   terms privately. A verified rollback disables promotions without deleting claims.
   This branch does not implement or execute that production mutation.
5. Verify the owner's authenticated GET `/api/account/promotions` returns active.
   Real redemption must add exactly 1,000 points once; repeat must add zero. A test
   consumes one original code and must be recorded as redeemed, not delivered as
   unused. Do not manufacture replacement codes or reverse ledgers to hide the test.
6. Deliver the private file only after activation/readback; identify any used code.
   Current audit presence results alone cannot be called successful redemption.

Emergency disable pauses new and unfinished redemptions. Preserve claim/grant audit
markers. These internal points do not fund provider API consumption; ADMIN budget
allocation and a paid generation test remain separate bounded operations.

## Rollback of this operations change

Close the operations PR/remove its branch to retire the branch-only GET workflow.
No production rollback is needed because it performs no mutation. Delete local
private staging files through the owner's normal retention policy; never attach
them to a public issue, PR, Actions artifact or repository release.
