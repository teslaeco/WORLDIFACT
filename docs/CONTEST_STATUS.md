# WORLDIFACT — current verified state, 10 October 2026

## Latest milestone: Shop UI merged and deployed

| Item | Observed result |
| --- | --- |
| Application source | `6bd6715e431e75abd1a401d43b38e4d33a147eac` |
| Main / merged PR | `c6b89b42010f24075a2340cbe3d7fa47a5ddc2a9`, PR #245 |
| Identical verified source tree | `4b4d22a22307d1b016aa2b78beb9e118933b8200` |
| Production version | `af724878-448c-42c4-83a3-3ca2a89ae91d` |
| Public origin | https://worldifact.xodobrox.workers.dev |
| Shop route | https://worldifact.xodobrox.workers.dev/shop |
| Verification time | `2026-10-10T12:06:01.768Z` |
| Public checks | 12 HTML routes, 430 exact built files, exclusive 100% traffic |
| Customer point adjustment / held-point release | NOT PERFORMED |
| Coupon registration / activation | NOT PERFORMED; prepared codes remain INACTIVE |
| New paid generation / authenticated Shop acceptance | NOT PERFORMED in this UI release |

[Production release run 38050564952](https://github.com/teslaeco/WORLDIFACT/actions/runs/38050564952)
passed exact source/main tree checks, all six source-review checks, full application
verification, pinned foundations, Worker dry-run, previous exclusive version
verification, publication and exact public bytes/traffic checks. Its artifact
`11669562062` has SHA256
`4f3999f70dfa940734e1336e592d75b7f4b046ac240ae44fb199399853637456`.
The downloaded receipt was independently hash-checked and parsed by the assistant.

The previous version `4278815f-5576-49f9-a74e-e3348302b412` and its source
`3e86e009fd400f2185de67b1ecdd92761bc863ab` were verified before publication and
retained. All remote variables, secrets, original bindings/migrations, billing
configuration, account ledgers, original model bytes and Oracle runtime were
preserved. No key synchronization, Oracle installation or financial operation
was executed. The completed one-use publication entrypoint is retired by this
documentation-only branch commit; this cleanup does not redeploy or change main.

## Actual correction and CI evidence

The failed staging run `38047078893` had 2071 of 2072 tests passing. Its failure
incorrectly compared the edited current ShopPage with a historical waiver-release
blob. The fix separates historical release integrity from current regression
coverage: every original payload file is captured independently from immutable
release `38e7048c4176fac4c9808203af5bd58a1ae7d10e`, then checked against the unchanged
manifest. Added tests reject changed/missing/extra historical bytes and incorrect
provenance, and prove that the fixture cannot authorize a future release. No
historical hash or safety assertion was weakened, skipped or rewritten.

The actual UI source was applied and verified in
[38049523912](https://github.com/teslaeco/WORLDIFACT/actions/runs/38049523912), then
advanced with an expected-head lease. All six exact-head PR workflows succeeded
before the owner-authorized squash merge, including
[application 38049840429](https://github.com/teslaeco/WORLDIFACT/actions/runs/38049840429)
and [native Blender 38049840514](https://github.com/teslaeco/WORLDIFACT/actions/runs/38049840514).
Warnings and dependency audit findings are not a clean security certification.

Compared with the preceding production source, executable changes are limited to
nine UI files. An unchanged submitted composer clears only after its own confirmed
terminal result; newer draft text/photos, previous models and request evidence
survive. Explicit Clear also handles photos with empty text. Available, held and
total points are shown separately from verified account data. Refreshing a balance
does not generate, purchase or refund. The coupon input truthfully remains inactive.

## Remaining blockers — do not claim DONE

- Customer-held points and any separately requested account adjustment still need
  actual authorized authenticated accounting evidence. Do not wipe purchased
  credits, repeat an older incident waiver, replay invoices or reset provider cost
  history. Prior denied financial operations must not be retried through another
  identity, workflow, credential or database path.
- The existing private promotional-code batch is not registered. Random strings
  and an encrypted owner download are not working redemption. Implement and test
  authoritative authenticated redemption, global exactly-once claims/account grants
  and approved bounded funding before activation/readback. No plaintext codes or
  privileged credentials may enter public source, logs or artifacts.
- A new signed-in end-to-end generation, same-user library save, download and
  physical Android acceptance were not performed here. Keep existing live engine
  evidence separate from customer/browser acceptance and respect recorded browser
  restrictions. No consumed paid test may be automatically replayed.
- The historical automatic main publication workflow refused this later release
  before production credential use: [38050471179](https://github.com/teslaeco/WORLDIFACT/actions/runs/38050471179).
  Both historical deployment jobs were skipped. This run is NOT green. The new
  owner-approved exact-source preserving workflow above performed the actual
  publication. Do not rerun the old workflow or replace its old authority with a
  broad whitelist; a normal future release pipeline needs a separately reviewed
  compatibility update preserving financial state and current-source checks.

Decision: **GO for the completed UI release. NO-GO for declaring the complete
account/coupon/generation recovery finished.**

## Codex handoff and preserved historical record

The requested implementation/release contract is recorded in
[PR #245 comment 6097236809](https://github.com/teslaeco/WORLDIFACT/pull/245#issuecomment-6097236809).
A fuller private handoff and encrypted INACTIVE code batch were prepared for the
owner. A posted task/comment does not prove an external Codex agent executed it.
PR #245 is merged; do not reopen or merge it again. Re-read current main before
starting any remaining backend work.

The complete previous CONTEST_STATUS file is preserved byte-for-byte in
[the historical record](history/CONTEST_STATUS_before_20261010T120601Z.md), original
Git blob `ace6eb8c04904b3abba0a4d938cdd88dfd0fdeab`. It contains prior contest,
production, runtime, model, financial and tool-denial evidence; nothing was erased.
Do not treat old dated approvals, source pins or successful tests as fresh authority.
