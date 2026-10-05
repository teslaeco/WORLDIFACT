# One project-funded MCC attempt

This implementation supports one separately authorized Studio Astra request. It
does not replenish customer funding or restore an unlimited ordinary service.
Code publication alone does not activate it. The release owner must separately
verify the account, approved input, provider readiness and current permission.

## Private configuration

`WORLDIFACT_ASTRA_PROJECT_BUDGET` is a private Worker Text JSON value, not an API
credential. Its only accepted fields are:

| Field | Required value |
| --- | --- |
| `version` | `1` |
| `accountId` | The existing verified account UUID, lowercase |
| `issuedAt` | Canonical ISO timestamp chosen at activation |
| `expiresAt` | Canonical ISO timestamp after issue, at most 24 hours later |
| `maxProviderCents` | `175`, exactly |
| `maxAttempts` | `1`, exactly |
| `fingerprint` | Lowercase SHA-256 of the full canonical Studio input, bound to that account |

Do not put activation timestamps, account identifiers, email addresses, job IDs,
the final private prompt or a completed configuration value in this repository.
There is no configurable grant ID, namespace, refill, attempt count or larger
budget. An email address cannot bind or transfer this authority.

The fingerprint uses the existing normalized Studio input digest and the
existing account-bound receipt formula. It covers the prompt, purpose, world,
texture setting, photos and generation/pricing metadata. Only the existing
unpriced, standard-quality Astra route in the Shop, without photos or fast-draft
metadata, can use this project source. The operator must freeze the exact input
before computing its fingerprint. A prepared manifest is not trusted as proof of
the actual submitted input; the server validates and hashes that input again.

## Capacity and settlement

The fixed internal Durable Object name is `project-astra-mcc-once:v1`, using the
existing `ACCOUNT_ENTITLEMENTS` binding. Its single key is
`project-astra-mcc-budget:v1`. No Durable Object migration or new credential is
required. The record contains the immutable configuration plus `source: project`,
`attemptsUsed: 1`, `reservedCents: 175`, one job ID and its claim timestamp. The
account stores an identical record atomically with the existing 250-point hold,
job and current-job pointer.

The 175 cents is committed maximum API capacity, not a claim that an invoice
charged exactly that amount. A failure or uncertain response does not restore
the project slot. Project leftovers never credit the ordinary provider reserve.
The existing accepted-success checks settle 250 customer points once; a terminal
failure releases the point hold. This implementation changes no prices, payment
records, Stripe integration or historical support-grant records.

The matching approved draft selects the project source before ordinary funding
or any earlier support grant, even if ordinary funding becomes sufficient.
Unmatched drafts retain their existing funding behavior. The selected project
request cannot fall through to an earlier grant or ordinary reserve when its
record is occupied, its acknowledgement is uncertain, or its configuration is
removed, expired or changed. A read-only lookup of the fixed global record keeps
that source selection after a global-only commit. An occupied record with
unclassifiable provenance fails closed; it is unavailable, not proof of actual
provider spend. A source-lookup outage similarly refuses new eligible work.

The existing one-use dispatch fence is bounded by both the receipt window and
the original project expiry. Expiry is checked again after asynchronous storage
writes and immediately before the Oracle POST. Concurrent jobs can obtain one
global claim and one account hold. A prior active account Studio job prevents a
new project reservation. Replays of an existing account reservation are recovery
only; they cannot issue another Oracle POST. A global-only claim can recover the
same never-dispatched job within its original authorization, but no code retries
it automatically. A lost dispatch acknowledgement remains recovery only.

Never delete, reset, repair in place or rotate either persistent project record
to obtain another attempt. Configuration removal, date changes, account changes
and restarts cannot release the occupied slot. Historical grants and the ordinary
provider-reserve key must stay byte-identical throughout the project request.

## Verification and release boundary

`tests/astra-project-budget.test.ts` checks strict authority parsing, separate
storage, single-winner races, global-only recovery, source precedence, immutable
historical keys, configuration changes, corrupted provenance, expiry at awaited
storage boundaries, holds, settlement and reconciliation exclusions.

`tests/studio-project-budget.test.ts` exercises the existing prepare/receipt/
submission/dispatch/result pipeline with inert provider responses. It checks
canonical input binding, forged manifests, available old grants, read-only
preparation with writes forbidden, response loss, delayed expiry, at most one
Oracle POST and successful or failed customer-point settlement. Synthetic GLB
fixtures establish protocol/structural behavior, not visual model quality or a
successful real provider run.

Run the focused tests, `npm run verify`, `npm run deploy:check` and independent
review on the final package before release. A dry-run is packaging evidence only.
Private activation and a paid provider call remain separate owner-controlled
steps. This document contains no activation value or instruction to execute a
live request.
