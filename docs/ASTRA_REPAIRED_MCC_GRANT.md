# Repaired MCC one-attempt allowance

This is one separate project-funded attempt after the STANDARD runtime repair.
It preserves the original and supplemental allowance records. It does not reset
their singleton keys, change Stripe, change prices, or replenish ordinary funding.
The implementation is inert without private operator configuration.

`WORLDIFACT_ASTRA_REPAIRED_MCC_GRANT` is a private Cloudflare Text binding holding
a serialized JSON string, not a native JSON-object binding. It contains exactly seven
fields: `version` (the number `1`), either `accountId` or `accountEmail`, a fresh
UUID `grantId`, canonical UTC `issuedAt` and `expiresAt` strings, `amountCents`
(the number `175`), and `fingerprint` (64 lowercase hexadecimal characters).
The interval must be positive, at most 24 hours, and currently active. Sandbox
ledgers cannot use it. Email ownership comes only from the server-verified,
confirmed authentication identity. Never commit populated configuration,
identities, prompts, fingerprints, or credentials.

The private fingerprint is the existing Studio receipt fingerprint: the SHA-256
of `WORLDIFACT-ACCOUNT-JOB-v1:<verified account UUID>:<canonical input digest>`.
Compute the canonical digest as `await inputDigest(validateStudioInput(input))`, or use
the existing `(await prepareStudioInput(input)).inputDigest` from the approved complete
input. Do not hash an unvalidated raw object: canonical property ordering and
defaults are part of the protocol. This binds the prompt, all generation settings, absence
of references, and account. No new or configurable digest protocol is introduced.
The server independently limits the allowance to the validated, unpriced
STANDARD detailed Shop route without references. Blueprint, FAST, reference,
specialized quality profiles and explicitly priced tiers cannot consume it.
Read-only general availability does not approve an arbitrary input: preparation
and submission enforce the private exact input commitment.

The authority is always the fixed Durable Object name
`astra-support-repaired-mcc:v1`, using the permanent key
`support-astra-repaired-mcc:v1`. Neither name is derived from `grantId` or any
configuration value. One atomic global winner is bound to the verified account,
job, fingerprint, amount, grant, original issue/expiry window, and claim time.
The account copies that full immutable claim atomically with its job and
250-point hold. An occupied malformed marker also stays consumed. Rotating an
ID, changing a window, removing and restoring configuration, changing email
ownership, restarting, failing, or replaying cannot create another allowance.

This allowance is a fallback for insufficient ordinary provider funding. Existing
ordinary and earlier support admission retain their precedence. An unresolved
configured earlier allowance with no account marker blocks this fallback,
including when that earlier configuration has expired. No uncertain older claim
falls through to the new authority. Once a new global claim is acknowledged,
that account reservation remains project-funded even if ordinary funding changes
before its transaction; a rejected claim cannot downgrade to ordinary spending.
An initially ordinary-funded admission never claims this allowance.

On the new-funded path the ordinary provider key is read only: no debit,
same-value write, lazy seed, or later recredit occurs. The old account and global
keys are never written. The new job has explicit grant provenance and is excluded
from all ordinary provider release, historical reconciliation, pending-receipt,
and funding-evidence classifications. GET status and quote reads create no claim,
job, hold, funding, or provider request.

Expiry is rechecked after queued transactions and storage awaits, at account
commit, and at the one-use dispatch fence. The dispatch deadline cannot exceed
the original grant expiry. A lost or malformed acknowledgement stops submission
and retains any durable claim for the same job only. There is no automatic paid
retry. Concurrent or repeated submissions cannot obtain a second dispatch.

Only an accepted successful result settles the existing 250-point hold as a
charge, once. Failure releases those held points but permanently consumes the
attempt. The full USD 1.75 authority remains consumed even on failure or a
pre-dispatch stop; no unused portion becomes customer or ordinary provider funds.
Existing runtime, cumulative provider allowance, identity, points, billing-review,
receipt, artifact-validation and recovery gates remain authoritative. Deploying
this change alone neither provisions the private allowance nor launches a job.

Tests use inert synthetic identities and local Durable Object/API fixtures.
Passing fixtures establish software behavior, not live API spend, runtime
installation, manufacturing suitability, or the quality of a generated model.
