# WORLDIFACT status — browser fetch hotfix, 17 September 2026

## Current incident

The owner supplied an Android screenshot at 09:51 showing **Connector ready / remaining 1 / reserved 5**, then:

`Failed to execute 'fetch' on 'Window': Illegal invocation`

This is a client-side invocation error, not evidence of an invalid prompt, exhausted API credits, Oracle outage, authentication failure or new-model quality. The previous release's green Node/API/SSR checks did not prove browser interaction; that gap is now explicitly covered with receiver-sensitive transport regressions.

## Confirmed cause and source correction

PR https://github.com/teslaeco/WORLDIFACT/pull/34 uses branch `fix/studio-fetch-receiver-20260917`, based on main `3c7307ac594f2e37df55e6bf0ed5434b4e132ad8`.

`StudioCoordinator` stored the browser function as `this.fetcher = fetcher`, then invoked `this.fetcher(...)`. That supplies the coordinator as `this`, which the browser Window fetch rejects. The standalone connection check does not use that receiver, explaining the green readiness panel and failed Generate action.

The runtime change is limited to binding once in the constructor:

```ts
this.fetcher = fetcher.bind(globalThis)
```

This covers free receipt preparation, the single submission, status recovery and artifact reads. It does not change prompts, model/provider, Oracle configuration, input schemas, receipts, archive data or retry semantics. The failure at the first preparation call occurs before server dispatch or paid reservation for that call; it is not a new full-account usage audit.

Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Called_on_incompatible_type documents Illegal invocation from an incompatible `this`. The actual faulty call and constructor were read in the current repository, not inferred from that documentation alone.

## Regression coverage

`tests/studio-fetch-receiver.test.ts`:

- Reproduces the old raw-property call and proves the receiver check throws before transport activity.
- Uses the real coordinator's default fetch path with a receiver-sensitive function for prepare, one submit, poll, GLB and PBR retrieval.
- Verifies injected fetch, lost acceptance and restored same-job recovery without a second submission.

These use deterministic controlled responses; they are not real browser/WebGL or live AI-generation tests. Existing tests remain in place. Full final-head verify, foundation assembly and Worker dry-run are required before release.

## Preserve the existing allowance during this repair

The previous verified activation in run `35189566878` used five cumulative attempts, left one, and had deadline **2026-09-17T09:23:37.535Z** (11:23:37 Poland/Netherlands).

An ordinary main deployment uses the disabled-cost base. The hotfix therefore updates the existing one-time resume marker, with the same read-only usage/readiness guards, but **pins the deadline to the already activated timestamp** rather than opening another three hours. Tests verify no added attempts, no reset, no deadline extension and refusal after expiry.

Maximum remains **six attempts cumulatively**, not six new requests. The actual remaining count must be re-read after publication; a screenshot is not an indefinitely current counter. Unknown counter/readiness, used >= 6 or the original deadline passing means no activation. Legacy public Oracle and procedural-blueprint spending remain disabled. No paid generation is requested by this repair.

## Production baseline and pending hotfix

Before PR #34, deployed source is `69fb684914450508d48433b49e7581801acac81b`, version `612d5a88-be90-4bdd-994c-e4f958b96e06`.

PRs #31–33 delivered the in-page Shop and passed 151 tests plus release/public smoke, but the owner's screenshot is evidence of a browser action failure in that release. Do not describe it as a proven working generation flow. The current hotfix is not deployed until actual release evidence is recorded below.

- Shop entry: https://worldifact.xodobrox.workers.dev/shop
- Original Froge preserved: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/
- Earlier complete release ledger: https://github.com/teslaeco/WORLDIFACT/blob/3c7307ac594f2e37df55e6bf0ed5434b4e132ad8/docs/CONTEST_STATUS.md
- Original execution brief remains `docs/CODEX_TASK_SHOP31_FINISH.md`.

## Release and truth boundaries

This narrow defect correction continues the owner's authorized Shop repair; no new application design, provider, external Studio replacement, account/secret change or competition submission is involved. Do not edit the user's reference images or private archive. No paid test or new spending approval is implied.

Keep code verification, deployment, current connector/allowance readiness and fresh successful generation as separate outcomes. Native 4K/8K detail, visual likeness, complete hosted-source localization, public product catalog and manufacturing readiness remain unproven. MAKE remains validation-required. No physical Android or prohibited browser test is claimed.

Record final-head CI, merge/deploy SHA and the independently observed unchanged-window outcome after publication. The final documentation-only update must not redeploy and disable that window.
