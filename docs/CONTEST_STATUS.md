# WORLDIFACT — current generation recovery evidence

Updated 9 October 2026. **Release decision: NO-GO for a claimed generator repair.**

This current summary supersedes stale readiness/deployment assertions, without
deleting the original evidence. The complete prior status record is retained
byte-for-byte in [the archived ledger](history/CONTEST_STATUS_before_GENERATION_AUDIT_20261009.md).
Its earlier grants, deadlines and paid-test approvals are historical, not new
permission to spend or repeat a failed generation.

## Executed audit milestone

- Starting main: `38e7048c4176fac4c9808203af5bd58a1ae7d10e`.
- Recovery PR: [#245](https://github.com/teslaeco/WORLDIFACT/pull/245).
- Tested head: `84b734820b0072379b1281201da87f3889eb9ffc`.
- [Hosted run 37947066959](https://github.com/teslaeco/WORLDIFACT/actions/runs/37947066959)
  completed the six bounded audit tests, npm installation, lint, TypeScript,
  **2,042 application tests (zero failures/skips)**, real HTTP smoke, build,
  original foundation assembly and Worker deployment dry-run. Lint/build warnings
  remain; successful execution is not a zero-warning or security certification.
- On 9 October at 14:49 UTC, fixed public GET probes returned HTTP 200 for `/`,
  `/shop`, `/lab`, `/api/health` and `/api/studio/status`. The public Studio response
  advertised detailed readiness and `legacy-usd175-v1`; tiers were not ready.
  These reads used no account cookie, provider key or generation request. HTML
  availability does not prove browser rendering or a newly created model.
- The exact public tracked source was downloaded through a read-only artifact:
  **913 tracked files**, including four new audit files. Recomputed Git tree
  `ef7343a947892ad476d5fdd81809c0ffcccde291` matches the remote tree. Inventory is
  complete; individual manual review is scoped, not a claim that all 913 files
  received a line-by-line security review.
- The Codex implementation task is in
  [CODEX_GENERATION_RESCUE_20261009.md](CODEX_GENERATION_RESCUE_20261009.md) and was
  actually posted with `@codex` on PR #245. No task-acceptance response had been
  observed at this milestone. Posting a comment is not proof of agent execution.

## Findings and remaining evidence

1. **Source/runtime boundary:** PR #242 implements the typed `scene_json` plus
   nullable `initial_edit` plan, but explicitly does not prove Oracle installation.
   PR #243 fixes restricted refresh host trust; source merge is still not a live
   installation. The last construction document reports the initial-edit upgrade
   as not installed. Its current installed status must be independently verified.
2. **Financial compatibility:** main includes paid-points admission, immutable
   pending-cost holds and #244's incident-specific waiver semantics. An old source
   tree is not a safe replacement for today's receipts and persistent state.
   A positive point balance alone cannot establish the current failure stage.
3. **Originals:** the historical building and MCC comparison remain in this
   checkout. Their successful publication is not a new generation test or proof
   that today's cost-capped path reproduces that historical quality.
4. **Audit coverage gap:** construction and legacy Python workflows were filtered
   to narrow source paths and did not run for the initial rescue-task PR. Their
   triggers now include this executable task, so the existing pinned-source,
   offline construction/Blender and legacy suites run without paid API access.
   [Construction run 37949408968](https://github.com/teslaeco/WORLDIFACT/actions/runs/37949408968)
   passed both Python 3.9/3.12 jobs and the separate native Blender job. The
   Python 3.12 suite ran 259 cases: 258 passed, one native fixture was skipped
   there and delegated to the separate native job. The legacy completion run
   [37949408950](https://github.com/teslaeco/WORLDIFACT/actions/runs/37949408950)
   also passed. These are offline/synthetic acceptance tests, not a paid model
   request or an installation on the original Oracle host.
5. **Unverified:** the failing signed-in user request, first failing runtime stage,
   installed Oracle helper/receipt revision, a new accepted GLB, account-gallery
   persistence and an exact safe production release. No Desktop Commander device
   was connected during this audit. Encrypted maintenance evidence is not bypassed.

## Preserved platform and integration constraints

Actual Android device/browser gameplay and a clean authenticated session remain
unverified in this audit; GitHub Actions does not establish either. A valid GAME
result needs original, verified model bytes. FBX export, full PBR fidelity and
MAKE suitability must remain unverified unless matching capability and artifact
proof are available. Oracle must run the reviewed helper and receipt revisions.
SIGNED_MODEL_WORKER_URL and OPENAI_API_KEY are backend-only configuration/secrets;
their presence is not proof of successful generation, and their values must never
appear in a public report or frontend bundle.

## Audit follow-up regression

The first audit head passed all 2,042 application tests. The following audit-only
head `1c4e7deaacf86d0ab058eab973109e1ce8e1bf56` failed one existing documentation
contract: the shortened status summary omitted required platform limitations
(the first missing label was `FBX`). This is an audit-documentation regression,
not the user's original generator failure. This update restores the honest
limitations above without removing or weakening that test. Full exact-head CI
must be rerun; a fix is not declared tested merely because the text was edited.

## Scope and release boundary

This milestone changes audit tooling, tests, task documentation and test triggers,
not the production generator, billing, account state or assets. No Stripe/PayPal
operation, balance/hold/waiver adjustment, provider call, Oracle installation,
merge or Cloudflare deployment was performed. It does **not** claim the reported
production generation failure is fixed. A separately approved paid test and
verified runtime installation remain release gates; never rerun an old one-off
approval or merge on green CI alone. The production workflow's exact-parent and
preservation checks remain mandatory. Its generic path is not a safe shortcut.
