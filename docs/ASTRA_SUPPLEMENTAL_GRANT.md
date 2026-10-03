# One additional Studio support allowance

`WORLDIFACT_ASTRA_SUPPLEMENTAL_GRANT` is an optional private operator-approved
allowance for one detailed Studio Astra attempt. It is inert when absent,
malformed, expired or not matched to the authenticated account. Source deployment
does not activate it or submit a model. This is operator-funded support, not a
payment receipt or evidence that refunded customer points contain unused API funds.

The private JSON configuration contains exactly six fields: `version: 1`, either
`accountId` or `accountEmail`, `grantId`, `issuedAt`, `expiresAt`, and
`amountCents: 175`. IDs must be UUIDs; dates must be canonical UTC ISO strings in
a window no longer than 24 hours. An email scope requires the authoritative
authenticated account's confirmed email. Never publish configuration values or
put them in the frontend. Configuration and activation require a separate,
explicitly bounded operator approval.

The new global namespace and account marker are independent of the original
one-use support record. Neither old records nor ordinary provider funding are
reset. Configuration rotation, removal/readdition, another account with the same
email, restart and failed settlement cannot reuse the additional allowance.
Both original and additional allowances preserve normal plan access, billing
review, Creator quota and available-point checks.

Ordinary funding is used first, then the original support allowance if eligible.
An attempted or uncertain original claim never falls through to the additional
allowance. A global-only original claim without its local counterpart must be
recovered or reviewed; it cannot silently switch funding sources.

The new global authority binds one exact account, job UUID, payload fingerprint
and original approval window before account admission. Uncertain acknowledgement
retains that claim. Only the same request can recover it. Full claim validation
repeats at account admission, including current expiry, before the atomic point
hold and local marker. A failed local transaction cannot grant a different job.

One accepted reservation holds 250 points. Verified successful settlement charges
those points once; failure releases the hold. Neither outcome restores the
additional allowance. The existing USD 1.75 per-job Oracle cap, dispatch fence,
model quality checks and no-automatic-replacement policy are unchanged.

The account's read-only `studioAdmission` projection controls the existing Shop
quote and Generate button. An optional `astraSupplementalGrant` projection
contains only availability, consumption and the fixed maximum, never private
identity, grant ID or ledger balances. Blueprint and other-model eligibility do
not borrow this allowance. Optional authority outages preserve ordinary account
status without advertising unconfirmed support.

In-memory regressions cover expired and malformed configuration, authenticated
scope, original-record preservation, concurrent claims, lost acknowledgements,
window changes while an acknowledgement is pending, expiry during storage reads,
unchanged settlement and the actual Studio route's same-request dispatch fence.
These checks do not constitute a live paid generation or model-quality result.
