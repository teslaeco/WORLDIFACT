# P0 recovery validation — 12 October 2026

**NO-GO for production.** Draft [PR #274](https://github.com/teslaeco/WORLDIFACT/pull/274)
contains tested Worker/library repairs and a prospective durable Oracle protocol.
Oracle production durable ingress and the cause of
the original missing requests remain unverified. No merge, deployment, VM change,
paid generation, refund, secret change or customer-file operation was performed.

## Confirmed defects and repairs

1. A successful Oracle HTTP response with malformed JSON, an interrupted body,
   HTML or an oversized body raised a client-input error instead of reconciling
   uncertain acceptance. The new regressions failed before the fix (415 instead
   of 202). `server/studio.ts` now checks the same original UUID with one bounded
   status GET; it never repeats the submission POST.
2. Lost-ACK recovery ignored a completed Oracle response and returned pending.
   A regression failed before the fix (pending instead of succeeded). Recovery
   now uses the ordinary completion, artifact and accounting gates. A corrupt GLB
   remains failed; a missing/unavailable row remains uncertain. No refund or
   zero-cost inference was added. A confirmed terminal result uses the existing
   settlement logic, exactly as the normal signed status GET does.
3. The saved account gallery exposed only GLB although the authenticated backend
   already supported original FBX, BLEND and texture ZIP exports. The selected
   account preview now offers those originals. Downloads use account-bound
   tickets, bounded streams and format checks. An expired ticket can be renewed
   once for the same owned model and format; unavailable exports stay unavailable.
   This does not regenerate, convert or overwrite customer artifacts.
4. Two maintenance tests compared the frozen September/October maintenance grant
   against later development files. Main therefore produced 102/104 passing
   Python tests. Both approved blobs were retrieved from immutable commit
   `5e375f0f7d6f42d8c4d8944fa024bfb474143c04` and verified independently:

   | Original file | Approved SHA-256 |
   | --- | --- |
   | `oracle_construction_launch.py` | `c87d9826480173dead7c175db75f0d4f143c8f8bc63fea753cc84ebc6e1e2f57` |
   | `construction_payload.py` | `475e8251a2255775889d00d0611bb8954044cfd7f2dfba27c6735403408c35b8` |

   Tests now consume checked-in historical `.source` fixtures and verify their
   hashes before use. Tampered, missing, unknown and symlinked inputs fail.
   The dispatcher, forced SSH command, production pins, release workflow and
   installation grants are unchanged. These tests do not authorize installing
   the historical package over the current VM.

The branch also retains the earlier fix that finds the exact completed signed
model independently of its position in a 64-row UUID-sorted library page, and
the native Chromium fixture that waits for a real terminal test result.

The newly supplied Cloud Shell screenshot matches the exact current server
SHA-256 `3ca9da9a246c406ced7f1183b2e6e85f95d1ce733f0ef12af652c5aaf5812227`
and six other reconstructed public runtime files. Its startup SQL fails every
nonterminal row, including never-started queued jobs. A failing-before test
executes that exact SQL; the candidate preserves queued rows and never
re-executes interrupted processing. This is a confirmed deployed-code defect,
not evidence that it caused all 74 historical failures or an absent UUID.

The exact server creates input files before committing its jobs row. Its
replacement-only JSON writer has no explicit fsync. A new staged-inbox
candidate commits the original immutable body before funding, then records
a once-only authenticated START. Local file/queue preparation is idempotent,
fsynced, serialized and bounded; provider execution is never retried after an
ambiguous result. Worker negotiates this only when the separately attested
Oracle runtime advertises the exact revision; staging failure cannot fall
back to a paid POST. No installer or production attestation is claimed.

## Validation performed in this cloud environment

| Check | Result and boundary |
| --- | --- |
| `npm run verify` | PASS after the staged-protocol changes: lint, TypeScript, 2,290/2,290 Node tests, real local HTTP smoke and full production build; zero failed/skipped tests. Existing lint/chunk warnings remain. |
| Native Chromium | Both inert native transport/storage scenarios pass inside the full suite. No production browser preview or Android device test was performed. |
| `tools/oracle_maintenance` Python discovery | 107/107 PASS, including the two repaired provenance assertions and three new fixture checks. |
| `tests/oracle-maintenance.test.mjs` | 18/18 PASS; included in the full Node total. |
| `tools/model_execution/test_studio_execution.py` | 7/7 PASS: immutable model/mode and guarded Responses payload/usage contracts; mocked API only. |
| `tools/oracle_diagnostics` Python discovery | 3/3 PASS: read-only SQLite classification and privacy fixtures. |
| `tools/oracle_admission` Python discovery | 30/30 PASS: actual observed handler/SQLite, process death, busy/full, immutable owner/body/model, four reference byte preservation, bounded local preparation, restart regression, probe privacy and package integrity. Readiness and ledger binding are inert fixtures. |
| Library browser/transport suite | 29/29 PASS, including original exports, expired tickets, invalid formats and logout while downloading; included in Node total. |
| `npm run foundations:build` | PASS: pinned Chess/Terra sources assembled with 105 hashed entry/assets. |
| `npm run deploy:check` | PASS after foundation assembly; Wrangler exited in dry-run mode without publishing. |
| Read-only production smoke | PASS: `/`, `/shop`, `/lab`, `/api/health` and `/api/studio/status` returned 200 with expected MIME types at 20:56 UTC; no account or generation request. |

`studio-admission-native.test.mjs` covers Astra/Sol/Luna × Standard/Fast and
four-photo dispatch using a real workerd runtime and mocked external services.
`studio-recovery-native.test.mjs` adds actual SQLite-backed Durable Objects over
four complete workerd disposal/recreation cycles: concurrent duplicate requests
from two accounts, dropped/malformed ACK, late completion, refreshed library,
all four original formats, account isolation, Oracle absence and HTTP 429.
Every original UUID has at most one POST; full persisted account snapshots remain
unchanged across restart and repeated completed reads. The BLEND fixture is an
inert signature fixture, not evidence of a real Blender render.

Existing tests cover 260 library records across five pages with 68 completed
models, signed off-page lookup, provider timeouts, browser reload/reconnect and
ten sequential mocked admissions. Worker persistence is demonstrated locally;
The staged-protocol continuation also runs the same native recovery/library test,
including four restarts, through STAGE/START. Five new Worker tests check ordering,
twelve independent six-model/mode selections, concurrency, 429, timeout and lost
ACK without repeat START or changed holds. Local real SQLite busy/full and abrupt
process death pass. **Live Oracle staged acceptance, VM reboot, paid provider
acceptance and production account-library recovery are not demonstrated here.**

## Live observations and audit scope

- Enumerated all 263 pull requests returned by GitHub through #274, focusing on
  #24/#31/#47/#127/#153/#164/#169/#186/#208/#231/#245/#251/#254/#263–#274.
  Reviewed main `d70adf1c627c9bd5721b6a32e6c020fb3ae59869`, open recovery PRs,
  incident #272 comments, recent CI and release workflows. The requested reference
  `493ec7a2088d65f05474d111009d152f49632a6d` introduced admission diagnostics;
  it is not itself proof of reliable Oracle persistence. Later useful image,
  funding, model-selection and recovery fixes were retained.
- Main's latest successful publication is
  [run 38246794816](https://github.com/teslaeco/WORLDIFACT/actions/runs/38246794816).
  No new version was deployed by this task. The current Cloudflare version UUID
  was not independently retrieved; GitHub log-download destinations were blocked
  by the environment proxy.
- Dispatched the existing main-only, authenticated GET-only Oracle guard check:
  [run 38307117617](https://github.com/teslaeco/WORLDIFACT/actions/runs/38307117617)
  **succeeded** at main `d70adf1`. It reads `/v1/health` with existing GitHub
  secrets; no model/provider request or VM mutation occurs. Public
  `/api/studio/status` also advertises connector READY and all six combinations.
  Neither check proves durable job acceptance or live quality of each model.
- Reconstructed all 15 files in the existing immutable model runtime manifest
  from pinned public ancestry, including transport commit
  `496b8c9f2120346993720357c3f920a4e3e9f2ae`. Seven hashes in the owner's new
  Cloud Shell screenshot match: server, runner, model selection, construction
  payload, runtime controller, phase controller and photo input. The screenshot
  also confirms SQLite quick_check, both active services and 43.58 GiB free.
  The other installed files and receipt-chain consistency still need checking;
  matching seven samples does not attest the entire installation.
- This environment has no connected Cloud Shell/OCI profile or unrestricted SSH
  channel. GitHub denies secret-metadata listing (403). Existing maintenance SSH
  permits only the fixed dispatcher, not arbitrary SQLite/source commands. Its
  main-only workflow also depends on the still-unfixed tests on main. Do not
  weaken the forced command or merge prematurely to acquire diagnostic access.
- The owner's earlier SQLite report remains historical evidence: 167 rows,
  92 succeeded, 74 failed, one cancelled; 17 rate/budget, 11 Blender/render,
  four provider, four timeout, two validation and 36 unclassified failures.
  These keyword categories do not establish root causes. Absent requests are
  outside this denominator; 74 failed rows do not mean 74 missing Oracle jobs.

## Release scope, rollback and remaining gates

The runtime delta is Worker ACK recovery, negotiated STAGE/START and account-gallery
lookup/downloads. `tools/oracle_admission` contains an uninstalled Oracle candidate
and an integrity-pinned operator probe; see its README for exact boundaries.
No changes to Stripe/subscriptions, account permissions, pricing/point rules,
budget implementation, secrets, production storage, customer files or installed
Oracle runtime occurred. The candidate proposes a separate private admission
SQLite database. Fixtures touch only synthetic/local state. Production integrity
pins and protected `.github/workflows/ci.yml` remain intact.

1. Obtain an existing authorized VM diagnostic channel and correlate one original
   signed missing receipt with Worker dispatch claim, Oracle ingress/committed
   row, provider receipt and saved artifacts. Preserve IDs and unresolved holds.
2. Complete full installed-source/receipt authentication. The staged-inbox repair
   and local crash/busy/full/tunnel tests now exist. A reviewed installer preserving
   the genuine native gates, receipt rebinding, idle fence and rollback remains
   unfinished; current historical grants cannot install these new bytes. Prove
   acceptance/restart on the actual VM before release. Never
   replay a paid request whose outcome is unknown.
3. Verify real account-library recovery and original files under the correct
   account without initiating generation. No real account session was supplied
   to this environment. Separate paid live acceptance needs new cost approval.
4. Require green hosted checks on the final PR commit. Historical green CI does
   not apply to newly pushed commits; the PR records the current check results.
5. Keep the PR draft and unmerged. Main push triggers production publication.
   The general release route can synchronize secrets/payment configuration;
   this task does not arm a new preserving-release marker. Review an exact
   preserving release scope before any eventual owner-approved release.
6. Before release, capture the actual current Cloudflare version and retain it
   as rollback. Revert only the scoped Worker/UI source or restore that reviewed
   Worker version with configuration preserved. Do not reset Durable Objects,
   Oracle rows, holds, budgets or model files; do not retry uncertain jobs during
   rollback. A future Oracle schema change requires its own reviewed rollback.

Until those gates pass, production durability and billing safety remain UNKNOWN:
**NO-GO. Local and hosted mock success cannot close incident #272.**
