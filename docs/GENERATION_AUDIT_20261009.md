# WORLDIFACT generation rescue — evidence, not a restored-production claim

Audit date: 9 October 2026. Release decision: **NO-GO**.
Recovery PR: https://github.com/teslaeco/WORLDIFACT/pull/245
Starting main: `38e7048c4176fac4c9808203af5bd58a1ae7d10e`.
Implementation task: [CODEX_GENERATION_RESCUE_20261009.md](CODEX_GENERATION_RESCUE_20261009.md).

## Work actually executed

- Created one real recovery PR from current main, rather than another old ancestor branch.
- Inventoried all 913 files in the first audit checkout (909 original files and four audit additions). Recomputed Git tree `ef7343a947892ad476d5fdd81809c0ffcccde291` matches the remote tree. Reviewed the selected generation, deployment, construction, accounting-boundary and test paths; this is not a line-by-line security audit of all files.
- Added a fixed-origin, GET-only, bounded and redacted public evidence collector, six deterministic tests, a branch-only hosted full verification workflow and the detailed Codex task. No production secrets or financial operations are used.
- Executed full hosted verification on `84b734820b0072379b1281201da87f3889eb9ffc`: 2,042 application tests passed, zero failures/skips; lint, typecheck, HTTP smoke, build, foundation assembly and Worker deployment dry-run completed. There are existing lint/build warnings; this is not a security certification.
- Run: https://github.com/teslaeco/WORLDIFACT/actions/runs/37947066959
- Public reads at 14:49 UTC returned HTTP 200 for `/`, `/shop`, `/lab`, `/api/health`, `/api/studio/status`. Health advertised READY and the Studio response advertised the legacy USD1.75 policy. No authenticated account or paid generation was checked. HTTP/READY does not prove browser rendering, installed helper versions or a newly generated model.
- Added the rescue-task path to the existing construction and legacy backend workflow filters, so the actual backend suites run for this PR instead of only JavaScript checks.
- Construction runs 37949408968 and 37950413007 passed both Python-version jobs and the separate native Blender job. The Python 3.12 suite reported 259 cases with one native fixture skipped there and covered by the separate native job. Never describe this as zero skipped Python cases or a live Oracle installation.
- Legacy completion runs 37949408950 and 37950414560 passed.
- All 163 checked Python source files parse locally; syntax checking is not functional acceptance.
- The original portal-building GLB remains present: 21,047,056 bytes; SHA256 `0321c8f76c84d53a33f6fed20d128cd3460b3e24f87ff4bb36ee92f25cf3a3c6`. Its GLB v2 header, declared size, 110 meshes, 110 nodes and ten embedded images were checked. MCC comparison files also remain present. Existing originals are not evidence of a newly generated model or current output quality.

## Codex was actually invoked; its patch is not yet verified in GitHub

The implementation request was posted as an @codex comment on this PR. The connector bot returned a task report describing a compatibility gate requiring both `worldifact-standard-construction-v1` and `typed-plan-initial-edit-v1` and reporting 15 targeted tests passed. Its full local verification was blocked by missing pinned-source downloads/ancestor checkout. These are agent-reported results, not independently reproduced results on a published patch.

The claimed workspace commit `86fc0f6` was not retrievable from the GitHub commit API, and the recovery PR did not contain that runtime patch at verification time. The supplied links pointed to the older source, so they are not proof of the change. A follow-up requested a fetchable commit or the complete unified diff plus the capability producer/proxy/consumer contract. A new frontend-only denial is not a generator repair. No Codex change was merged or deployed.

## Evidence-supported leads, not a predetermined root cause

1. PR #242 implements typed scene_json/initial_edit construction, while its description explicitly does not prove installation on the original Oracle host. PR #243 is also a source-only maintenance change. The running helper/receipt revision must be inspected through authorized access.
2. The checked construction health helper advertises the basic construction policy. A separate initial-edit revision must not become a mandatory consumer gate without a proven matching producer and compatible deployment sequence.
3. Current account code contains paid-points admission, immutable pending-cost holds and incident-specific waiver semantics. An old historical tree is not a safe replacement for the current ledger and signed records. Positive points alone do not diagnose the current blocker.
4. Direct Blueprint output is not detailed Oracle/Blender generation. Keep those paths and their evidence separate.
5. The failing signed-in request, first actual failure stage, installed Oracle revision, a new accepted downloadable GLB, account-library persistence and browser/Android behavior remain unverified.

## Audit documentation correction

The initial audit-only head passed 2,042 tests. A later attempt to replace the long CONTEST_STATUS ledger with a shorter summary caused a documentation-constraint failure in hosted verification (one failed test, not a reproduced user-generation failure). The second summary update did not resolve that check. This change therefore restores CONTEST_STATUS byte-for-byte to the original known-tested blob `467ee3a6fe6b5ff5ede90d2fb808eb10c8b25d43` and keeps new audit evidence in this separate document. No test or assertion is removed or weakened. Exact-head verification must be read again after this correction; earlier green results do not cover later commits.

The original status ledger's dates, approvals and readiness statements remain historical evidence, not new permission to spend or a current successful-generation assertion. This audit's current release decision remains NO-GO.

## Immutable exclusions and release decision

No production generator source, billing, prices, products, subscriptions, grants, point balances, provider funding, holds/waivers, settlement, account ownership, databases, original models or saved jobs have been changed by this audit PR. No paid model/API call, Oracle installation, main merge or Cloudflare deployment was performed.

No Desktop Commander device was connected during the audit. Public source and offline CI are available, but authenticated original-host and failing-account evidence is still required. Do not bypass encrypted host reports or expose credentials to obtain it.

A safe release requires the correct installed runtime, a reviewed compatible patch, exact-head green CI, original-asset/account safeguards and a new authenticated end-to-end acceptance test. A new paid test needs fresh explicit owner approval of a bounded cost; never rerun an old one-off grant/job/workflow or remove a guard to simulate success. Deployment must preserve remote financial variables and pass the existing exact-parent/preservation controls. Do not merge on CI alone.
