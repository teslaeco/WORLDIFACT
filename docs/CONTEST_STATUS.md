# WORLDIFACT status — browser fetch hotfix deployed, 17 September 2026

## Completed scoped repair

**PR #34 is merged and deployed.** The Android `Failed to execute 'fetch' on 'Window': Illegal invocation` defect was traced to the coordinator passing itself as the receiver of native browser fetch. The constructor now binds fetch to `globalThis` before storing it. No generator/provider, form layout, prompt, photo, receipt or archive redesign was made.

- PR: https://github.com/teslaeco/WORLDIFACT/pull/34
- Reviewed head: `2ef055b9aa337eae7ac01b384721d7ee9b4c3141`
- Merge/deployed source: `4313e9c83f0dbdecd25eac3bbb1bd978d249b30b`
- Final Cloudflare version: `df44e99c-d296-4b98-a2e7-7956a754b1fc`
- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Original hosted Studio remains unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

This is the narrow continuation of the owner's authorized Shop repair. No separate Codex/Copilot cloud-agent run is claimed; changes were made through connected GitHub tools.

## Cause and consequences

The previous constructor stored `this.fetcher = fetcher`; calls such as `this.fetcher('/api/studio/prepare', ...)` supplied the coordinator, not the Window/global receiver. The browser rejected that method invocation before network dispatch. The standalone readiness check did not use that receiver, which explains the screenshot showing Connector ready while Generate failed before a receipt appeared.

The corrected line is:

```ts
this.fetcher = fetcher.bind(globalThis)
```

It applies consistently to preparation, the single submission, status recovery and explicit artifact retrieval. The failure at the initial preparation call did not itself reserve a paid attempt. This is an analysis of that specific error path, not a full account/billing audit.

Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Called_on_incompatible_type . The actual faulty constructor and call were also read in the repository.

## Verified release and tests

| Check | Result | Evidence |
|---|---|---|
| Final-head CI | PASS | Run `35197443263`: verify, foundations, Worker dry-run and existing read-only probes |
| Normal production publish | PASS | Run `35197625660`, job `105124503630`; public HTML/assets/DEMO smoke passed |
| Preserve existing Studio window | PASS / EXECUTED | Run `35197712616`, job `105124782866`; all steps completed, including real counter read, conditional deployment and final readiness verification |
| Complete final-source tests | **155/155 PASS** | Final continuation log at 08:04:53 UTC; zero failed/skipped/cancelled tests; lint 9 warnings / 0 errors; TypeScript, HTTP, build and reviewed foundations passed |
| Fresh paid model request | **NOT REQUESTED** | Tests use controlled responses; final status log records `paidGenerationRequested: false` |

Three new receiver-sensitive regressions demonstrate the old error before transport, exercise the real default constructor through prepare/one submit/poll/GLB/PBR, and check injected fetch plus lost-response/reload recovery without another submission. The old Node fetch and arrow-function mocks did not enforce this browser API requirement. The new tests explicitly model it; they are not a physical Android or real browser session.

A further regression proves hotfix publication cannot extend the original deadline or enable an expired window. Existing tests were retained.

Direct evidence:

- https://github.com/teslaeco/WORLDIFACT/actions/runs/35197443263
- https://github.com/teslaeco/WORLDIFACT/actions/runs/35197625660
- https://github.com/teslaeco/WORLDIFACT/actions/runs/35197712616

## Actual allowance after publication

The final public read-only verification at **2026-09-17T08:05:30.720Z** (10:05 Poland/Netherlands) returned:

```json
{
  "ready": true,
  "used": 5,
  "remaining": 1,
  "expiresAt": "2026-09-17T09:23:37.535Z",
  "paidGenerationRequested": false
}
```

The hotfix preserved **one unused attempt within the original absolute cumulative ceiling of six**. It did not reset/refund the counter, add credits or start another three-hour window. The deadline remains **09:23:37 UTC / 11:23:37 Poland and Netherlands, 17 September 2026**, or generation stops earlier if that last attempt is reserved. This is the timestamped result, not an indefinitely current balance.

An ordinary deployment temporarily uses the disabled-cost base. The existing guarded continuation restored only the still-unused capacity and pinned the already activated deadline. It rejects unknown counter/readiness, used >= 6, and expiry. Signed Studio jobs remain separate from disabled legacy public Oracle and procedural world-blueprint spending. No new key, provider configuration, Oracle installation or private-data migration occurred.

This documentation-only `[skip ci]` update must not redeploy and close the window. Future source releases must recheck remaining capacity and the original expiry, not automatically extend them.

## User-facing recovery

Existing open browser tabs may still contain the previous JavaScript. Preserve unsent text before reloading the Shop to obtain the new bundle; do not clear browser storage, since that can remove receipts and the local archive. Submit a new job only through an explicit Generate click. Once a receipt exists, use Recover this job / reload result instead of creating another generation because of a network error.

## Unchanged product boundaries

The native Shop stays within WORLDIFACT with a return link and all five worlds. The half-skull character is an existing example, not a generated replacement result. Original Froge remains an optional separate tab; its private account/archive and hosted source were not changed.

Actual fresh AI generation, physical Android/WebGL interaction, visual likeness, native 4K/8K detail and complete export-material equivalence are **not tested by this hotfix**. Connector readiness, source tests and deployment are separate from successful generated output. Device archive is not a public product catalog. MAKE stays validation-required. No contest decision or submission is performed.

Earlier full release ledger, including PRs #28–33 and their evidence: https://github.com/teslaeco/WORLDIFACT/blob/3c7307ac594f2e37df55e6bf0ed5434b4e132ad8/docs/CONTEST_STATUS.md . The original implementation brief remains `docs/CODEX_TASK_SHOP31_FINISH.md`.
