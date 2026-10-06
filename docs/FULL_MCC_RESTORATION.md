# Full MCC historical restoration: local review candidate

This restores the entire source tree from September 29 commit
`58e04843cee9afa5f7a8427edf853fe3986f6d45`, tree
`b4a31ba454d744ace4e9625077d6c2f1e8517812`, onto direct parent
`29b6b9af08d62baafddceb029652db321ec83273`. Later product additions,
including dots, are absent. This document is current restoration guidance;
the restored September 29 contest ledger is historical evidence, not a new
claim of current production readiness.

## Exact-source proof and narrow safety exceptions

Run `node scripts/check-full-mcc-source.mjs` while preparing on the base;
run it with `--committed` after making the reviewed direct-child commit.
The check compares the union of every historical and candidate path,
including file modes and Git blob hashes. An added later file, missing
historical file or change outside the explicit constant allowlist fails.
No directory globs or broad modern-backend allowance are used.

The allowlist is fixed in `scripts/check-full-mcc-source.mjs`:
- `server/entitlements.ts`, `server/billing.ts`, `server/budget.ts`,
  `server/historicalDataBoundary.ts`, and the small boundary dispatch in
  `server/worker.ts`: financial-state preservation and mixed-version RPC
  isolation only.
- `src/lib/studioClient.ts`, `src/lib/studioArchive.ts`, `src/lib/archive.ts`
  and `tests/historical-browser-storage.test.mjs`: quarantine later browser
  state without deleting it or allowing restoration to overwrite it.
- `tests/historical-data-boundary.test.ts`,
  `tests/historical-cutover-protocol.test.ts`,
  `tests/historical-cutover-native.test.mjs` and
  `tests/fixtures/pre-rollback-do-routing.json`: state-preservation and
  mixed-version protocol tests, with only routing predicates in the fixture.
- `tests/affordable-models.test.ts`, `tests/approved-fast-test.test.ts`,
  `tests/budget.test.ts`, `tests/paid-provider-budget.test.ts`,
  `tests/payment-ledger.test.ts`, `tests/studio-accounts.test.ts` and
  `tests/studio-api.test.ts`, `tests/core.test.ts` and
  `tests/p0-astra.test.ts`: historical assertions adapted only to internal
  epoch paths and direct-module budget wrappers.
- The publication workflow, four full-MCC scripts, their test, the narrow
  workflow assertion in `tests/live-generation-config.test.mjs`, this document
  and the single canonical full-MCC operations marker.

The JSON proof lists every actual exception and a deterministic SHA-256
fingerprint of the whole candidate source. Only the canonical review marker
is excluded from the fingerprint to prevent a recursive approval hash.
The marker is separately checked for exact pins, evidence and expiry.
The candidate is not literally byte-identical historical source at the
listed safety/publication exception paths.

## What must remain protected

No user, Supabase account, authentication secret, provider/payment secret,
invoice bridge or existing financial record may be recreated, reset or
permanently deleted. The historical account/auth implementation, identity
URLs, cookie contracts and invoice validation need explicit compatibility
review against the current deployment; source equality alone does not prove
live accounts or payments work. Billing code has only the listed boundary
exception, not a wholesale modern backend replacement. Existing Durable
Object bindings, migration tags and rate-limit namespaces remain unchanged.
Epoch-isolated writes prevent old and new Worker instances from writing each
other's state representation; they do not settle in-flight provider jobs,
release holds or prove a complete operational cutover.

The source backup was verified remotely at
`backup/pre-full-mcc-restore-20261006-1507`. A Git branch is not a backup of
Durable Object state, Supabase users, provider holds, billing ledgers or
Oracle artifacts. Verified restorable state backups, paused mutating ingress,
reconciled in-flight work, drained billing delivery and an archive/cutover
procedure remain operational review requirements. No workflow step performs
those changes. Keep private backup contents and remote variable values out
of Git; the marker stores only non-sensitive evidence references and hashes.

## Runtime configuration is a separate unresolved decision

`node scripts/build-full-mcc-config.mjs` writes an ignored local config to
`.wrangler/full-mcc.wrangler.json`. It preserves bindings/migrations and
removes all declared variables except `OPENAI_FAST_MODEL=gpt-6-sol`.
Wrangler must be invoked with `--keep-vars`. This keeps current remote
payment settings and generation flags rather than silently replacing them
with September 29 values. No secret synchronization occurs.

The one model override is required for the old server contract; keeping
`gpt-6.1-sol` would make that historical generation path report DEMO. Model
availability and the exact current runtime flag snapshot still require
review. The historical `ENABLE_ASTRA_PLANS=false` controls new plan offers;
this release does not overwrite the current payment settings to that value.
Their compatibility and intended policy must be resolved explicitly.

The historical Astra admission gate remains 175 cents. An existing reserve
may remain insufficient for that gate. No funding restoration,
Astra availability, provider success or new paid-generation authorization is
claimed. Offline tests and GET-only smoke do not establish those outcomes.

## Fail-closed publication

Pull requests and main-branch pushes run offline review and packaging only.
PR review checks out the exact PR head SHA, not the synthetic merge commit,
with full history for the direct-parent and historical-tree proof. The review
job has no production secrets or paid operations. Publication requires all of:
1. The exact direct-child committed source passes whole-tree verification
   and its source worktree is clean after all build preparation.
2. `ops/FULL_MCC_RESTORE_RELEASE_20261006.json` has an explicit
   `reviewed-approved` status and its reviewed source fingerprint matches.
3. Evidence covers the source backup, restorable runtime-state snapshot after
   quiescence, active jobs/holds, billing ingress, protected users/auth/invoices,
   preserved bindings and exact runtime/payment decisions. Approval is valid
   for at most 24 hours; quiescence must still be valid when deployment starts.
4. An explicit main-branch workflow dispatch with
   `PUBLISH_REVIEWED_FULL_MCC` and the existing production environment approval.

The publication workflow has a new name deliberately. Restored historical
paid-pilot, smoke and resume workflows listen only for the old publication
workflow name, so this release cannot trigger them. Historical paid push
workflows target their original isolated branches. The main-branch asset
ingestion markers are unchanged from the direct parent, so no ingestion is
re-armed. Do not dispatch old paid workflows or push their activation branches.

The checked-in marker deliberately leaves every unverified approval false
or null. Do not fill it from assumptions, fabricate receipts or convert local
passing tests into operational approval. The workflow checks the gate before
preparation and again immediately before Wrangler. It contains no provider
or payment credential sync, Stripe/PayPal setup, checkout probe, financial
POST, generation POST or paid test. It makes no security-setting change.

## Verification and receipts

Run the focused offline suite with
`node --test tests/full-mcc-release.test.mjs`, plus `npm run verify` and
`npm run deploy:check`. Historical CI may package a base config for checking;
it is never the publishing config. A source-proof failure or runtime review
block is not permission to bypass the gate.

The new smoke accepts only the original Wrangler NDJSON deployment record,
retains its actual version identifier and fingerprints the receipt before and
after verification. The workflow archives the original bytes even when the
smoke fails. No synthetic version identifier is used for publication proof.
It sends GET requests only: `/api/health`, application routes and every built
static asset. It validates source-pinned foundation metadata, local build
hashes, remote bytes and limited same-origin canonical HTML redirects.
The exact Terra metadata paths `apps/terra/eclipse-live/.dual-countdown-release`
and `apps/terra/eclipse-live/.placeholder` are allowed and hash-verified;
every other hidden asset path is rejected. Root deployment control files are
not public assets. Browser/device appearance, account balances, invoice
settlement and paid model operation require independent evidence.

No commit, push, production deployment, runtime backup, payment operation or
paid provider call is performed by preparing these files locally.
