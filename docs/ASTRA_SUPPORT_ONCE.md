# Single-job Astra support allowance

This is an explicit operator-funded support exception, not a customer purchase,
payment receipt, refund, subscription upgrade, or unrestricted budget change.
The feature is inert without its private configuration. Deploying code does not
start generation or create an allowance claim.

## Private configuration

Only after approval for the specific account and one USD 1.75 provider reservation,
set `WORLDIFACT_ASTRA_SUPPORT_ONCE` as a private Cloudflare Worker Secret on the
existing `worldifact` Worker. Keep its value out of Git, public workflow inputs,
logs and screenshots. Use exactly these fields:

- `version`: 1
- `accountEmail`: the approved account's exact email, or `accountId` instead
- `approvalId`: a unique audit UUID (not a login token)
- `issuedAt`: canonical UTC ISO timestamp
- `expiresAt`: canonical UTC ISO timestamp, after issuance and at most 24 hours later
- `amountCents`: 175

Email selection requires a fresh authenticated Supabase `/user` response with
`email_confirmed_at`; editable user metadata and phone confirmation are never
accepted as email proof. A mismatched or unconfirmed email receives no allowance.
The account UUID stays server-side. No new authentication credential is created.

Cloudflare: Workers & Pages → worldifact → Settings → Variables and Secrets →
Add → Secret → Deploy. Existing secrets remain unchanged. Official guidance:
https://developers.cloudflare.com/workers/configuration/secrets/

## One explicit job

The existing authenticated status route reports `studioAdmission` separately
from general model admission. The support exception can fund only an otherwise
eligible detailed Studio Astra job whose ordinary provider allowance is
insufficient. It cannot fund a Blueprint, SOL or LUNA request. The ordinary
250-point hold, membership checks, billing hold, Creator quota and runtime
USD 1.75 hard cap still apply.

A permanent shared claim binds the approved account, job ID and input fingerprint
before the account's funding transaction. It is independent of approval ID,
email changes, calendar periods and deployments. Exact-job replays are
idempotent. A second job or account cannot reuse it, including after email
reassignment. The account transaction records the supplemental 175-cent grant
and matching reservation; its prior provider balance is unchanged. No customer
points are added.

A failure, timeout or ambiguous response never unclaims the allowance. An account
write failure after the shared claim retains that claim; only the original job
may replay the ledger operation. This is not an automatic provider retry. Never
reset markers or fabricate payment grants. The existing financial policy applies
to customer-point settlement after the accepted job completes or fails.

Remove the private configuration after use or expiry if desired. Its absence
keeps the feature inert; durable consumed markers must remain intact.
