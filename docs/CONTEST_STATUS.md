# WORLDIFACT status — 17 September 2026

## PR #29 released: original Froge Studio without the failed iframe

The owner explicitly authorized merging and deploying this scoped entry repair. **PR #29 is merged and deployed to production.** The larger localization/quality PR #28 and its upstream source changes were not merged.

- PR: https://github.com/teslaeco/WORLDIFACT/pull/29
- Reviewed PR head: `5080dd450eca746e93610b3ef133c927e06be38b`
- Application merge: `3f22fe5a8b4844d1415a35a622c061a9c19d48d2`
- Production Shop: https://worldifact.xodobrox.workers.dev/shop
- Cloudflare version: `3904adb7-9354-4d3b-87d1-a07c24cc54d8`
- Published and public smoke verified: 17 September 2026, 04:09:26 UTC.

The exact original generator remains:

https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

## Deployed behavior

The Studio iframe and obsolete frame styles have been removed from `/shop`. A top-level Shop visit opens the original generator in its own full browser document with `location.replace`, avoiding a Back-button bounce through the launcher. Visible top-level and new-tab links remain available if automatic opening is denied. Embedded WORLDIFACT never automatically navigates its ancestor.

No prompt/query/hash/token is forwarded. There is no automatic login, cookie copying, Oracle pairing, model generation, JSON brief download or source replacement. The hosted Studio's code, accounts, archive, language, models and quality are unchanged. This release repairs entry, not the model generator itself.

The owner's 05:04 Android screenshots showed re-login errors and an unreadable saved connection inside the iframe. They did not prove that an old generator build was served or that Oracle had failed. The exact cookie/server root cause remains UNKNOWN. Normal account sign-in may still be needed on the original Studio page.

## Verified release evidence

| Check | Result | Evidence / boundary |
|---|---|---|
| Final PR CI | PASS | Run `35177396129`, exact reviewed head `5080dd4...`; no review comments or changed head blocked release |
| Post-merge main CI | PASS | Run `35180772209`, job `105072222470`; verify, foundations, Worker dry-run and read-only hosted probe steps succeeded |
| Production release | PASS | Run `35180772180`, job `105072222555`; deployed application merge `3f22fe5...` |
| Tests in deployed source | 105/105 PASS | Full test output in deployment log; lint nine warnings / zero errors; TypeScript and production build passed. This is the isolated production baseline, not PR #28's larger suite |
| Public release smoke | PASS | 13 HTML routes, 23 matching hub assets, 102 original-app entries/assets, API 404, DEMO generation and origin rejection passed at 04:09:26 UTC; no paid API call |
| Active Shop source | VERIFIED | Exact original Studio URL retained, iframe removed, guarded top-level navigation and manual fallbacks tested |
| Authenticated Android/browser generation | NOT TESTED | Source/effect tests and HTTP asset hashes do not prove account login or a freshly generated GLB. A separate web-tool open was unavailable; no browser/access workaround was attempted |
| Native paid configuration | DISABLED | Deployed `ENABLE_PAID_GENERATION=false`, `ENABLE_ORACLE_JOBS=false`, `PUBLIC_PILOT=false`, request limit 0; independent hosted Studio settings untouched |
| Downstream paid/re-arm workflows | SKIPPED AFTER GATES | P0 run `35180849177`, Shop arm `35180849200`, recovery `35180849289` all skipped paid/deployment steps; no new generation or pilot re-arm |
| Artifact-review workflow | SKIPPED AFTER GATE | Run `35180849210` skipped model retrieval and private artifact upload |
| Existing release secrets | SYNCHRONIZED BY UNCHANGED WORKFLOW | Existing GitHub environment values synchronized server-side; no new credentials supplied or disclosed. Configuration is not generation evidence |
| PR #28 | NOT MERGED / NOT DEPLOYED | Remains a draft at observed head `65e1e5cb413502d4b6f17248c5396870252a94d8`; must reconcile with updated main and rerun CI before any later approved merge |
| Contest submission | NOT PERFORMED | This is a scoped production repair, not a new contest-rules or final-readiness decision |

Release logs: https://github.com/teslaeco/WORLDIFACT/actions/runs/35180772180

Main CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35180772209

Final PR CI: https://github.com/teslaeco/WORLDIFACT/actions/runs/35177396129

The Shop regression tests exercise the actual component and captured effect: exact destination, no token/query forwarding, effect replay once, no automatic ancestor navigation, denied-navigation fallback, five-world links and no generation/storage side effects. They are not authenticated device tests.

## Preservation and follow-up

Only PR #29's four-file patch was released. No hosted generator or saved model was deleted, migrated or replaced by a GitHub snapshot. The former `forge-studio-public` exporter is not the destination. The prior iframe-first task document is superseded only for Shop entry; the canonical generator URL is unchanged.

PR #28's five-pass quality and English work remains separate. Its later source already incorporates no-iframe behavior, but the observed PR is not mergeable against the new main and still needs reconciliation, fresh CI and its own release authorization. Do not restore the failed iframe while resolving those differences.

## Historical evidence

Pre-release ledger: https://github.com/teslaeco/WORLDIFACT/blob/3f22fe5a8b4844d1415a35a622c061a9c19d48d2/docs/CONTEST_STATUS.md

Earlier production ledger: https://github.com/teslaeco/WORLDIFACT/blob/495a6524d7b597403eefd5b62bfbf8ee9fedc4e0/docs/CONTEST_STATUS.md

PR #27 was deployed as `e2446816708783532a26c2c949c733e19ca84e96` in run `35154269208`. Its successful HTTP smoke did not prove iframe session usability; the subsequent owner screenshots exposed that gap. PR #29 removes the embedded entry instead of disguising the authentication failure as an older model version.

## Truth boundary

Keep source saved, tests passed, production deployed, account access and actual generation separate. Removing an iframe does not translate the external UI, restore Oracle, install a newer generator, improve model/texture fidelity or establish manufacturing readiness. No new paid generation or competition submission occurred in this release.
