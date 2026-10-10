# 10 October 2026 — compact subscriptions and code redemption

Owner requested a compact panel with a code tab and a success burst. Removed the
marketing essay and repeated credit/plan cards. Three subscription rows retain
existing prices and checkout guards. Top-ups and billing recovery remain under
collapsed details. Code access stays account-bound and verified server-side;
only a newly confirmed grant triggers the brief visual celebration. Duplicate,
failed and late responses do not celebrate. Reduced-motion users see the status.
The primary counters now display validated available points, with reservations
kept under details on the credits page. The supplied screenshot shows 190
available plus 1,000 held, not 199. No 9-point grant, hold deletion, waiver replay
or balance adjustment is included. Existing requests need reconciliation before
any destructive settlement; no financial operation is disguised as a UI change.

The prior private batch activation PASSED in run 38074125029, version
a5f53530-cbcd-4c76-87ba-c624e412751f, ten single-use account-bound codes, 1,000
points each, expiry 2026-11-09T17:52:35.130Z. Values stay private. This release
uses the existing source-only preserving transport and an exact-parent/path
scope; it preserves all runtime secrets including active promotion definitions,
Stripe configuration, balances, provider budgets and Oracle. No provider call.
Targeted UI tests pass; hosted full verification and production publication
remain pending. Browser localhost checks remain blocked by the recorded policy.
Rollback is a reviewed source-only release preserving all remote configuration.

# 10 October 2026 — approved preserving publication after PR #246

The owner approved merge and deployment. PR #246 merged as
`1694538491240d7817715e786242b6a9100c6546`; its five PR workflows passed,
including 2,097 tests. Main verification run 38068229423 also passed.
Automatic publication 38068229473 incorrectly selected the legacy unscoped
transport. The owner cancelled it during npm verification; all secret,
billing synchronization and deployment steps were SKIPPED. No production
mutation from that run is claimed.

This follow-up fixes the selector CLI to fail closed for unscoped publication.
It adds an exact-parent, exact-path, single-parent source-only release envelope.
The existing `aiShopUi` transport flag is reused solely for its no-vars config,
`--keep-vars`, skipped secret/payment synchronization and GET-only asset checks;
it does not imply the payload is UI-only or grant account permissions.
The preflight adds a separately approved exact source-release scope and updates its
script checksum. The historical financial waiver manifest and validation remain
unchanged; the new scope explicitly returns failedHoldWaiver=false.
Bindings/migrations stay equal to the checked-in configuration used by the
previous preserving release; current remote configuration still needs independent
readback. No runtime source, account allocation or code registration changes.

Merge this follow-up by SQUASH against the exact approved parent. Unexpected
paths, parent changes, marker reuse or symlinks stop release before credentials.
ADMIN and promotions remain unconfigured/inactive; paid tests need separate approval.
Publication receipt and final CI will be recorded in the PR after completion.

# 10 October 2026 — owner entitlement and tester redemption review candidate

Current audited main is `c6b89b42010f24075a2340cbe3d7fa47a5ddc2a9`; PR #245 is merged.
Its recorded production version is `af724878-448c-42c4-83a3-3ca2a89ae91d`, not yet
independently reread in the Cloudflare dashboard during this task. Earlier entries
below that describe #245 release work as pending are historical, not current state.

The new review branch introduces disabled-by-default, server-UUID-bound ADMIN
funding independent of Stripe membership and customer point balances. It preserves
runtime/global cost guards, isolated job fences, exact-once dispatch and same-user
model recovery. Tester-code registration remains absent; no private code or live
account identifier is committed. The live Stripe promotion-code list was empty.
Stripe discount checkout is still disabled and its full-price invoice validator
must be addressed separately before any discount activation.

See `docs/ADMIN_ACCESS_REVIEW_20261010.md` for root cause, implemented scope,
configuration contract, cost-evidence limits, rollback and activation gates.
Public read-only evidence reports the legacy STANDARD route ready, not a successful
signed-in generation. No paid test, production configuration change, point grant,
code activation, merge or deployment occurred. Cloudflare login failed after Google
confirmation; Oracle console was unavailable in this browser. These are audit
access limitations, not proof the generator service is offline.

GO: source review. NO-GO: production activation/full acceptance. Exact provider
costs remain unknown; persisted Oracle liability bounds must not be called invoices.

---

# 10 October 2026 — historical test coupling repaired; release/account gates remain separate

The UI staging run 38047078893 failed at the immutable historical payload check:
2071 of 2072 tests passed, but the changed ShopPage was compared with the original
waiver release's blob. This correction preserves that manifest, every historical
blob, the production selector and the entire Cloudflare workflow. The test now
checks an independently captured payload from immutable commit 38e7048c against
the original manifest, including the original test's own bytes. Added regressions
reject changed/missing historical sources and prove that a later Shop edit gains
no historical deployment authority. No assertion is skipped or hash repinned.

The existing composer/point-display UI patch is applied, not merely left as a
staging script. Its original requests, next drafts and saved models are retained.
Coupon redemption remains INACTIVE. No customer balance, held-point waiver,
provider funding, billing, coupon registration, secret or live model request is
modified here. Prior denied financial operations must not be retried indirectly.
Full candidate CI, production publication, authenticated account correction and
LIVE generation remain distinct gates and require their own observed evidence.

## Earlier evidence (preserved)

# WORLDIFACT — supervised STANDARD restored and deployed; real MCC model verified

Current evidence: 10 October 2026, 00:05:13 UTC.

## 10 October 2026 — UI-only recovery and honest point/coupon status

The owner requested automatic clearing of failed-generation forms, a points and
promo-code interface, and resolution of held points. This change implements only
the client-interface part. Previously denied point grants, coupon registration
and credit-ledger changes are not retried through another tool or workflow.
No new secret, point reset, waiver replay, coupon activation, account mutation,
API model request or payment is part of this patch. The historical screenshot
of a recorded waiver is not evidence that the current holds were released.

The existing staged composer patch is completed with all previous protections:
only an unchanged submitted draft clears on confirmed completion; newer text and
references survive a late old result. The saved receipt, original model, pending
review and server selection are preserved. The old failure is a collapsed history
item, not the state of a new request. Held-point messages show the validated
available, held and total figures and link to the existing read-only review.

The subscription page now has a points/review section and a clearly inactive
promo-code disclosure. Its disabled input cannot submit, store or redeem a code;
it explicitly says that the prepared codes cannot add points. No raw coupon or
account identifier is added to source, configuration or public artifacts. Account
switches and refreshes must not display a stale amount as confirmed.

Local verification uses the actual component and coordinator with synthetic HTTP
and React lifecycle adapters, not a browser or paid provider. All 104 Shop draft
lifecycle/unit cases and the point-display/membership cases pass after updating
the old waiver fixture to type a new prompt before expecting Generate enabled.
That fixture still checks the original waiver/readback and preserved history;
no financial assertion was removed. Exact-head full CI and production release
are separate checkpoints and will be recorded after completion.

Customer held points are NOT zeroed, new points are NOT granted, and the prepared
promo codes remain NOT ACTIVATED. The successful engine-only MCC test below does
not establish signed-in account generation, current available balance or coupons.

## Verified release and real model

The new ordinary legacy-priced STANDARD request route is deployed. Source
`3e86e009fd400f2185de67b1ecdd92761bc863ab` was published by
[run 38007263065](https://github.com/teslaeco/WORLDIFACT/actions/runs/38007263065)
as Cloudflare version `4278815f-5576-49f9-a74e-e3348302b412`. The release verified
12 HTML routes, 428 exact built assets and exclusive 100% traffic. All six PR
workflows passed on this exact source, including application run 38006428572
and construction/native-Blender run 38006428584. The release repeated its full
verification/build/foundation/dry-run checks before publication.

Before that publication, one newly authorized real engineering MCC job in
[run 38004410388](https://github.com/teslaeco/WORLDIFACT/actions/runs/38004410388)
completed as `NEW_REVIEWED_GLB_VERIFIED` on the original supervised Codex/Blender
route. The deployed adapter's ordinary request now matches that successful
request's independently recorded wire checksum exactly. Host structural and
rendered-image acceptance passed; two downloads returned identical GLB bytes.
The local header/size/hash check also passed. This was a real provider response,
not a fixture-only model or an original catalogue model reused as new evidence.

- Model: 886,288 bytes; 63 meshes, 223 nodes, 7 materials and 2 embedded images.
- Model SHA-256: `fecefbf591d37f65f12aa8bcf44ad56efbfc58aa8bd0010356091adb7f9ba6d0`.
- Live-test artifact SHA-256: `a510c1f34c100cdf8cdb0b690034e85f94f42c0de8cee541d05eb4fad474996d`.
- Release artifact SHA-256: `b42983f7aceff72f725f58b0936af9255b4cff98a9067a32e2732eb22e9b7768`.

The previous exclusive version `7d88f9d7-0c32-413f-bcae-b6d0776b54f3` is retained
in the deployment receipt for recovery. Main remains
`38e7048c4176fac4c9808203af5bd58a1ae7d10e`; this was a reviewed branch release,
not a main merge or reset. A future generic main publication must not overwrite
this deployed correction or the existing remote financial configuration.

## Preserved scope and remaining limitations

The preserving release omitted declared variables and used `--keep-vars`. It did
not synchronize secrets, change bindings/migrations, install Oracle code, change
prices/subscriptions/points/old holds/funding, or alter saved jobs and original
models. The paid engineering test had its existing USD 1.75 cap, made one job
submission and no automatic resubmission. Actual invoiced API cost is UNKNOWN.
Its permanent consumed approval and result remain; no repeat is authorized by
this document. The completed release entrypoint is retired after its evidence
is recorded, without changing deployed code or the retained recovery receipt.

This restoration applies to ordinary unpriced STANDARD requests. Explicitly
tier-priced jobs, specialized photo-cabinet/character profiles and FAST retain
their previous request forms. The newer typed controller's particular token-count
failure was not diagnosed or fixed by increasing limits: the already-present
supervised path is selected before dispatch instead. Authentication, the original
cost guard, reference data, completion instructions and actual-render review
remain. Existing jobs are not re-routed after a paid failure.

Signed-in browser flow, customer-owned library auto-save and physical Android
acceptance have NOT been verified by the engineering test. Old held points were
not released. This standard digital MCC asset is not a manufacturing/electrical
safety approval or proof of historical photo-reconstruction quality. A single
successful request is not a guarantee that every prompt or every supported
profile is error-free. Full clean-session account acceptance remains separate.

## Earlier source and investigation milestones (historical)

All statuses, pending-release notes and approvals below describe their recorded
past checkpoint, not the current deployment or permission for another charge.

Current milestone: 10 October 2026 (source change after the 9 October UTC test).
**GO for exact-head verification and a configuration-preserving release of the
already tested existing route. No universal error-free or signed-in-account claim.**

## A real completed model, not a scripted provider fixture

The owner renewed authorization for one bounded paid engineering test. The
comparison run [38004410388](https://github.com/teslaeco/WORLDIFACT/actions/runs/38004410388)
used the original authenticated Oracle worker and the same MCC description,
prices, completion guidance and USD 1.75 maximum. Only the fresh request's
existing STANDARD selector differed: the original supervised CLI alias was
chosen before dispatch. This was not a second submission of the failed job or a
fallback after a provider error. The permanent one-use approval remains consumed.
No additional paid model is authorized by this evidence document.

That live job finished with `NEW_REVIEWED_GLB_VERIFIED`, not a candidate-only
outcome. Host structural acceptance and rendered review passed. Two separate
reads returned exactly the same original model. Downloaded GLB v2 bytes were
independently checked locally:

- Size: 886,288 bytes; 63 meshes, 223 nodes, 7 materials, 2 embedded images.
- 2,996 unique triangles; 4,916 rendered triangles; 18 substantial meshes.
- SHA-256: `fecefbf591d37f65f12aa8bcf44ad56efbfc58aa8bd0010356091adb7f9ba6d0`.
- Artifact 11650961115 SHA-256: `a510c1f34c100cdf8cdb0b690034e85f94f42c0de8cee541d05eb4fad474996d`.

This is an actual ordinary digital MCC game model, not proof of high-resolution
photo reconstruction, manufacturing fitness or parity with every historical
MCC/Meshy asset. Actual invoiced API cost is UNKNOWN; USD 1.75 is a ceiling, not
a measured charge. Customer points, holds, subscriptions and owned-library rows
were not changed by the engineering test. The signed-in Shop account flow and
library auto-save are NOT established by this original-worker test.

## Minimal compatible restoration

`oracleStudioPayload` now chooses that exact successful request form for new
ordinary unpriced STANDARD requests. The wire SHA-256 of the accepted MCC request
is pinned in a regression; it is not derived from the new implementation.
The entire completion recipe, actual-render inspection, finish_model acceptance,
original prompt and references remain. Only the existing route header differs.
The shared STANDARD completion/context policy and global USD 1.75 guard remain
active on the original supervised executor. The newer typed controller's separate
phase-admission scheduling is not asserted to be identical to the CLI policy.

Explicit priced jobs, specialized photo-cabinet/character profiles and FAST keep
their exact previous wire bytes. Canonical input digests and saved-job receipts
are unchanged. Existing job recovery does not resubmit or re-route old jobs.
No Oracle file, verification receipt, API model, rate/time limit, sandbox,
financial policy, account balance, original building/MCC or saved model is changed.
The update is in the Worker adapter; it requires no further Oracle installation.

## Verification and count investigation

The four new route regressions initially gave 1 pass / 3 failures against the
original adapter. After restoration all four pass. Forty-four focused
protocol/profile/manufacturing/one-use tests pass locally with no provider call.
Four affected synthetic wire hashes changed by the single known header
substitution; all seven original canonical input hashes remain unchanged.
Five priced/specialized/FAST wire hashes remain byte-identical.

An independent read of the exact reconstructed Oracle modules verified original
STANDARD profile/context/completion guidance and USD 1.75 cap parity, with the
routing decision different before Gateway creation and no job-state writes.
The public pinned ancestor and MPC2 commit trees were reproduced from tracked
source and verified commit objects, not installed customer data.

The count-only native fixture probe in run
[38002270919](https://github.com/teslaeco/WORLDIFACT/actions/runs/38002270919)
returned HTTP 200 for all four exact public native requests: box construction
10,280 tokens / inspection 13,582; globe construction 10,280 / inspection 14,494.
Inspection used full text and three real 640x800 rendered images. All counts
were within the existing phase bounds. No generation request was sent by that
probe. These fixtures do NOT establish the precise cause of the earlier typed
MCC count failure. No input limit was raised and no guessed tokenizer fallback
or acceptance bypass was installed.

The three completed probe/comparison workflow entrypoints are retired in this
source commit. Original runs, artifacts, models and consumed approvals remain;
no background paid continuation is configured. Full exact-head application and
native CI plus a preserve-configuration Cloudflare release are pending at this
source milestone. The current public version is still
`7d88f9d7-0c32-413f-bcae-b6d0776b54f3` until its replacement is independently read.

## Prior release and typed-path investigation (historical, not current default-route result)

### Prior typed-path result

Current operational evidence: 9 October 2026, 22:45 UTC.
**NO-GO for claiming that production 3D generation is restored.**

The owner explicitly approved the output-scope release and one test within the
existing USD 1.75 cap, including failure. Duplicate chat approval was treated as
one authorization. This current section supersedes earlier installation-pending
or release-pending statements below; the remaining record is historical evidence.

The exact application source `49a02609a3730976ec0744ecf01877d1fbf16859` was
published by run 37999173987 as Cloudflare version
`7d88f9d7-0c32-413f-bcae-b6d0776b54f3`. Its 12 HTML routes, 428 exact built assets
and exclusive 100% traffic were verified at 22:28:38 UTC. The dedicated approved
branch workflow omitted declared variables, used `--keep-vars`, retained original
bindings/migrations and did not synchronize credentials or financial settings.
Main remains `38e7048c4176fac4c9808203af5bd58a1ae7d10e`; no generic main release
was invoked. The previous deployment ID is retained in the release artifact.

The new public synthetic MCC test in run 37999751697 submitted exactly one job
using the deployed Shop request adapter and the original authenticated Oracle.
It returned `MODEL_FAILED`, not a deliverable. No customer point, hold, billing or
library row was changed by this engineering test. It is not a signed-in browser
or owned-library test. Its permanent approval tag is consumed; do not replay it,
delete the tag/job, or run another paid attempt under this authorization. The
maximum authorized provider cost was USD 1.75; actual invoiced cost is UNKNOWN.

GET-only reads of this same synthetic test in runs 38000622694 and 38000867858
confirmed a different boundary from the earlier empty-plan user report:

- One Blender build reached candidate revision 1 with zero recorded tool failures.
- Recorded total time: 227.53 seconds; AI: 113.44; Blender: 114.08.
- The host recorded two request attempts, 11,261 input and 6,323 output tokens,
  with `unknown_usage=false`. These counts are not an invoice or proof that both
  attempts reached a billable generation endpoint.
- Terminal detail: `construction_response_unconfirmed`; guard:
  `WORLDIFACT_ASTRA_COST_GUARD`, reason `TOKEN_COUNT_UNAVAILABLE`, stage `count`.
- Final assessment was not completed and no accepted final model was returned.

The current typed Gateway wraps both a failed input-token-count call and a
counted context/deadline/cancellation rejection into TOKEN_COUNT_UNAVAILABLE.
Therefore this observation does NOT establish exhausted USD funds, a specific
HTTP error, a too-large context, a 900-second deadline, or a provider outage.
Do not remove the cost guard, fabricate an acceptance, relabel the preserved
candidate as completed, or buy another trial to replace missing diagnostic data.
The source review and retained same-job evidence, not another health check, are
now the basis for the next correction. Source/CI success remains separate from
new GLB, preview, download and account-library acceptance.

Evidence artifact SHA-256 values:
- Deployment: `6e716235c3355a53ac82ad758251b91bfb76b966146d66a2d87591a81a9e5490`
- One-model report: `33be9b18d00de47d63a4fc716aa14d129c770391f7269d68186ea34ce6ecd431`
- Same-job stage report: `80ffa88d6a2b6f1ad60c07ac9c38909b6a95fa842562b764bae7a679f95c37fa`
- Count-guard reason: `2f8b62b6bfe0160adb296f831b192e29dfc85f7d46cf62c077dd1f9c7e901e2d`

The completed one-off release/test/read workflow entrypoints are retired in the
same evidence commit; their scripts, tests, runs, artifacts and consumed approval
remain available. No production behavior is changed by this documentation cleanup.

## Historical ledger (earlier claims are scoped to their recorded milestones)

## LOCAL REVIEW — paid membership points admission (7 October 2026)

The requested policy makes available customer points the account-level funding
condition for active paid Creator, Pro and Studio plans, including Creator at
$29.99. A second per-account legacy API reserve no longer determines eligibility
for new paid-membership jobs. Provider availability, billing review, verified
membership, account/rate protection, points/holds, per-job provider ceilings and
explicit pricing contracts remain mandatory. Free, support and test pools retain
their existing bounded rules. Global operator controls are not increased.

New jobs negotiate a versioned Worker-to-ledger route and persist in a separate
paid-points namespace. A terminal zero-cost legacy collision fence prevents an
older caller from reusing the same request ID. Strict pair validation refuses
orphaned, malformed or unknown modes. Existing jobs, receipts, held-point rules,
upfront Blueprint debit/refund behavior and original recovery paths retain their
historical semantics. Paid-membership jobs record conservative provider liability
without debiting or releasing the old reserve. They do not create credit grants,
negative legacy reserves or retrospective refunds. Old and new library/current
readers are tested for safe recovery and account ownership.

Client quotes require explicitly negotiated policy and matching server admission;
unknown or incomplete responses fail closed. Paid-membership diagnostics separate
legacy reserve from bounded provider liability, which is not a provider invoice.
No page entry or quote launches a model, recovers funds or retries a paid call.

The owner approved prospective point holds to avoid refund-driven repeated
failed-call exposure. Every new paid attempt holds its full configured point
price before dispatch. Successful delivery charges that price exactly once;
proven no-dispatch or authenticated zero-liability failure releases the hold.
A dispatched failure with positive or unknown cost retains a bounded point hold
pending verified cost/manual review. Generation failure is not itself a refund
or a final point charge. Existing conservative Oracle ceilings are never treated
as actual billed cost. No positive failure charge is finalized without stronger
proof, and no new privileged proof endpoint or provider credentials are added.
The UI must explain this before the request and expose the pending status and
original-request recovery. An immutable upper-bound receipt cannot promise
automatic final resolution; operator review may be required. Available points
exclude outstanding holds, while other sufficiently funded requests remain
possible. This bounds new attempt exposure, not overall company profitability
after fees, taxes, historical costs, chargebacks or infrastructure. No new paid
test is authorized. Earlier unused-reserve recovery is not part of this release
and has not been applied. The retained historical reserve is bookkeeping, not
cash backing; future legacy/ineligible-account routes keep their original rules.
No cross-lifecycle aggregate profitability or cash-solvency guarantee is implied.

Final local validation passes 1,892 runnable tests, lint, TypeScript, real HTTP
smoke, production build and Worker dry-run. Independent financial review passes
45 final accounting/API/native checks and 22 actual old/new-reader compatibility
cases; the release envelope passes 100 current/prior regressions. The known two
local native-browser cases remain enabled for hosted CI and were excluded from
the local aggregate. New submissions explicitly acknowledge the held-points
policy; stale/missing revisions refuse before new holds. New Studio receipts use
a separate HMAC domain, so removing or changing their prefix cannot turn them
into a legacy receipt. Existing legacy/artifact signatures remain compatible. The exact-parent,
72-file release envelope preserves remote variables, secrets and global
operator settings, skips payment/provider probes, and verifies only public
health/static bytes. Exact-head hosted CI and deployment are still separate
gates; no new paid generation is included in verification.

## LOCAL REVIEW — bounded preview for dense generated models (7 October 2026)

The separately approved single Astra test completed through the ordinary Shop
path. Its downloaded original is a valid embedded GLB with two meshes, 53,100
triangles, 151,686 vertices and embedded textures. The software-only preview
rejected its leaf accessor at the 60,000-vertex rendered-geometry limit. The
container, finite positions and indices are valid; this is a preview complexity
mismatch, not evidence of a failed generation or a corrupted model.

This correction is limited to the texture-free software fallback. Separate
bounded source-work limits allow validation of every source position, index and
active transformed instance before any renderer geometry allocation. Existing
16 MiB input, metadata, URI, depth and per-draw safeguards remain. Larger valid
models are represented by a deterministic subset of their actual source
triangles, distributed across visible parts. Rendered geometry remains capped
at 20,000 triangles and 60,000 vertices; small models retain exact geometry.
Full source bounds drive framing and dimension scaling. The UI explicitly labels
sampled software views simplified and untextured. The original GLB, textures,
download, saved model and normal WebGL path are unchanged.

This release contains no financial endpoint, reserve adjustment, generation or
provider request. The prior one-time allocation and its audit are preserved.
Historical unused-reserve recovery, if separately authorized, is a different
action and is not included. Local validation passes all 1,775 runnable tests, lint, TypeScript, real HTTP
smoke, production build and Worker dry-run. Independent review passes all
39 focused geometry/lifecycle/release tests and additional adversarial boundary
probes. The known two local browser restrictions remain respected and those
tests remain enabled in hosted CI. The exact original oak passes offline in
under 60 ms here, without source-byte changes; this is not browser/device timing
or visual-quality evidence. Exact-head hosted checks and verified deployment
remain separate gates.

## LOCAL REVIEW — explicitly approved one-time reserve adjustment (7 October 2026)

Both historical purchase grants were found in the authenticated account ledger.
No invoice replay or refund of unknown historical costs is justified. The owner
separately approved a single $1.12 USD internal API reserve allocation and one
later, manually initiated Astra test, capped at $1.75 USD total API cost and
250 points on success. This change implements only the allocation control;
it does not submit the paid test or claim successful generation.

The dedicated self-account route verifies the existing authenticated cookie,
account-bound live Durable Object, and fixed SHA-256 commitments for the owner,
Stripe customer, two exact unreversed invoice grants and their subscription.
No account selector, administrator reader, credential or environment override is
introduced. Public source and UI contain no actual customer or invoice IDs.
The transaction requires exactly 1,440 points, zero effective held points and
63 cents of existing reserve. It changes only that reserve to 175 cents and
writes one immutable audit with the authorization commitment, timestamp and
original before/after values. A changed baseline, payment binding or corrupt
marker refuses; duplicate application returns the original receipt even after
later spending. Earlier claims, jobs, models and generation limits are preserved.

Page entry and the status button perform GET only. The explicit application
button sends one fixed POST, locks synchronously against double clicks and never
retries an uncertain result. A later explicit status read identifies a committed
application without replenishing it. Account changes and page lifecycle events
clear the old view. The receipt labels its values as historical rather than a
fresh balance. No model, checkout, card charge or subscription is started.

Focused unit and actual SQLite Durable Object tests cover concurrent applications,
atomic rollback after either write, lost acknowledgements, revoked/wrong invoice
bindings, changed baselines, malformed markers and cross-account refusal. UI tests
cover entry, double clicks, uncertainty, stale results and identity changes. The
fresh 15-file exact-parent release envelope preserves deployed variables and
secrets and skips Stripe setup, checkouts, financial probes and Oracle operations.
Local validation passes all 1,759 runnable tests, lint, TypeScript, real HTTP
smoke, production build and Worker dry-run. Independent review passed 32 new
tests plus 60 prior release regressions without a blocking finding. The known
local browser restriction was respected; its two tests remain required in
hosted CI. Publication, full hosted CI, deployment and the manual account action
remain separate evidence gates; no successful paid model is inferred from these tests.

## LOCAL REVIEW — self-account stored purchase evidence (7 October 2026)

This diagnostic extends the existing authenticated funding read with an explicit
`evidence=stored-v1` option. The original no-query response is unchanged. The
same signed-in account, same-origin protections, rate limiter and account-bound
Durable Object remain authoritative; callers cannot supply another account ID.

The read scans at most 64 stored invoice-grant rows, exposing counts and recorded
point totals without listing discovered references. A user may provide at most
two canonical invoice references to distinguish a present record, a missing
record, a reversal/tombstone, and an unreadable or invalid record. Customer and
subscription identifiers are not returned; only linkage booleans are shown.
These records establish stored bookkeeping, not independent Stripe payment
proof, current unused points, API spending or permission to issue a grant.

The existing bounded job scan also groups unknown-amount records by recognized
stored route, model, state, date range and recorded point cost. Missing models
remain unknown. No prompt, job ID, receipt, credential or inferred refundable
amount is exposed. The read does not initialize funding, reconcile a job,
replay an invoice, call Stripe/Oracle or change any customer balance.

The existing standalone funding page opts into this read and offers an optional
invoice-reference form. Both controls issue GET requests only. Responses with
unexpected invoice references are rejected, and leaving/refocusing the page
clears displayed evidence and the invoice input without automatic recovery.
No actual customer or invoice identifiers are embedded in source or tests.

Local validation passes 1,727 runnable tests, including 31 focused endpoint/UI
tests, lint (existing warnings), TypeScript, HTTP/origin smoke, production build
and Worker dry-run packaging. Independent ownership/read-only/privacy review
passed, including malformed-value and maximum-total probes. A narrowly bounded
GET-only fallback preserves the baseline funding view against an older worker;
unavailable evidence never becomes a missing-invoice claim. Native browser tests
remain enabled for hosted CI; the known local browser block was respected.
The fresh exact-parent, 13-file release envelope preserves runtime settings and
skips financial/provider operations. All 101 focused endpoint/UI/release tests
pass; the corrected verifier checks both reviewed Terra hidden metadata files
and retains mandatory deployment receipts. A separate eligibility regression
confirms that funded Creator, Pro and Studio accounts all admit Astra without
a retired monthly quota or new-sale requirement. No plan or price changed.
Publication and exact-head hosted results remain separate gates. This diagnostic
does not remove generation limits or establish that an account has been restored.

## LOCAL REVIEW — verified subscription settlement across plan changes (7 October 2026)

The focused billing repair is based on production `29b6b9af`. Two defects were
independently reproduced: disabled new Astra sales or a missing management
portal discarded already-paid invoices, and delayed paid invoices were ignored
when their historical prices differed from the current plan after an upgrade
or downgrade.

Existing payments now settle independently of checkout availability. Every
invoice still requires a configured known product, exact approved amount and
currency, one non-prorated unit, paid status, matching subscription/customer and
verified account ownership. Invoice grant keys remain idempotent, reversal
tombstones remain authoritative, and current membership is synchronized
separately. Disabled runtime stays disabled. Prices, point costs, provider
funding limits, Oracle behavior and production account data are not modified
by this code publication.

Ten new deterministic regressions cover disabled sales, missing portals,
pending/unpaid upgrades, delayed upgrade/downgrade invoices, cancellations,
stale events, revoked grants, malformed/foreign payments, duplicate delivery,
missing settlement configuration and returned subscription-ID mismatch. The
original production billing source fails seven cases; the repaired source
passes all 38 recovery tests. Tests use synthetic payments and no provider calls.

The reconstructed billing change passes local lint (existing warnings),
TypeScript, 1,701 runnable aggregate tests, real local HTTP/origin smoke,
production build/postbuild and Worker dry-run packaging. The two native
Chromium tests remain required in hosted CI and were not retried through the
previously blocked local browser route. All 98 focused billing/release tests pass, including the preservation envelope.
Exact-head hosted CI remains required; publication is not inferred from local tests.

The fresh release envelope is pinned to the reviewed parent and exact changed
paths. It preserves remote variables and secrets, skips payment configuration
and checkout probes, and uses GET-only health/static verification. It does not
roll back Oracle or reset any account's funding. Existing paid-invoice recovery
is a separate, explicitly authorized account action; publication alone does
not establish or repair a particular customer's missing grant. No customer
identifiers or private billing records are included in the repository.

## REVIEW — compatible MCC-era presentation restoration (6 October 2026)

The owner approved restoring the 29 September presentation from `58e04843`
while retaining current accounting, saved models and Oracle protocol support.
The working base is `9b2a5a9e`. See [the exact scope and compatibility
exceptions](COMPATIBLE_MCC_RESTORATION.md).

The historical Shop form, shared-world defaults and `/lab` / `/builder`
workbench return without replacing the current server or stored account data.
The cloud model library, separate private-world workspace, payment interfaces,
current model bindings and recovery readers remain available. Provider funding
and all existing spending limits stay unchanged. No paid generation is part of
validation. This is not an Oracle runtime or database downgrade.

Publication remains pending the combined-tree checks, independent review and
exact-head GitHub CI. Record deployment and browser evidence only after the
scoped no-financial-operations, preserve-variables release completes.

## LOCAL REVIEW — visible bounded model preview (6 October 2026)

Browsers without WebGL previously showed an unavailable-device message instead
of a model preview. Existing account-loading and owner-change invalidation
remains unchanged.

This local patch reuses the previously reviewed, unpublished 5 October software
preview implementation on deployed Shop base 62f9fa92. WebGL remains the first choice.
When GPU setup, rendering or context fails, a bounded SVG renderer reads the same
already-authorized local model Blob and projects its actual static geometry and
base colors. The visible label says simplified and untextured; this is not a
texture/PBR-quality claim, synthetic replacement or proof of manufacturing fitness.
Unsupported or oversized geometry fails with a visible message and original-file
guidance. No external model/image resources are fetched in either render path.

Preview selection now focuses and scrolls to its inline region. Close releases
the selected URL, cancels a pending selected-file operation and returns focus to
the opening button. Download original GLB uses the existing authenticated lazy
artifact path. Error guidance precedes the canvas, the failed canvas is hidden,
and failed model loads stop the rendering loop. Account switching, loading,
logout, metadata ownership and signed receipt checks are unchanged.

The software path reads unchanged source bytes. No private model data, model
identifiers or source artifacts are bundled or added to this repository.
Local component tests use controlled DOM/GPU adapters; they do not establish
browser/device or full textured visual acceptance. The initial aggregate passed
1,604 of 1,606 tests; both failures were the existing native Chromium socket
restriction. Those blocked browser tests were not retried or bypassed. After the
Shop rebase and release guard, the final runnable suite passes 1,652/1,652.
Independent preview/gallery/ownership/framing review passes 55/55 and release
selector suites pass 66/66. Lint (warnings only), TypeScript, real local HTTP
smoke, production build/postbuild, Worker dry-run packaging and diff checks pass.
No paid generation, billing change, security setting or Oracle mutation is included.
The earlier prototype's stale release marker is not reused. The new ten-file
release envelope requires exact parent 62f9fa92 and a single-parent commit,
preserves remote dashboard variables and skips all five financial setup/check
steps. Missing/changed marker, extra paths, symlinks or a different parent fail
before credential setup. Backend, account, workflow and deployment configuration
remain byte-identical to that parent. Hosted exact-head verification is required
before the separately authorized publication.

## LOCAL REVIEW — generation evidence, failed usage and model selection (5 October 2026)

Failed customer-point settlement and provider cost are separate. Existing failed
Studio holds are released once, while successfully completed jobs settle their
original point cost. A failed or incomplete provider response does not establish
zero spend or the full reserved cost. The new Blueprint path preserves valid,
authenticated final usage before content validation can reject the output. Only
strictly matched current ordinary reservations can release proven unused API
capacity in the same transaction as failed-point settlement. Missing, malformed,
uncertain, mismatched or non-default-tier evidence keeps its conservative hold.
Historical support/project authorities and successful delivery remain unchanged.

A separate read-only funding projection examines at most 32 existing completed
Blueprint reconciliations within the bounded account scan. It verifies the old
immutable result, hash, v1 marker and historical model terms before reporting a
potential additional difference from final output usage. This reports aggregate
counts and cents only; it changes no credits, receipts or financial history.
Unverifiable and unscanned records remain explicitly unknown. No actual account
recovery amount is claimed from synthetic tests or aggregate liability totals.

Direct procedural Sol requests use the reviewed GPT-6.1 Sol model while retaining
the 50-point and 35-cent ceiling. New receipts and owned jobs bind their exact
provider model; historical GPT-6 Sol results remain attributable and recoverable.
The fixed default-tier cost envelope covers reviewed long-context and regional
rates. Detailed Oracle/Blender stays on its separately enforced Astra route.
Provider access for a configured key and live output quality are not established
by documentation or inert fixtures; no paid verification is part of this release.

The Shop presents description and references, delivery, one model selection, and
the existing cost/start controls in that order. Its progress ring reuses the
homepage sculpture, supports reduced motion and pauses hidden/offscreen rendering.
The worker exposes stages, not a measured completion percentage. The ring labels
25%, 50% and 75% as estimated stage progress for acceptance, worker start and
worker completion. It does not interpolate from elapsed time or retain a higher
milestone when the reported stage moves backward. Unknown, failed and uncertain
states show no percentage; 100% requires the same job's validated file and a
successful save acknowledgement for that exact current file. Elapsed tracking
time remains separate. This never implies visual or manufacturing acceptance.
Saved terminal diagnostics stay attached to their selected job identity.

Recorded worker generation time comes from Oracle's existing monotonic timing
report, excluding upload and queue time. Only owned terminal recovery or an
explicitly selected library model performs the optional five-second, 256-KiB
quality read. The browser receives only a validated scalar duration. Missing or
provisional timing remains optional and can refresh later. Receipt/account dates
are not substituted for execution time, and library listing does not fetch every
historical report. Temporary metadata failures may retain a valid artifact
receipt; identity, permission, malformed-data, expiry and cancellation remain
strict. Existing submitted-job settlement/recovery behavior remains in place.

The integrated application aggregate passed 1440 of 1441 local tests. The only
blocked check was native Chromium startup under the environment's socket
restriction. Lint, TypeScript, HTTP smoke, production build/postbuild and local
Worker dry-run packaging passed. Focused source groups have independent review;
final package binding and hosted Chromium verification remain release gates.
The 64-file scope is fixed to ee107329 with a single parent and must skip all five
financial setup/checkout steps while preserving dashboard variables. Wrong
parent, missing marker or changed path scope stops before credentials. This app package does not install the separate Oracle
terminal-incomplete accounting prototype, change subscriptions, create funding or
authorize new API spending. Ordinary generation remains subject to real admission.

## DEPLOYED — cabinet prompt and saved-attempt context (5 October 2026)

The detailed Shop request uses a hidden default purpose of figurine. For an
explicit industrial or electrical cabinet request, the Oracle adapter now
appends the neutral word object instead. Incidental cabinet references and
requests for miniatures retain their previous meaning. The normalized input,
signed digest, preparation manifest, references, pricing and quality profile
remain unchanged; this removes a contradictory instruction without promising
that generated geometry or materials meet the requested realism.

Shop now identifies the saved request and its receipt creation time. A displayed
job must match that receipt. This device selection can differ from newer account
models, so the existing account library remains the source for other completed
results. A refused availability quote is labelled as applying to the next
request. Expired or invalid recovery receipts do not establish a model failure.
No receipt is replaced, no extra recovery request is issued, and no generation
is submitted by these display changes.

MODEL_BUDGET_EXCEEDED now reports inability to reserve the next API request
within the model budget. It does not infer model complexity, actual invoiced
spend or completed point settlement. Failure codes and financial behavior are
unchanged. These fixes do not replenish provider funding or prove improved
visual quality, and no additional paid test is part of this package.

The application delta passed 1289 of 1290 local tests; the sole unavailable
check was native Chromium startup, blocked by this environment's socket
restriction. Lint, TypeScript, HTTP smoke, production build/postbuild and local
Worker dry-run packaging passed. Focused independent review covered prompt and
receipt integrity, saved-attempt lifecycle and factual failure wording. The
final release scope and hosted browser check remain separate gates.

The fifteen-file release candidate requires its exact reviewed parent and a
single-parent commit, skips all five financial setup/check steps, and preserves
existing dashboard variables through the already-reviewed deployment path.
Wrong base, missing marker or a changed path set stops before credential setup.
The existing workflow, configuration, account ledger, backend admission and
all earlier release markers are untouched. The release and live no-cost asset/runtime checks passed. All five financial
steps were skipped and dashboard variables preserved. No new private prompts,
identities, models or activation values were introduced by the repair.

## DEPLOYED — one project-funded detailed cabinet attempt (5 October 2026)

This is a separately authorized, finite project API reservation for one detailed
Studio request. The authority is bound to a verified immutable account UUID,
the full normalized account-bound input fingerprint, a canonical window of at
most 24 hours, one attempt and a maximum provider cost of 175 cents. It is not
an ordinary-funding reset, a five-attempt pool or a recurring spending policy.
Private activation values remain outside the repository and are not active by
publishing source alone.

The fixed project namespace stores one typed immutable authority and job claim.
Changing or removing configuration cannot rotate its identity, clear the spent
attempt, transfer it to another account or renew the window. The matching draft
selects project funding before ordinary funds or previous support authorities.
An occupied or uncertain project claim cannot fall through to another funding
source for that bound request. A reserved maximum is not a measured invoice.
No automatic generation or paid retry is introduced.

The existing 250-point hold remains: accepted completion debits it once, and
failure releases it. The ordinary provider reserve and historical support
records are preserved. Project-funded records cannot replenish ordinary funding
through existing reconciliation. Status and quote reads do not seed or mutate
any financial record. Existing authentication, rate limits, request identity,
normalized-input validation, Oracle cost ceiling and once-only dispatch remain
required.

The private operator setting is a serialized JSON string in a Text binding,
with no API credential or new persistent access. Its exact input fingerprint
and fresh dates must be prepared only after the reviewed release and must match
the normal UI request. A subsequent paid click requires the separately approved
preflight and remains explicit. This limited attempt does not establish normal
unlimited generation availability or guarantee the requested visual quality.

The reviewed package was deployed in PR #217 from e36797e7 after all 1277
hosted tests passed. Production run 37330809154 succeeded; all five financial
steps were skipped and dashboard variables were preserved. This source release
does not itself prove visual quality or ongoing ordinary funding availability.
No private account identity, activation JSON or model bytes are in the package.

## DEPLOYED — private account Studio model library (5 October 2026)

Completed Studio ownership is already recorded on the account, but the model
gallery previously listed only files in the current browser's IndexedDB. A
successful model saved by another signed-in browser was therefore absent. Shop
recovery also prioritizes its existing local receipt, so an older failed receipt
can prevent that separate screen from discovering the newer completed result.

This repair lists completed, fingerprint-bound Studio records for the verified
account directly in the model gallery. Listing uses bounded read-only storage
reads, no Oracle call, financial settlement, reconciliation, new reservation or
funding change. Signed pagination and artifact-only receipts are account-bound
and expire. Artifact access rechecks current completed ownership and existing
download rights; missing or deleted records cannot use legacy receipt recovery.
The existing Oracle stores the original GLB. This is not a new public asset store
or a guarantee of permanent backup.

The gallery preserves older local Studio and procedural Sol files as device
copies. It does not infer account ownership from their titles or bytes, overwrite
them, or fetch all cloud artifacts in the background. Only an explicitly selected
model is fetched. A validated model selection in the account-library URL can
locate a specific owned record independently of the current page and Shop's old
local receipt. All models remain UNREVIEWED; export completion is not visual or
manufacturing approval.

Session refreshes now reject older responses and invalidate private account
views at logout intent. Focus and timer refreshes cannot repopulate an account
while logout is pending. Library responses identify the verified account, and
the client rejects an envelope for another session instead of attributing it
to stale UI state. These are client ordering and response-binding corrections;
authentication endpoints, credentials and access permissions are unchanged.

Ownership, signed pagination, deleted/failed records, delayed account changes,
local archive preservation and lazy artifact access require regression tests
and independent review. Exact-head hosted verification and the bounded release
scope remain required before publication. The release must preserve dashboard
variables and skip all five financial steps. No new paid generation, third
support allowance, public model sharing or private model upload is part of this
library repair.

## LOCAL REVIEW — one separately approved MCC attempt after runtime repair (5 October 2026)

The compatible STANDARD context repair has an owner-provided verified activation
receipt. That runtime change does not restore a consumed support allowance.
This separate application patch adds one fixed, optional project-funded
authority for one specifically approved MCC request. The private configuration
binds a verified account and its exact canonical request fingerprint, USD 1.75,
and a window no longer than 24 hours. Deployment does not activate the authority.

Both older singleton claims and ordinary provider funds remain unchanged on
the new-funded path. Its claim stays consumed after failure, expiry, restart,
configuration rotation or lost acknowledgement. Ordinary-funded requests retain
their existing path before a new support claim is obtained. The new request
holds 250 points; accepted success charges those points once, failure releases
that hold. Neither outcome adds support funds to ordinary provider funding.

Preparation reads eligibility and rejects changes to the approved draft when
this new allowance is the only available funding. Actual submission separately
validates the full signed input, exact account-bound fingerprint and text-only
legacy STANDARD route. Existing receipt recovery cannot create a replacement
provider call. No Stripe, subscription, price, credential, runtime or historical
job change is part of this patch. The one-time release scope must skip all five
financial release steps and preserve existing private dashboard variables.

Focused inert API tests exercise exact-draft preparation, tampered digests and
metadata, ordinary-funded controls, success, failure, response loss and expiry.
Durable-object race and preservation tests, aggregate checks, independent review
and exact-head hosted CI remain release gates. No new paid model or visual
success is inferred from these fixtures; activation and one intentional model
submission remain separate from source publication.

## LOCAL VERIFICATION — read-only generation quotes (5 October 2026)

The frontend correction based on deployed `177c71098e9ccca3e18bedb505f2dd9932a9aab8`
removes automatic quote-time membership recovery and historical funding
reconciliation. Startup, focus, mobile return, back-forward restoration, balance
signals and explicit availability refresh now use only the existing authenticated
GETs. Model, delivery, budget and prompt edits reuse that snapshot. The cost notice
describes a current-allowance read and makes no claim that earlier funding was
checked or returned. Explicit Account recovery and submitted-job recovery and
settlement are unchanged; no server, billing, price, ledger or grant policy changes.

All 92 focused quote, account-read, Shop/portal lifecycle and cost-notice tests pass
with zero skips. They cover current Pro and supplemental Detailed admission,
independent Blueprint refusals, stale membership projections, unavailable billing,
identity changes, late responses and bounded fail-closed timeouts. These are inert
fixtures, not proof that production account funding or live generation is repaired.
Aggregate verification, independent review and release remain pending.

## GENERATION RECOVERY AUDIT — repository fix applied, live drone remains unverified

The 4 October audit in [`GENERATION_RECOVERY_AUDIT.md`](GENERATION_RECOVERY_AUDIT.md)
traces detailed Astra Studio from signed browser receipt through account/provider
admission and fenced Oracle dispatch to artifact validation and preview. The
confirmed pricing regression was PR #195: its new-job ceilings were USD 2/USD 4,
while existing funded Astra allocation remained USD 1.75 per 250 points. This
could refuse an account before Oracle; it is not evidence of an Oracle/Blender
failure. Merged PR #205 restored the legacy contract without resetting funding
or changing previously admitted jobs.

This local task branch adds an explicit legacy-policy deployment gate,
post-deploy policy assertions and fixed-schema, redacted Studio lifecycle
diagnostics. Focused fixture tests prove a provider-funding refusal has no
Oracle POST and changes no account balances. These tests are not live
generation evidence. The latest main release workflow passed as run
[37170989080](https://github.com/teslaeco/WORLDIFACT/actions/runs/37170989080);
that does not prove a new user job or preview.

Local validation for this audit: 19 focused Studio tests passed; typecheck,
lint (existing warnings), local HTTP smoke, direct Vite bundle build and
Wrangler dry-run passed. The full suite had 1,079/1,080 passing: the sole
failure is the existing ISS foundation test missing generated
`public/apps/iss/vendor/examples/jsm/math/Octree.js`. `npm run verify` and
`npm run build` stop before compilation because the asset preparation step
cannot resolve its external ISS source domain. Full asset-ready CI remains
required. `npm audit --omit=dev` found no vulnerable production dependencies;
secret scanning found no secrets in changed files.

The last recorded real Astra/Oracle/Blender artifact remains the historical
one-shot GLB/BLEND recorded below, not the requested sci-fi drone. No new live
request, Oracle job, or GLB was produced for this audit. Specific account
funding, current secret values, Oracle VM/MCP/Blender runtime and production
preview remain unverified from this checkout. No funding reset, paid retry,
Cloudflare publication, push or merge was performed.

## IN VERIFICATION — paid membership refresh and removal of Creator attempt quota

At 22:59 the owner reported another generator-limit message and specifically
asked to repair stale cheapest-plan settings after a Pro upgrade, and remove
generation quotas for the standard paid account. Fresh read-only Stripe evidence
shows one active Pro subscription, upgraded on the same subscription/item, with
the full Pro invoice paid and no pending change. There is no second subscription
to cancel. The private local entitlement record is not directly observable here.

A regression fixture reproduces upgraded points with a stale Creator projection
when the separate subscription write rejects an older revision. The existing
authenticated billing status recovery repairs that projection without repeating
the credit grant or making a Stripe write. Generation screens previously never
called that recovery. They now perform a bounded status-only membership sync on
entry and refresh, then re-read authenticated entitlements. Billing transport
failure must not erase an established funding refusal, and expired authentication
must not retain the former user's allowance.

The requested policy removes the Creator six-attempt period quota, while keeping
active paid membership for Astra, owned downloads, available point checks,
verified runtime activation and funded provider-spend limits. Standard/Creator,
Pro and Studio use the same generation admission rules. The 250-point/USD 2 and
explicitly accepted 500-point/USD 4 detailed-job budgets remain unchanged.
The Credits screen also stops presenting Creator as the default highlighted
offer for an already-verified Pro member. No actual account credit, payment,
subscription or provider budget has been manually changed.

Independent implementation review passed. The frozen local verification passes
lint, TypeScript and 1,070 tests with zero skips; the sole failure is the retained
native Chromium test because Chrome/Chromium is not installed in this executor.
Hosted exact-head CI must pass that test before merge. The local HTTP check,
production build and Wrangler dry-run also passed. Upgrade recovery, interrupted
webhook settlement, account-switch/login races, actual paid-plan page controls
and native SQLite funding safeguards have regression coverage. Release pending.

## DEPLOYED, ACCOUNT RECOVERY UNVERIFIED — actionable funding refusal #200

The owner's 22:16 screenshot shows the PR #199 client, 2,755 customer points,
a completed funding check and continued `PROVIDER_BUDGET_EXHAUSTED` for an Astra
procedural Blueprint. This is direct evidence that the prior deployment did not
restore this account's generation. Its generic completed-check wording could
also represent zero eligible rows; it was not evidence of money returned.

Read-only verification through the connected account services confirmed the
owner's authenticated account and active, paid Pro subscription. No payment,
subscription, grant or balance was changed. Payment success does not prove that
earlier provider reservations are unused.

The follow-up makes the primary action respond to a confirmed funding refusal
by checking existing funding, without starting or buying a model. Zero eligible
rows now have explicit wording. A restored allowance never starts a model
automatically: generation requires a separate click.

The bounded, account-owned recovery now includes previously excluded completed
ordinary paid Blueprints with matching server-persisted LIVE results, complete
provider usage and a validated blueprint hash. Immutable historical terms retain
the entire 4,000-token output ceiling and a 2,048-token input margin; only the
remaining reserved portion is returned atomically once. Failed, unknown, free,
support and Studio liabilities are excluded from this Blueprint calculation.
The old Studio-only internal API remains compatible. No account is reseeded and
chargeback debt remains. The actual amount that can be recovered on the owner's
account is not yet known.

Independent review found no blocker. Local verification passes lint, TypeScript
and 1,051 tests with zero skips, including native workerd/SQLite reconciliation,
rollback and restart/replay. The sole local failure is the retained native
Chromium test because this executor lacks Chrome/Chromium; it must pass in the
exact-head hosted CI run before merge. The real local HTTP smoke check,
production build and Wrangler deployment dry-run passed without a paid provider
request. PR #200 then passed all six exact-head workflows and 1,052/1,052 tests,
including native Chromium, with zero skips. It merged as
`33eb7b665193b09ac85457b7f582375a9144269a`; production run
[37152297735](https://github.com/teslaeco/WORLDIFACT/actions/runs/37152297735)
published Cloudflare `d31617f6-a8c9-4f12-9fd9-f2d7afb931ef` at 20:41 UTC.
LIVE assets and READY runtime checks passed. The later owner report above still
does not establish account-specific recovery or a successful new paid model.

## DEPLOYED, ACCOUNT STILL BLOCKED — shared generation admission repair #199

The owner's 21:48–21:51 screenshots show procedural Blueprint controls with an
explicit exhausted provider-funding refusal or an unresolved account quote.
The comparison model is dated 2 October, 00:46:40 Europe/Amsterdam (1.7 MB).
That timestamp does not identify its deployed commit or establish its provider
cost. The successful Oracle installation below did not verify these independent
account/Blueprint paths.

The repair reproduces a Blueprint reservation leak before the paid Responses
request, and adds an explicitly versioned, atomic dispatch fence. Only new
opted-in reservations proven not to have dispatched may return provider funding;
legacy callers and uncertain paid calls retain their liabilities. Mixed-version
deployment must not turn an old caller's request into a refundable reservation.

An authenticated, bounded account-history check now retrieves immutable terminal
Oracle budget receipts for eligible old Studio jobs, including jobs no longer
pointed to by the current-job field. Pagination remains account-owned and no
generation is submitted. Missing or conflicting evidence retains its debit.
Both generation entry points use the same quote recovery; valid entitlement
data survives auxiliary billing failures and loading has a finite deadline.

There is no funding reset, point grant, payment, paid test, automatic retry or
change to the approved 250-point/USD 2 and 500-point/USD 4 tiers. Historical
Blueprint spend without sufficient evidence is not refunded. Production account
recovery and a newly generated model remain unverified until observed separately.
The executable task is recorded in `docs/CODEX_GENERATION_REPAIR_20261003.md`.
Local verification passes lint, TypeScript, 1,041 tests, the real local HTTP
smoke check and production build. The retained native Chromium regression is
the sole local test failure because this executor has no Chromium/Chrome binary;
it must pass in the full exact-head GitHub run before merge. Native workerd and
SQLite tests ran successfully, including actual storage pagination, rollback,
mixed-version dispatch and exact-once settlement. PR #199 passed all six exact-head
workflows with 1,042/1,042 tests and zero skips, then merged as
`2446e6ddc4ea956040d1176822e9b99352b1344b`. Production run
[37150636740](https://github.com/teslaeco/WORLDIFACT/actions/runs/37150636740)
succeeded with Cloudflare version `db4889f3-d27c-44a3-b4bd-822dca212216`.
The final runtime diagnostic reported general generation and Studio `READY`;
the later owner screenshot above independently establishes the remaining
account-specific refusal. No local or CI result is a paid user-generation result.

## ORACLE ACTIVATION VERIFIED — explicitly approved Studio price tiers

PR #195 merged as `12149bd6c55d8de95044a4c41e55ccf87fed47c6`.
Production run 37138372766 passed all 997 JavaScript tests and published
Cloudflare version `ffc3edf8-e1e3-4b21-a51e-cced052125c9`.
The owner's 21:40 Cloud Shell screenshot on 3 October confirms
`WORLDIFACT_STUDIO_PRICING_VERIFIED`, `activation_committed: true` and
`provider_limits_changed: true` for the PR #197 launcher at
`0ef1276ef239b98f1d973e57e72513bf66da1fd9`. The installation requested no paid
generation and changed no historical job rows. This establishes successful
Oracle activation, not a completed paid user generation or per-account funding.

The owner's earlier 3 October
Cloud Shell reports first showed `unsafe_job_history`; the subsequent read-only
snapshot contained one cancelled, 60 failed and 80 succeeded rows, with no other
states. After explicitly allowing cleanup of that one cancelled job, the
installer stopped at `accepted_or_unknown_socket`. PR #196 corrected journal
stdio admission and passed all six workflows, including real kernel socket
tests. The owner's 21:19 Cloud Shell result passed that gate, then reported
`cabinet_pipeline_unverified`, `activation_committed: false` and
`previous_source_restored: true`. Worker and tunnel returned active, job counts
remained 1 cancelled / 60 failed / 80 succeeded, and no paid generation was
requested. PR #197 repaired the missing synthetic cabinet database and the
subsequent 21:40 attempt completed successfully. See the follow-up in
`docs/GENERATION_REPAIR_20261003.md`; do not infer worker activation from the
Cloudflare release or classify the historical rows as visually approved models.

The owner has now approved new detailed jobs at **250 points / maximum USD 2**
or **500 points / maximum USD 4**. This supersedes the earlier undecided
500-point option below, not historical job terms. The extended tier requires
explicit acceptance for the exact draft before a five-minute signed quote can
start a job. Changed inputs invalidate the quote; recovery retains the original
price and never starts another paid request.

These tiers require the exact new Oracle pricing attestation, immutable job terms
and matching provider guard. The original worker's activation is now confirmed;
the client still requires fresh readiness evidence before offering these tiers.
Historical jobs retain their USD 1.75 provider ceiling. Account funding remains atomic and capped
by the unchanged funded pool. Plan prices, point grants, 70% reserve allocation
and historical support approvals are unchanged. No paid generation was used to
validate this pricing change. See `docs/GENERATION_REPAIR_20261003.md` and this
change's PR for exact test, release and Oracle activation evidence.

## DEPLOYED — generation funding and mobile-resume repair (3 October 2026)

The owner's current screenshots and authenticated production Shop show an account
provider-funding refusal despite remaining customer points, alongside a separate
earlier `ASTRA_COST_LIMIT` failure. The provider reservation ledger and customer
points are distinct; no actual invoice cost or historical refund is inferred.

The isolated follow-up fixes mobile/BFCache admission refresh and a reproduced
future pre-dispatch reservation leak, while retaining the USD 1.75 cap and
conservative handling of dispatched, uncertain, support and legacy jobs. It also
replaces the timing-dependent completed-Blueprint replay assertion which stopped
the latest main deployment before publication. See
`docs/GENERATION_REPAIR_20261003.md` and the repair PR for exact release evidence.

No paid model, support-grant activation or historical funding reset was performed.
The separate Dots/MCP integration remains outside this production repair. The
original Oracle health confirmed completion and prebuild maintenance, but did not
attest the STANDARD context policy. PR #193 merged as
`caa439fbbca63e1da12515c59d07c6645751b722`; production run
[37132224035](https://github.com/teslaeco/WORLDIFACT/actions/runs/37132224035)
succeeded after all 937 tests. Source merge alone is not an Oracle installation claim.

## DEPLOYED — return proven unused terminal provider reservations

The owner requested removal of incorrect generation blocks while retaining the
funded payment limit, and an explicitly accepted 500-point option for costlier
work. At that repair's approval the Astra provider cap remained USD 1.75 and the
price remained 250 points. The later explicit tier decision above supersedes
that pending decision for new versioned jobs only.

This follow-up separates funding refusal from insufficient points in the UI and
adds exact-once account reconciliation from an authenticated, immutable Oracle
terminal liability receipt. Missing, malformed or uncertain cost evidence retains
the original reservation. The receipt must seal every future paid request for
that same job; it is an upper-liability bound, not an invoice. Customer points,
plan quotas and the operator cap are unchanged. See
`docs/GENERATION_REPAIR_20261003.md` for activation and verification boundaries.

PR #194 merged as `8aa7dbc56f4f638af130fbe26c7b4a2b31656b70` and production run
[37135396401](https://github.com/teslaeco/WORLDIFACT/actions/runs/37135396401)
succeeded with all 955 JavaScript tests, including Chromium and real SQLite.
Oracle receipt installation and actual historical funding recovery remain
unverified; the Cloudflare deployment alone does not establish either.

## VERIFIED — one bounded live Astra character generation

The owner explicitly approved one paid GPT-6 Astra / Oracle / Blender character test with an unchanged maximum provider reservation of USD 1.75 and no automatic retry.

Workflow [36815867329](https://github.com/teslaeco/WORLDIFACT/actions/runs/36815867329), exact source `a5c8266f7c4b5c3348d6913bd48e90d759917f0d`, completed successfully.

- model: `gpt-6-astra`
- Oracle job: `a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- submitted jobs: 1
- automatic retries: 0
- customer charges/checkouts: 0
- maximum provider reservation: USD 1.75; actual provider invoice cost remains UNKNOWN
- GLB: 15,281,768 bytes
- GLB SHA-256: `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`
- structural inspection: 368,760 triangles, 21 meshes, 8 materials
- BLEND: 26,457,988 bytes
- BLEND SHA-256: `946c0ec1427cc710bc52877508c4c891f2d3361ce1322d1d12fc81fed4705bed`
- FBX: FAILED
- separate PBR ZIP: FAILED
- visual fidelity: REQUIRES_HUMAN_REVIEW

The three chat reference images were deliberately not published to the public GitHub repository and therefore were not passed as image bytes through this Actions test. Their visible character design was translated into the fixed generation brief: adult silver-haired sci-fi heroine, pearl-white/black/cyan outfit, empty hands and no glowing orb. This verifies the written-design generation path, not pixel-level multi-view similarity to those private chat images.

## VERIFIED — production integration

PR #157 passed all five exact-head checks at `31e0a023b61570cefc898f2a00a6e4e328691ae4` and merged as `2f8a94cca1f7d32a0a1706bd031024c926db0a3c`.

The integration:

- exposes only the exact generated job through `/api/avatar/terraforming-heroine`
- keeps bounded GLB validation and cache controls
- never starts generation while loading an avatar
- adds `TerraformingPlanet Heroine · Astra / Blender` to the shared-world character picker
- makes the heroine the default shared-world avatar
- preserves Neptune Queen and Rapper as selectable characters
- allows the existing GAME-only approximate locomotion binding when the generated model has no usable native rig
- leaves Stripe, PayPal, subscriptions, prices, credit rates and customer balances unchanged.

Production run [36816617943](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816617943), job `110222959900`, passed all release checks. It ran **615 tests: 615 passed, 0 failed**, typecheck/build/foundations/deployment dry-run, detailed-worker verification, payment no-charge readiness probes, Cloudflare deployment and public smoke. Cloudflare published version `052b2311-130a-428d-abf1-807a31b7361f` to https://worldifact.xodobrox.workers.dev.

## VERIFIED — exact production GLB readback

A separate no-cost post-deployment workflow [36816788673](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816788673), job `110223489733`, fetched the public production route and required:

- HTTP success
- `Content-Type: model/gltf-binary`
- `X-WORLDIFACT-Avatar: TerraformingPlanet-Heroine-Astra`
- `X-WORLDIFACT-Source-Job: a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- valid GLB v2 header and exact embedded length
- payload larger than 10 MB.

Production returned exactly 15,281,768 bytes with SHA-256 `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`, identical to the generated test GLB.

## PAYMENT / GENERATION SAFETY PRESERVED

PR #156 had already restored authenticated completed-cache accounting and the owner installed the Oracle helper successfully with `CACHE_ACCOUNTING_VERIFIED`, `max_provider_usd: 1.75`, `payment_settings_changed: false` and `WORLDIFACT_CACHE_FIX_INSTALLED`.

This heroine release does not revert the current payment plans and does not change the USD 1.75 Astra job cap.

## LIMITATIONS — do not overclaim

The model has not received a human visual-fidelity approval in this release. Structural success and production delivery do not prove that the face, hands, hair or outfit exactly match the supplied artwork.

FBX and separate PBR ZIP are not available for this character yet. GLB and BLEND are the verified outputs.

MAKE remains validation-required. No manufacturing approval, supplier acceptance or production-ready claim was created.

Release decision: **GO — the generated Astra heroine is live as the default TerraformingPlanet/WORLDIFACT shared-world GAME avatar. NO-GO for reference-perfect-likeness, FBX/PBR-complete or manufacturing-ready claims until separately verified.**


## VERIFIED — stuck Studio receipt recovery deployed (1 October 2026)

Owner evidence showed a selected Astra/Blender Studio job still displaying `Preparing your model…` after more than 92 minutes while recovery returned `This model belongs to a different account or has no account receipt.`

Root cause in the public client: that exact HTTP403 was treated as a transient polling failure. Polling eventually stopped, but the signed receipt remained selected as non-terminal, so the elapsed timer continued indefinitely and the generation UI stayed locked.

PR #164 merged as `f7c9eeb5f4add49dbb14eb2ad433dfd923eb3fab` after exact-head green checks. Production workflow [36904740422](https://github.com/teslaeco/WORLDIFACT/actions/runs/36904740422) completed successfully, including deploy and post-deploy detailed-route verification. Main CI [36904740551](https://github.com/teslaeco/WORLDIFACT/actions/runs/36904740551) also passed.

The repair:
- keeps HMAC receipts bound to the verified account UUID;
- never turns a receipt from another account into ownership;
- when the valid current-account receipt exists but its entitlement job row is missing, reads only the exact matching Oracle UUID;
- never starts another generation, reserves another job, debits points, grants credits or mutates Stripe/PayPal during recovery;
- returns `reconciliationRequired` instead of an endless elapsed timer;
- treats an Oracle 404 after the existing reconciliation window as terminal without financial mutation when no entitlement reservation exists;
- allows GET recovery of an already-succeeded exact Oracle artifact only when the current account still has an active subscription and no billing review;
- preserves the normal owned-job settlement/download path unchanged;
- contains a client compatibility path so the old exact ownership-403 enters same-job review instead of spinning indefinitely.

The Codex implementation contract is recorded in `docs/CODEX_TASK_STUCK_STUDIO_RECOVERY_20261001.md`.

No paid Astra generation was run for this repair. The specific owner's 92-minute receipt still requires one post-deploy browser recovery action to reveal whether its exact Oracle UUID succeeded, failed/cancelled, or is absent; do not claim that model itself recovered until that result is observed.


## MERGED — Game Lab live generated-model library sync (1 October 2026)

Owner Android evidence shows a newly completed AI Shop GLB present in the device archive while Game Lab/World Builder still displays an older library snapshot.

Root cause verified in source: Game Lab read the local IndexedDB Studio archive and then filtered the entire list through `/api/worlds/library`. That server endpoint intentionally returns only current account-ledger/downloadable IDs. A valid local GLB therefore disappeared from Game Lab whenever ledger ownership was delayed or missing, even though the bytes already existed on the device and could be imported through the ordinary file picker.

PR #166 changes the device-library contract without changing server ownership:
- every locally stored generated GLB remains visible in Game Lab, newest-first;
- server verification becomes an additive `ACCOUNT VERIFIED` badge instead of a visibility filter;
- unverified local models are explicitly labelled `DEVICE ARCHIVE` and are imported only as local device bytes, equivalent to the existing file picker; no cloud ownership is claimed;
- verified entries still re-check server download permission before import;
- `saveStudioModel` emits a same-tab archive event plus a best-effort cross-tab storage signal;
- the Game Lab Library refreshes on archive change, cross-tab storage, focus, pageshow and return to a visible tab, with no continuous polling;
- GLB bytes are not duplicated into the world-asset store until the user explicitly chooses a model.

Regression coverage includes preservation of local models when zero server IDs are verified, verification-badge merging without reorder/byte mutation, and live notification wiring. The implementation contract is `docs/CODEX_TASK_GAME_LAB_MODEL_LIBRARY_SYNC_20261001.md`.

Exact-head checks for commit `ae1ecb0e5ba2ec27ea16cb8446fa388b0ac135ca` passed:
- Verify WORLDIFACT: success, including lint/typecheck/tests/HTTP/build/foundations/deploy-check;
- Review FAST draft worker: success; no paid API call.

PR #166 merged on 1 October 2026 as `f9d3c677d04745e48678931a5efec439bd796c69`. Its library-visibility changes are present in the subsequently deployed main baseline `8a38d1f349a2f454d913b6b7042881460991575c`. No Astra/Oracle request, point debit/refund, Stripe/PayPal/subscription mutation or server ownership transfer was introduced.

Release decision: **MERGED**. The 2 October placement/runtime follow-up below addresses separate defects remaining after the library-visibility repair.


## DEPLOYED — durable cloud Studio recovery and deferred point settlement (2 October 2026)

Incident evidence: a paid detailed Astra/Blender request on Android visibly returned to the example preview after starting, while the account UI showed 250 fewer credits. A production customer must not depend on one React/browser state object to recover a paid cloud model.

Branch `fix/cloud-studio-durable-recovery-20261002` implements:
- account-ledger current Studio pointer with exact UUID, fingerprint, prompt, timestamps, quality profile and financial state;
- account-bound `/api/studio/current` recovery that issues a fresh signed receipt for only the exact same verified account/job;
- explicit generation idempotency header bound to the receipt UUID, with mismatch fail-closed;
- detailed Studio credit **hold**: `credits` remains the actual balance while `reservedCredits` is unavailable for another generation; a valid completed model commits the hold and failure/invalid-output/timeout releases it;
- no change to the separate provider/API spend budget, which remains conservative and is not replenished by customer release;
- no change to blueprint/Sol/Luna accounting in this narrow repair;
- Shop recovery from cloud before sample preview, persistent terminal failure UI, bounded exponential status retry, and no silent duplicate POST;
- a 35-minute WORLDIFACT whole-job reconciliation watchdog, separate from the verified 15-minute Astra provider-request timeout;
- account/quote UI shows held vs available points.

The implementation contract is `docs/CODEX_TASK_CLOUD_STUDIO_DURABLE_RECOVERY_20261002.md`.

PR #169 merged as `8a38d1f349a2f454d913b6b7042881460991575c` after owner approval and green checks. Main CI [36971937848](https://github.com/teslaeco/WORLDIFACT/actions/runs/36971937848) and production release [36971937864](https://github.com/teslaeco/WORLDIFACT/actions/runs/36971937864) completed successfully. No paid generation was run as release validation.

### Recovery/verification follow-up (2 October 2026)

The failing Shop test searched source text for a literal front-image URL even though the existing view selector builds that URL dynamically. Replaced that brittle assertion with actual initial-render and lifecycle checks: no example before recovery is confirmed, labelled front/left/back/face examples after an empty recovery result, and image-failure/view-switch behavior.

The review also reproduced and repaired recovery defects:
- a pending or failed current-job lookup could unlock a new paid submit or reveal the sample before the old cloud job was known; discovery now remains gated and retries GET with bounded backoff;
- in-flight or late unmounted discovery could overwrite the selected receipt; client mutual exclusion and abort-aware recovery preserve the newer selection;
- a newly signed receipt for the same cloud job conflicted with immutable local receipt history; valid same-job/fingerprint revisions are retained separately, and history is saved before cloud dismissal;
- Oracle status/transport/schema failures, or an unavailable successful model stream, bypassed the 35-minute recovery watchdog; authenticated overdue holds now settle once, while a valid late success is still recovered first. Settled failures cannot reopen or charge after a later Oracle success.

Local follow-up verification: lint (existing warnings only), TypeScript, 654 non-browser tests, real local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly, and Worker deployment dry-run pass. The aggregate `npm run verify` reached the existing native Chromium regression but this executor blocked browser startup with `socket() failed: Operation not permitted`; that test was left intact, and the remaining tests were rerun separately. Exact-head GitHub CI remains the release gate.

All provider calls in the regression suite are fixtures. Public health/Studio GET probes returned HTTP 200 without generation. These checks are not visual, Android, or paid-generation proof. No production customer balance or provider-budget mutation, merge, or deployment was performed during this follow-up.


## DEPLOYED — generated GLB placement and preview recovery (2 October 2026)

The owner reported that generated 3D models still did not add to AI Game Lab and authorized repair, then merge/deployment after green checks. The work is based on released main `8a38d1f349a2f454d913b6b7042881460991575c`; the independent Dots/MCP PR #170 is outside this repair.

Reproduced defects and repairs:
- Multiline generation prompts became scene-object names, which strict world validation rejected. New and legacy device labels now normalize to bounded single-line names without rewriting prompts or GLB originals.
- Library actions only selected a model; placement required another action hidden in Build. Add to world now places one copy at the marker immediately, selects it and exposes transform controls. A failed validation never announces success.
- Model selection/read/import is locked before the first asynchronous operation, rejects duplicate in-flight clicks, and discards stale owner/world/unmounted results. A late world-load response cannot erase a newer placement. Verified entries still recheck account download rights.
- Local bytes display before the optional server verification badge returns; late refreshes cannot overwrite newer library results or clear an import error.
- A missing device GLB can be explicitly relinked to a selected saved object without changing its ID or transforms. Reimporting the same hash also repairs an absent blob under the prior asset ID.
- Failed preview loads no longer remain permanently pending. An explicit visible retry or a successful device-library import can recover them without an automatic retry loop.
- The preview cache releases unused resources, resets between worlds/accounts, counts in-flight bytes, limits concurrent loads to two, and disposes late decoded models safely.

Eighteen new deterministic lifecycle/storage/resource tests cover these paths, including the actual editor event handlers and actual world save/read validation. No provider call is used. The supported editor input remains a self-contained GLB up to 50 MB; FBX/BLEND exports must be converted to an embedded GAME GLB before import. File contents remain device-local; a world save stores placement references, not a cloud backup of private originals.

Local verification: lint and TypeScript passed; 671 non-browser tests passed. The single pre-existing native Chromium regression is blocked by this executor's `socket() failed: Operation not permitted`; it remains enabled and required in GitHub CI. Real local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly and Worker deployment dry-run also passed. No local browser/device, physical Android or paid-generation pass is claimed. PR #171 passed all five exact-head workflows, including 672/672 tests and the native Chromium regression. It merged as `b5622655b24c662c38babc9b6ae3b7b30d5f1f82`. Production release [36974732658](https://github.com/teslaeco/WORLDIFACT/actions/runs/36974732658) succeeded with Cloudflare version `6f237447-7176-4b7a-89af-82b5e0984931`. Independent read-only GETs for `/lab`, `/builder` and the Game Lab/Canvas JS/CSS matched the exact tested build hashes.


## IN VERIFICATION — complete procedural model and world handoff (2 October 2026)

The owner requested a fuller no-cost Shop → archive → Game Lab → save/reopen check after PR #171. A joined deterministic test exercised the actual detailed Shop handler/StudioCoordinator, archive and account-scoped asset storage, Game Lab placement, world save/remount/reopen and real GLTFLoader geometry parsing. The original file/hash, prompt, asset reference and transforms survived; duplicate clicks and repeated failed/recovered artifact reads did not submit another generation. No external request or provider call was made.

That check also reproduced two adjacent gaps:
- The separate procedural Sol/Luna/Astra blueprint view offered its emitted GLB for download but did not put it in the device model archive. This was a missing automatic handoff, not evidence that the detailed-model repair regressed.
- Leaving a new dirty Game Lab world through a Shop link before the eight-second autosave could unmount the editor and lose the unsaved world.

The follow-up archives successful procedural GAME GLBs with explicit blueprint provenance and their real generation evidence, without inventing a Studio receipt or account-verified ownership. It also saves a dirty world before Shop navigation and keeps the editor open if saving fails or the account/world/revision changes. Namespaced procedural entries never enter the server's detailed Studio ownership lookup.

The live public UI was inspected in the cloud browser: both updated editor controls and detailed Astra/Blender availability appeared. The browser was signed out and WebGL was disabled, so neither authenticated private-model handling nor physical-device visual quality was verified there. The live detailed model action displayed 250 points and was not used. No new paid generation, cloud model upload or user-account mutation is authorized merely to test this change.

Local lint and TypeScript passed. The aggregate suite passed 698 tests; its only blocked test was the pre-existing native Chromium fixture because this executor cannot start the browser process (`socket() failed: Operation not permitted`). That test remains enabled for full exact-head GitHub CI. Local DEMO HTTP/origin checks, production build, pinned Chess/Terra/ISS assembly and Worker deployment dry-run passed. Independent review found and then verified the fix for an overlapping open-world/save race. Full exact-head GitHub CI and production release verification remain required.

## DEPLOYED — preserve Studio failure diagnostics and recover uncertain artifact reads (2 October 2026)

The owner reported that a detailed prompt/reference job displayed “Previous model did not finish” after returning to Shop. Its exact UUID and authenticated worker logs were not available during this repair. The screenshot proves the terminal UI state, not whether that particular job hit a provider budget, failed generation, invalid geometry, a missing job or a timeout. No historic refund or exact incident cause is inferred.

Code review and deterministic regressions reproduced distinct defects:
- A temporary HTTP 404/502 while fetching a worker-labelled successful GLB was classified as invalid geometry and permanently failed the account receipt. HTTP availability errors and interrupted streams now retain the same recoverable hold; only explicit invalid-container/structural evidence fails the quality gate.
- A failure reason vanished after account settlement and later recovery skipped Oracle. An allowlisted failure code now persists atomically with settlement, survives account/browser recovery, and produces fixed safe wording without storing or returning raw provider messages.
- Completed jobs could be reported failed when Oracle later failed or disappeared, and concurrent status polls could report a result different from the winning ledger settlement. Both terminal account states now remain authoritative.
- A process-local verification lock could turn another valid overdue success into a terminal timeout before its artifact was read. Local contention now remains recoverable and does not release that job's hold.
- Shop now displays the non-secret job UUID and safe reason code. Historic failures without stored diagnostics explicitly remain unknown; signed receipt tickets are never rendered.

The repair preserves the original UUID, point-hold policy, same-job GET recovery, provider-spend budget and no-automatic-paid-retry policy. It does not reopen already-settled failed jobs or perform a production balance adjustment. Structural checks remain distinct from visual/render/device quality verification.

Local verification: lint and TypeScript pass; all 709 non-browser tests pass, including 108 focused account/client/Shop lifecycle tests. The aggregate `npm run verify` runs 710 tests and its only blocked test is the retained native Chromium fixture (`socket() failed: Operation not permitted` in this executor). Local DEMO HTTP/origin checks and production build pass. Full exact-head GitHub CI, including the native Chromium fixture and pinned foundation build, remains the release gate. Worker dry-run passes with its writable configuration/log directory. No paid generation or customer-account mutation was performed as a test.

The owner explicitly authorized publication, merge and deployment. PR #173 passed 710 tests and merged as `6a1c6750e153e02839d256ed4fda16d0018284bf`; production release [36980848475](https://github.com/teslaeco/WORLDIFACT/actions/runs/36980848475) succeeded. This fixed the reproduced recovery defects, not an identified cause for the original unspecified job.

## DEPLOYED — single-upload Studio submission and truthful admission recovery (2 October 2026)

A subsequent report showed an interrupted browser response while “Preparing your model” remained visible, then a generic failed receipt after reload. Authenticated read-only inspection found no row for that reported UUID on the connected Oracle worker. Two previously published model records remained available by their exact identifiers. This is evidence of the current missing record, not proof of whether the original upload reached admission, encountered a capacity rejection, or was affected by another historical event. The reported account's authenticated current-job result and runtime capacity remain unverified.

The follow-up fixes reproduced submission paths, without making a paid test request:
- Preparation now sends a bounded versioned manifest with the SHA-256 commitment to the complete canonical request. Reference image bytes travel only in the subsequent explicit submission. Legacy full-input preparation remains compatible.
- The server never treats the claimed digest or metadata as proof of valid content: full submission repeats image validation, exact account-bound digest comparison, readiness checks and reservation rules before any Oracle POST.
- Client upload and status deadlines reflect the bounded operations they contain. An interrupted response remains same-receipt recovery, with no automatic replacement or paid retry.
- A signed prepared receipt with no account reservation and no Oracle record receives a distinct missing-submission explanation, not a claim that a generated model crashed or that points were refunded.
- Missing-submission closure is atomic with account reservation. A zero-cost, exact-fingerprint terminal marker fences a late original POST; an already admitted job wins the transaction and is recovered instead. The marker neither changes funding/points nor replaces a current-job pointer.
- Definite admission failures now retain safe allowlisted reasons, including busy, rate limit, storage, stored-job capacity, allowance unavailability and cancellation. Raw worker errors are never persisted or exposed. The client preserves these codes across immediate rejection and reload.
- Shop distinguishes uploading, acceptance discovery and accepted generation, and restores the detailed route when reopening a detailed receipt rather than silently selecting the blueprint form.

Regression coverage includes three large reference payloads, request mutation, forged metadata/digests, wrong-account use, lost response/reload, both admission/closure race orderings, terminal error persistence, and no duplicate provider submission. Native Worker-runtime checks use inert upstream fixtures; the native Chromium receiver test remains an inert transport fixture and uses a precomputed digest adapter only when its network-free data origin lacks SubtleCrypto. Neither is paid-generation or visual model-quality evidence.

The provider funding policy remains conservative. Historical before-acceptance reservation leakage requires a separate evidence-backed review; this change does not replenish provider spending authority. Final local/CI/production results belong to this follow-up's release record. No complete paid mobile generation success is claimed.

Local final checks for this follow-up: 735 non-browser tests pass, including the real workerd manifest flow and SQLite Durable Object race tests. Lint, TypeScript, local DEMO HTTP/origin checks and the production build pass; Worker packaging passes. The native Chromium regression remains enabled for CI and is blocked locally by the executor's process/socket restriction. No paid generation, point debit, model creation or historical funding replenishment was performed as validation.

PR #174 subsequently passed all 736 tests and merged as `8c7e854fe4465efb64c8bd768fd1b87fa5e0cf8f`. Production release [36986292007](https://github.com/teslaeco/WORLDIFACT/actions/runs/36986292007) succeeded; the deployed Shop and JS/CSS hashes matched the tested build. This was not proof of a successful paid reference-model generation.

## IN VERIFICATION — finish the actual reference model within its original budget (2 October 2026)

A newer reported job now has concrete backend evidence. Read-only authenticated inspection found an existing Oracle `succeeded` row and a 21,708-byte GLB containing 13 box meshes, 156 rendered triangles, no images and no substantial meshes. The cabinet gate correctly rejected this sparse draft. It was not an instance-count false rejection or a missing upload.

The exact quality report says `modelStatus=draft`, `automaticQualityAccepted=false`, no completed visual assessment and no finished agent outcome. Its three completed MCP calls were contract inspection, an invalid initial build call, and a successful sparse build; no render inspection, edit or finish call followed. The stored CLI diagnostic matches `stream disconnected before completion` and `max_output_tokens`. Gateway usage was known, but the old gateway did not classify this incomplete terminal response as an error. Source review confirmed that the runner retained its unfinished candidate and the Oracle server labelled retained drafts `succeeded`. The original per-call affordable token allocation still requires the bounded VM ledger diagnostic; it is not inferred from the output size alone.

The local repair adds a complete-first-build contract, actual candidate-GLB feedback, explicit current-render/finish requirements and a WORLDIFACT-scoped runtime completion policy. It preserves the USD 1.75 per-job cap and incomplete-response reservations. A tiny affordable output allocation cannot launch an unfinished structural build; a structurally passing candidate keeps the compact finish path. Only a clean, fully accounted CLI exit can receive one continuation inside the same gateway, job, original deadline, request/output/build limits and durable cost ledger. An incomplete provider response is terminal and is never automatically retried. Generic Froge/FAST behavior remains outside the scoped contract.

The web adapter separately refuses to charge an execution that has no finished outcome, while preserving deliberately finished, unreviewed standard drafts subject to the unchanged structural gate. Previously settled account outcomes remain authoritative. This does not reopen or refund a historical job.

The installer uses exact reviewed source ancestry, strict existing SSH access, atomic idle-queue maintenance, private backups, genuine offline Codex/MCP/Blender verification, receipt-bound health evidence and rollback. It makes no paid request. A separate, default-inert one-shot test helper is being prepared to reuse the original prompt and three photos on the VM; paid execution requires the owner's clarified budget approval. No new API key, credential grant, budget reset or customer-point debit is part of that test route.

At this checkpoint the runtime package is under final offline review and has not been confirmed installed on the Oracle VM. Local fixtures and source tests are not generated-quality or visible-preview evidence. The user's completion criterion remains an actual generated model inspected in the real preview.

## IN VERIFICATION — existing bounded test funding in ordinary Shop (6 October 2026)

The ordinary Shop now has an explicit funding selector for the same owner-approved USD 4 aggregate test pool. Ordinary funding remains the default. This is temporary test access, not permanent replenishment of the ordinary provider budget. Existing test receipts, immutable commitments, the original expiry, historical grants, account balances, invoices and Stripe settings are preserved.

Account-bound versioned reads and submissions prevent cookie/account changes or mixed deployments from admitting work to a different account. Existing legacy test receipts remain recoverable by the same GETs. Regression tests cover account swaps, legacy receipts, immutable pool state, separate ordinary/test receipt storage, draft preservation, reload/recovery/export and repeated starts. The prepared integration initially passed 141 focused tests plus lint and TypeScript; final aggregate offline, exact-head CI and protected deployment results belong to its release record. Native browser checks remain enabled in hosted CI, not rerun through the recorded blocked local browser route. No paid generation is performed by the engineering validation.

## IN VERIFICATION — bounded STANDARD construction (7 October 2026)

A reproduced completion-policy defect allowed candidate-recovery continuation
when the preceding CLI had built no candidate. The prospective repair replaces
that STANDARD planning control with typed complete-scene output, host-run
existing MPC2/Blender tools, actual current-image assessment, one optionally
funded sandboxed correction and verified export. Rejected or incomplete work
cannot return a successful new-model outcome.

The original Gateway, USD 1.75 ceiling, immutable pricing terms and historical
ledger are preserved. Exact request bytes, mandatory future capacity and request
slots are bound to the original atomic reservation; completed usage remains
separate from invoice accounting. No paid provider request or customer-point
change has been made for engineering validation.

Native Blender integration has passed acceptance, rejection and real correction
with new revision images using scripted provider responses. This does not prove
live Astra quality or an installed Oracle change. The reviewed maintenance
transaction, genuine isolated Podman gates, hosted checks and final activation
receipt remain release requirements. See
[the construction repair record](STANDARD_CONSTRUCTION_REPAIR_20261007.md) and
[the package](../tools/model_construction/README.md).


## Initial construction edit compatibility — 8 October 2026

Prepared a bounded typed-plan correction for scene-schema features available only
through the existing Blender edit sandbox. One construction response can carry a
substantive scene and an optional validated initial edit; first inspection occurs
after both complete. The original cap, request limits, cancellation, validation,
render assessment and honest rejection remain unchanged.

Five native Blender fixture cases passed, including a UV/textured globe with an
alpha cloud shell and a different textured object followed by a correction. The
responses are scripted and the globe geography is invented; this is not live AI,
account-gallery or production-isolation evidence. The installed update's finite
write set is three helpers plus the top receipt. A new pinned restricted operation
requires separately approved grant refresh, status reconciliation and the genuine
isolated installation gates. Publication, installation and a new paid acceptance
test are not implied by these local results. See
[the repair record](STANDARD_CONSTRUCTION_REPAIR_20261007.md).

## Source correction — authenticated final-answer selection (9 October 2026)

The owner's original-host read at approximately 16:55 UTC now confirms both
user services active, local health HTTP 200, readiness true, connector 33 and the
construction policy present. The reported Git blob fingerprints for
construction_payload.py (`bfc80d6626932b30e1c2e1186c11f20f352f1516`),
phased_controller.py (`bddb2d9c5159b4c52cbae8074832855fcabc4eab`) and
runtime_controller.py (`6e8bdf205f7e044a677a59054e1d7cc99e9dae78`) match main
`38e7048c4176fac4c9808203af5bd58a1ae7d10e`. The earlier unverified-installation
hypothesis is not a sufficient diagnosis after this evidence. Independent public
GETs at 17:02 UTC also returned READY through the website. Neither is a new-model
test, but reinstalling the identical helpers is not a repair.

A separate deterministic decoder defect was reproduced against those source
bytes: a completed Responses envelope containing intermediate assistant
`commentary` and one final typed answer was rejected as multiple answers. A lone
commentary containing valid plan/verdict JSON was incorrectly accepted as final.
The correction selects one explicit last `final_answer` when commentary exists,
retains the original single-message absent/null-phase format, and rejects
ambiguous, incomplete, refused or malformed messages. Commentary is never parsed
as scene/edit/assessment data. Exact raw-response authentication and completed
usage remain mandatory before selection; model, budgets, request limits,
geometry validation and settlement are unchanged.

The existing metadata fixture now uses final_answer rather than treating a
commentary as final. Eight additional regression methods cover both directions,
all three phases, unchanged original scene/edit bytes, conflicting intermediate
acceptance, unknown phases and origin verification. The selected local parser,
controller, budget and adapter suites passed **119 tests** without a network
provider call. The native Blender fixture now includes intermediate commentary
before every final plan/verdict. Full hosted source-lineage/native checks remain
required and their exact commit results must be read independently.

Official protocol: https://developers.openai.com/api/docs/guides/reasoning#phase-parameter

This is a tested source-level compatibility correction, not a claim that the
owner's latest failed job used this response shape. Its actual failure code and
current account admission remain unverified. Historical manifests and the
restricted original maintenance operation keep their old pins; this update is
not permission to reuse that old operation for new bytes. Prospective package
hashes bind the corrected code without weakening checks. No Oracle installation,
restart, main merge, deployment, payment/point change or paid test was performed.
Production restoration remains unverified until the actual request and a newly
accepted original GLB are checked. Existing building/MCC originals are unchanged.

## Decoder update delivery — 9 October 2026

All six pull-request workflows on `71ccc84d4dca71a19e2ac3583c05a4563ce7e3a3`
completed successfully, including construction run 37965169861's native Blender
job and Verify WORLDIFACT run 37965169576. These results cover the decoder source
correction, not a production installation or an accepted new paid model.

The installation gap is now addressed with a separate explicit
`--update-response-phase` mode. It requires the entire frozen already-installed
initial-edit source map and its valid receipt chain. It writes only the decoder
and the top construction receipt, preserving previous initial-edit evidence and
all older receipts. Existing idle fences, four offline gates, rollback protection
and activation checks remain required. The owner-run checksum-pinned launcher
passes this new mode explicitly; retired modes and conflicting flags refuse.
No implicit update, secret export, broader SSH grant, job cancellation, financial
change or paid generation is introduced. New transaction regressions cover the
exact two-file write set, permissions/history preservation, failures before and
after writes, gate failures, active/cancelled work and ambiguous activation.

The original restricted GitHub maintenance grant supports fixed historical
operations, not arbitrary SSH commands. Its stored credentials are not missing
by definition, but they do not authorize new source bytes without a reviewed
grant update. No such grant or account change is made by this repair. The
[installation handoff](RESPONSE_PHASE_INSTALL_20261009.md) uses the original
owner's existing SSH connection instead. The new installation mode must pass
its exact-head hosted tests before delivery; their outcome is recorded in the
PR. No Oracle installation or production-restored claim is made by this commit.

## Observed pre-build refusal and output-scope correction — 9 October 2026

This supersedes the earlier statement that the failed-job exception was unknown.
The owner supplied a redacted original-host read: `complete_scene_not_supported`,
`WORLDIFACT_CONSTRUCTION_INCOMPLETE`, one request, known usage, a 1,800-second
limit, and zero recorded Blender seconds. The decoder update had already been
activated at 18:37:26 UTC. Do not reinstall it or infer a 900-second deadline,
missing Blender method, invalid key, or failed provider transport from this read.
No private identifiers, reference images or customer balances are copied here.

In the exact installed decoder, this exception is emitted when the authenticated
completed construction response contains an empty/whitespace `scene_json`.
The planner explicitly permits this sentinel for an unsupported complete subject.
The observed refusal remains legitimate to reject: it is not a completed model.
The diagnostic does not disclose why the model chose to return that sentinel.

A separate input-contract error was reproduced with the real
`oracleStudioPayload`: ordinary game/globe, terrain, object and default figurine
requests unconditionally received physical manufacturing requirements, including
resin walls and process-specific splits/joints. The typed planner is required to
satisfy the entire original brief and instructions. The same scoping issue was
independently identified in Codex review 5475643326 on PR #245.

The adapter now keeps units, dimensions, original references, digital validation
and the prohibition on manufacturing-approval claims for every output. Extra
physical process rules apply only to explicit fabrication hints in the original
brief, not a model-kind label or the English verb "make". Direct no-print intent
is respected for classification; the original prompt itself is never rewritten.
Unrecognized intent does not grant MAKE approval. Real fabrication still needs
its separate process-specific review. Standard completion, actual rendered-image
review and rejection of unsupported/unfinished models are unchanged.

Five new regression methods ran before the change: two passed and three failed.
After the change, 32 focused protocol, profile, output-scope and manufacturing
cases passed with no skipped cases. Original canonical input digests, image
bytes/order, prices, request IDs and pricing selections are preserved. Seven
synthetic Oracle wire hashes intentionally change because their instruction
scope changed; the original input-hash fixtures were not altered. Existing
manufacturing tests now distinguish explicit printable requests from digital
ones instead of requiring the diagnosed incorrect unconditional rule.

This is a tested request-contract correction, not proof of the AI's motivation
or successful production generation. Full exact-head hosted verification remains
required. No Oracle source, installer, secret, ledger, account/hold/settlement,
price, model or asset was changed; no paid request or production deployment was
performed. This adapter is bundled in the Worker, so its deployment is separate
from the already-completed Oracle installation. Do not use a generic main merge
that would resynchronize billing or overwrite live variables. Any eventual
release must retain the existing exact-parent and preserve-billing controls.
Production restoration remains unverified until a new real model, preview,
download and owned-library save are observed under an approved bounded test.
