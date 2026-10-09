# WORLDIFACT: repair actual 3D generation, preserve existing money and models

## Owner request and execution boundary

Audit the repository, reproduce the broken customer flow, implement a minimal fix,
run the actual tests, open a reviewable PR, and deploy only if the acceptance gates
pass. Work in `fix/generation-audit-recovery-20261009`; do not create more empty
rescue branches. Do not stop at documentation or claim a working generator from
CI, a health response, a blueprint, an existing model, or a rendered fixture.
No additional paid model/API test has been authorized in this task.

## Verified starting evidence, not a predetermined diagnosis

- Starting main: `38e7048c4176fac4c9808203af5bd58a1ae7d10e` (9 October).
- Historical comparison reference: `493ec7a2088d65f05474d111009d152f49632a6d`.
  This is NOT proven safe for today's persistent records and installed runtime.
- MCC-era presentation reference: `58e04843cee9afa5f7a8427edf853fe3986f6d45`.
- PR #242 changes typed STANDARD construction to scene_json/initial_edit. Its
  description explicitly does not establish a live Oracle installation.
- PR #243 fixes maintenance refresh host trust; its merge is source-only.
- PR #244 introduces incident-specific point-hold waiver compatibility. Do not
  erase it or replay its privileged application while testing this repair.
- `docs/CONTEST_STATUS.md` distinguishes recent paid-points admission, preview
  complexity, and historical billing corrections. Read these before editing.
- The no-secret audit collector only probes five fixed public GET routes. Its
  inventory is not a complete code review. Treat unavailable probes as UNKNOWN.

## Immutable exclusions

Do not alter Stripe/PayPal products, prices, checkout terms, invoices,
subscriptions, point balances/grants, provider funding allocations, account
ownership, hold/waiver/settlement semantics, saved jobs, library models, original
assets, or production databases. Do not remove cost/rate/authentication guards,
raise provider limits, forge funding, refund uncertain liability, or weaken
validation to make a request appear successful. Never expose credentials, cookies,
receipts, prompts, private job identifiers or raw provider logs in public output.
Do not redesign the UI, migrate authentication, add Dots dependencies or new plans.
Do not force-push main, reset historical trees, or enable automatic paid retries.

## Investigation and implementation

1. Pin current main and the actually deployed Cloudflare version. Inventory all
   tracked components and review recent generator/deployment PRs and logs. Report
   examined and unexamined areas separately. Verify the Oracle revision through
   an authorized read-only status interface; GitHub source is not host evidence.
2. Trace the real path from Shop/Game Lab and reference image parsing through
   quote, explicit points-policy acknowledgement, preparation, reservation,
   signed receipt, Oracle dispatch, Astra planning, Blender construction/export,
   status recovery, original artifact retrieval, cloud library and preview.
   Distinguish direct Blueprint primitives from detailed Oracle generation.
3. Reproduce at least one defect before changing code. Identify the first failing
   stage and exact frontend/Worker/Oracle contract. Rule out stale assets,
   uninstalled runtime packages, expired approval, image/body limits, mismatched
   job IDs/signatures, failed assessments, status timeouts and missing artifacts.
   Available customer points alone do not prove either a billing defect or API
   capacity. Do not invent the user's current balance or a regression author.
4. Compare #242's scene_json/initial_edit schema, planner prompt, validator,
   installed helpers and receipts as one versioned contract. A valid plan must
   contain real component geometry; an initial edit must run before assessment.
   Do not replace an empty plan with a hardcoded model or force acceptance.
5. Implement the smallest compatible patch and failing-before/passing-after
   regressions. Preserve exact-once dispatch/settlement and recovery of the SAME
   request across timeout, refresh, relogin, double click and cancelled polling.
   Stale jobs must not overwrite a new model. A successful model needs a valid
   downloadable original GLB, not just an HTTP 200 or a blueprint JSON.
6. Verify the existing portal building, MCC comparison and gallery/asset hashes.
   Preserve GAME/MAKE labels and provenance; do not copy unlicensed assets.

## Test and release gates

Run `npm ci`, `npm run verify`, foundation assembly and `npm run deploy:check`.
Run relevant Python construction/installer/contract tests and the real Blender
fixture where applicable. Do not delete tests, weaken assertions or silently
skip a failure. Keep fixtures, public smoke, authenticated checks and LIVE
provider tests as separate evidence categories. Respect recorded browser/access
blocks; hosted allowed CI is not proof of a physical Android device test.

An authenticated paid end-to-end test requires a NEW explicit owner-approved
budget and one request ID. Ask before spending. The prior USD 1.75 cap is a
historical contract, NOT fresh authorization. Never replay an old one-off grant,
waiver, job or approved workflow to buy another test. Inspect read-only first.

Before release, review every push-triggered workflow and the current exact-parent
preservation manifest. Do not bypass an installation/maintenance safety gate.
Back up source/configuration without exporting secrets. Deploy through the
reviewed mechanism only after the correct runtime is installed, exact-head CI
passes and end-to-end acceptance is verified. Preserve current variables,
secrets, original models and all financial state. Verify release SHA, traffic,
public asset bytes and clean-session behavior. Roll back only the new compatible
code/config change if smoke fails, never the live ledger or original artifacts.

Update `docs/CONTEST_STATUS.md` with actual evidence. Return root cause,
reproduction, changed paths, before/after tests, current runtime/deployment
versions, artifact integrity and a GO/NO-GO decision. UNKNOWN stays UNKNOWN.
A comment requesting Codex work is not proof that Codex accepted or finished it.
