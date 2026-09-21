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

## CI integration follow-up — PR #62

- [Initial run 35645529573](https://github.com/teslaeco/WORLDIFACT/actions/runs/35645529573), head `a140388de341882d3a635564181ee3d789b76357`: full lint and repository TypeScript PASS; tests 225/239 PASS, 14 FAIL. Foundations and deployment dry-run were not reached.
- All 14 failures reported the same missing test-harness dependency mapping: `Unexpected Shop dependency: ../lib/studioPromptBudget`. The new nine budget tests passed. No failed test was disabled or removed.
- Updated the actual-component render harness to import the real budget helper; validation is not mocked away.
- Added four actual Shop lifecycle regression tests covering oversized drafts with no requests, exact-limit explicit submission and double clicks, actionable server rejection, and visible GET-only recovery with unknown generation capacity.
- Updated the status fixture to advertise 5000 characters, matching the server's reviewed contract, with an explicit unknown-capacity test.
- The next exact-head CI result is NOT inferred from these edits. Read [PR #62 checks and verification comments](https://github.com/teslaeco/WORLDIFACT/pull/62) for the result associated with the actual reviewed head before any merge.

## UNKNOWN / BLOCKED

- The screenshot does not expose a request ID or response from the user's exact click. The length rejection is reproduced from source and the earlier supplied prompt, not a captured mobile network trace.
- Direct public health/status reads failed in the web tool, and shell DNS also failed. Current Oracle/API health and credit balance remain UNKNOWN.
- A complete local checkout/dependency install was unavailable. `npm run verify` stopped at the absent asset-preparation script; `npm run deploy:check` could not find Wrangler. These are local-environment blocks, not application test passes.
- Full repository CI must be read from the exact repair PR head. Browser/Android and paid end-to-end generation remain NOT RUN.

## Release gate

GO for review-branch publication. NO-GO for production until exact-head CI is green and the owner explicitly approves merge/deployment. No merge, deployment, quota increase, paid generation, supplier action or contest decision is performed by this milestone.
