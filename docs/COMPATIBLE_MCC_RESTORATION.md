# MCC-era presentation restoration with current data compatibility

Historical presentation reference: `58e04843cee9afa5f7a8427edf853fe3986f6d45`,
published on 29 September 2026. Compatibility base:
`9b2a5a9e48424e11d2d8ddc9b360ec110544a508`.

The owner approved restoring the historical appearance, worlds and generator
forms while retaining current accounting, saved-model support and Oracle
protocol compatibility. This is a compatible presentation restoration, not an
exact source-tree or database rollback.

## Historical experience

- The Shop uses the historical form layout and generation modes.
- `/lab` and `/builder` return to the historical workbench.
- The original Queen is the default shared-world avatar again. Existing original
  assets and other avatar choices are preserved.
- The MCC comparison and existing world content remain available.

## Deliberate compatibility exceptions

- Current server code, account membership, settlement, pricing and generation
  funding policy stay unchanged. The restoration does not add provider funds,
  extend a test allowance or promise that a funding-blocked request will run.
- Current Blueprint request identity, explicit provider-model binding, recovery
  and saved-generation validation remain active. Labels identify the actual
  current Sol provider version rather than presenting an obsolete identifier.
- Current Studio receipt terms, current-job recovery, cloud model library,
  device archives, authenticated artifact access and original-model previews
  remain available. Existing files and signed receipts are not rewritten.
- `/account/models` retains cross-device model access. The existing private-world
  workspace remains accessible separately from the restored workbench.
- Account and payment interfaces retain accurate current membership and held /
  available balance information. Subscription prices, balances, invoices and
  payment-provider configuration are unchanged.
- Existing asset-loading, account-switching and preview teardown safeguards are
  retained while restoring historical presentation defaults.

## Deployment boundaries

The scoped deployment uses the current Worker bindings and migrations, omits
environment variables from its derived configuration, and preserves remote
variables with `--keep-vars`. It does not synchronize or rotate credentials,
configure payment providers, create checkout sessions, install Oracle packages,
or invoke paid generation. Publication smoke checks are read-only.

The installed Oracle runtime, stored models, job database and spending records
remain current. This website release is not an Oracle runtime downgrade.

## Verification

Validation must cover the combined source tree, including historical navigation
and forms, explicit model binding, repeated/interrupted generation flows,
existing model and receipt preservation, account changes and safe deployment
scope. Offline fixtures are not evidence of successful paid generation.

Record exact-head CI and production deployment results in the release PR and
the current status ledger after those checks finish.
