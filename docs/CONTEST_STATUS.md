# WORLDIFACT — Shop prompt validation milestone

Date: 21 September 2026. Scope: generation-start diagnosis and a review-branch UI repair; no release or new AI generation.

## Previous evidence preserved unchanged

The complete preceding ledger, including the project-attachment release, Oracle installation boundary and earlier LIVE records, is preserved byte-for-byte in [CONTEST_STATUS_BEFORE_SHOP_PROMPT_FIX_20260921.md](CONTEST_STATUS_BEFORE_SHOP_PROMPT_FIX_20260921.md), Git blob `ce73ca1780c7a608025c48548b4f4d0b5d019e07`. Those records are historical, not fresh health measurements.

## VERIFIED — source and local tests

- Reviewed main `360b9e0a9d86cfcf9f395a448d636c1073fc75b4`, Shop, Studio coordinator, protocol and server preflight.
- Reproduced the supplied 3751-character prompt exceeding the worker limit: default figurine/4096 export suffix is 1555 characters; complete payload is 5306 versus a maximum of 5000. The prior UI admitted up to 4000 draft characters and replaced the specific rejection with a generic error.
- Implemented a worker-aware description counter, local pre-submit length guard, actionable allowlisted request errors near the Generate button, and visible same-job recovery without creating a new job.
- Kept prompt content, mandatory export/manufacturing rules, generation settings, limits, keys, quotas and application routes unchanged.
- Nine focused regression tests PASS locally; helper strict TypeScript check PASS; Shop TSX syntax check PASS.
- Details and reproduction: [SHOP_PROMPT_AUDIT_20260921.md](SHOP_PROMPT_AUDIT_20260921.md).

## VERIFIED — repair CI on code revision 9523417

The reviewed code/test revision is `952341765de2cdb73c5e712eea52b9b1a1260ee9`. This ledger-only follow-up does not change the runtime or tests. Check the latest [PR #62 checks](https://github.com/teslaeco/WORLDIFACT/pull/62) again before merging; a previous passing revision does not certify unrelated later changes.

- [Verify WORLDIFACT — run 35646273994](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646273994): **SUCCESS**. Includes full lint, repository TypeScript, unit/integration tests, local HTTP smoke, build, pinned foundation assembly, Worker deployment dry-run and the existing hosted-Studio access check.
- [FAST worker review — run 35646273993](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646273993): worker job **SUCCESS**, including deterministic Blender fixtures, not a paid model request or a production performance claim.
- [FAST installation review — run 35646274056](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646274056): **SUCCESS**.
- [FAST launcher review — run 35646274141](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646274141): **SUCCESS**.
- [Oracle project-file patch review — run 35646274015](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646274015): **SUCCESS**, not evidence that the patch is installed on the live Oracle VM.
- Four added actual Shop lifecycle tests cover oversized drafts without any request, exact-limit explicit submission and double clicks, actionable server rejection, and visible GET-only recovery while unknown capacity blocks new generation. These use the real component, budget helper and StudioCoordinator with deterministic transport/storage adapters.

### Earlier CI failures and corrections

- [Run 35645529573](https://github.com/teslaeco/WORLDIFACT/actions/runs/35645529573), head `a140388de341882d3a635564181ee3d789b76357`: full lint and repository TypeScript passed; tests 225/239 passed and 14 failed because the test harness did not map the new helper import. The real helper was added to the mapping, not replaced by a stub.
- [Run 35646074933](https://github.com/teslaeco/WORLDIFACT/actions/runs/35646074933), head `855511f0ef37616110fca993cd6c0cb032914917`: tests 242/243 passed. The remaining new error-display test exposed the test VM's distinct Error constructor: imported client exceptions failed the component's instanceof check in the harness. Sharing the host Error constructor models the single browser realm and preserves the genuine error message. The specific-message assertion remains in place.
- No failing test was removed, skipped or weakened. Existing render tests continue to cover all main portal entries.

## UNKNOWN / BLOCKED

- The screenshot does not expose a request ID or response from the user's exact click. The length rejection is reproduced from source and the earlier supplied prompt, not a captured mobile network trace.
- Direct public health/status reads failed in the web tool, and shell DNS also failed. Current Oracle/API health and credit balance remain UNKNOWN; those access limitations do not establish an outage.
- A complete local checkout/dependency install was unavailable. Local full verify/dry-run were blocked by missing files/dependencies. The GitHub CI results above supply the full-check evidence instead.
- No physical Android test, production Shop visual pass or paid end-to-end generation was performed. Existing fixture tests are not evidence of a new live model.

## Release gate

GO for the reviewed repair subject to the latest exact-head checks and explicit owner merge/deployment approval. Production is unchanged. No merge, deployment, quota increase, paid generation, supplier action or contest decision was performed by this milestone.
