# WORLDIFACT — verified status and unresolved generation recovery

Updated 9 October 2026. **NO-GO for production deployment as a generator repair.**

The complete prior ledger is preserved byte-for-byte in
[CONTEST_STATUS_before_GENERATION_AUDIT_20261009.md](history/CONTEST_STATUS_before_GENERATION_AUDIT_20261009.md).
Historical paid-test approvals, funding entries and READY claims in that record
are not permission for a new charge and do not establish current generation.

## Mandatory integration and honest platform limitations

SIGNED_MODEL_WORKER_URL is mandatory for detailed Oracle/Blender model generation.
OPENAI_API_KEY is mandatory for LIVE Astra provider calls and must remain a backend-only secret.
Neither configuration value alone proves that generation works. Never expose
keys, authorization headers or private job receipts in a browser or public log.
The signed Oracle endpoint, installed helper revisions, receipt validation and
cost guard must agree. Missing mandatory configuration is BLOCKED, not LIVE.
Explicit local DEMO may remain available but must never masquerade as a real
Astra/Oracle/Blender-generated model. Direct Blueprint primitives are not proof
of detailed 3D construction or a successful downloadable GLB.

Android device gameplay, clean authenticated session behavior and mobile preview
remain unverified by this audit. GitHub Actions and desktop/native fixtures do
not establish physical Android testing. FBX export, complete PBR textures,
rigging, animation and MAKE manufacturing suitability remain unverified unless
matching capability and artifact evidence are present. GAME output requires
valid original model bytes; MAKE requires a separate validation process.

## Work actually completed

Starting main: `38e7048c4176fac4c9808203af5bd58a1ae7d10e`.
Draft recovery PR: https://github.com/teslaeco/WORLDIFACT/pull/245
Task: [CODEX_GENERATION_RESCUE_20261009.md](CODEX_GENERATION_RESCUE_20261009.md).
Detailed evidence: [GENERATION_AUDIT_20261009.md](GENERATION_AUDIT_20261009.md).

- Inventoried the complete first audit checkout: 913 tracked files including
  four audit additions. The recomputed tree matched the exact remote tree.
  Manual code review was scoped to selected generator/deployment/runtime and
  accounting-compatibility paths, not a line-by-line security audit of all files.
- Added a bounded GET-only public collector, six deterministic tests, hosted
  verification, and the actual Codex implementation task. No account/provider
  request or production credential is used by the collector.
- Exact head `84b734820b0072379b1281201da87f3889eb9ffc` passed 2,042 application
  tests with zero failures/skips, plus lint, typecheck, HTTP smoke, build,
  foundation assembly and Worker dry-run in run 37947066959. Existing warnings
  remain. This result applies to that head, not automatically to later commits.
- Public GETs at 14:49 UTC returned HTTP 200 for `/`, `/shop`, `/lab`,
  `/api/health`, `/api/studio/status`. Studio advertised legacy USD1.75 readiness.
  No authenticated account, actual installed helper or new model was verified.
- Expanded the existing rescue-task workflow filters to execute construction
  and legacy backend tests. On head `1fe05aa712ac6498fb05ef9051dc06335998f8ef`,
  construction run 37951321899 and legacy run 37951323178 succeeded. Construction
  includes Python 3.9/3.12 and separate native Blender execution. One native case
  is delegated from the Python suite to the separate native job; do not call
  the Python suite zero-skipped or infer an installation on production Oracle.
- The original portal-building GLB and MCC comparison/provenance files remain
  present and unchanged. A historical model is not a newly generated result.
- Codex was actually invoked in PR #245 and returned a task report. Its claimed
  workspace commit was not retrievable from GitHub when checked. The proposal
  requires an additional typed-runtime attestation; a producer/proxy/consumer
  review and fetchable patch were requested. A frontend-only denial is not
  accepted as this generator repair.

## Audit-documentation failure and correction

After the first green head, audit status-document edits caused one hosted
constraint test to fail. The latest observed error on `1fe05aa` was that the docs
must state that SIGNED_MODEL_WORKER_URL is mandatory. The scoped requirement is
now explicit above, along with the other platform limitations. The original
ledger is archived without alteration. No test is removed, weakened or skipped.
This documentation correction is not the user's production generator defect.
Exact-head CI after this change remains pending until its actual result is read.

## Unresolved production evidence and release boundary

PR #242's typed scene_json/initial_edit implementation is source evidence, not
proof of installation on Oracle. The first failure of the current signed-in
request, installed Oracle helper/receipt revision, a new valid GLB, successful
preview/download/library save and a safe release remain UNKNOWN. No Desktop
Commander device was connected during the audit; authorized original-host and
failing-account evidence is still needed.

This PR does not change the production generator, Stripe/PayPal, products,
prices, subscriptions, credits, funding, holds/waivers, settlement, ownership,
databases, saved jobs or original models. No paid request, Oracle installation,
main merge or Cloudflare deployment was performed. Do not downgrade persistent
records, replay old one-off approvals or bypass cost/authentication controls.
A new paid end-to-end test requires fresh explicit approval of its bounded cost.
Release needs a reviewed compatible patch, verified installed runtime, green
exact-head CI and a successful authenticated model with verified original bytes.
The existing exact-parent and preservation controls remain mandatory. Green CI
or public READY alone is not authorization to call the generator repaired.
