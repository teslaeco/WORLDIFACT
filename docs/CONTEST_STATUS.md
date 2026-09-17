# WORLDIFACT status — 17 September 2026

## Current urgent task: remove the failed embedded Studio

Owner Android screenshots `Screenshot_20260917-050429.png` and `Screenshot_20260917-050423.png` show the production Shop's embedded Froge UI asking the user to sign in again, unable to check its saved Oracle connection and displaying initial connection fields. Screenshots are user-supplied evidence; private browser session/response headers were not inspected.

The production source **already uses the exact original generator URL**:

https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

This does not prove which hosted source revision that user received. A log-in error is not proof of an old deployment, erased connection or broken Oracle server. The literal old `forge-studio-public` brief-export site is not the active target.

## Scoped repair

PR: https://github.com/teslaeco/WORLDIFACT/pull/29

Branch: `fix/shop-top-level-studio-20260917`, based only on production main `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`. The larger English/quality PR #28 is separate and has not been merged into this repair.

| Item | Status | Evidence / limitation |
|---|---|---|
| Embedded authentication failure | OWNER SCREENSHOT VERIFIED | Re-login message and unavailable saved connection inside the Shop iframe |
| Exact active destination | SOURCE VERIFIED | `REFERENCE_LINKS.modelGenerator` uses the exact original Studio identified by the owner |
| Cause at cookie/server level | UNKNOWN | Cross-site session restrictions are plausible, but no cookie/header/device capture proves the precise cause |
| Removal of iframe | SOURCE IMPLEMENTED | ShopPage renders no iframe, object, embed or replacement prompt form; obsolete frame CSS removed |
| Original-app opening | SOURCE IMPLEMENTED | Top-level `/shop` navigates once to the exact original Studio using `location.replace`; Back does not revisit a launcher entry added by the Shop navigation |
| Fallback / nested WORLDIFACT | SOURCE IMPLEMENTED | Permanent top-level and new-tab anchors. When WORLDIFACT is itself embedded, automatic ancestor navigation is not attempted. Denied navigation leaves links usable without a retry loop |
| Regression tests | CI PENDING | Actual Shop source/server-render plus captured effect tests: fixed destination, no forwarded query/token/hash, replay once, nested-frame guard, denied-navigation fallback, English navigation and no native paid or storage actions |
| Live Studio source/quality | UNCHANGED | No older snapshot, model asset, new UI language, Oracle installer or quality patch is published to the original app |
| New paid operations | NONE | No generation job, API/GPU budget change, token/cookie copy, secret change, account migration or archive deletion |
| PR #29 deployment | NOT YET DEPLOYED | See PR checks and subsequent release evidence; do not infer publication from a source commit |
| Final competition publication | NOT ASSESSED / NOT SUBMITTED | This is a scoped entry repair, not a newly verified competition decision |

The integration now deliberately chooses a full original Studio document instead of trying to use its authenticated UI inside a cross-origin frame. The user may still need to sign in to the existing account in that original document. The repair does not automatically pair Oracle or bypass any authorization check.

MDN background on the hypothesis, not device evidence: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value . SameSite cookie rules distinguish top-level navigation from cross-site iframe requests.

## Release checks

Run the full existing `npm run verify`, foundation assembly and `npm run deploy:check` for the exact reviewed PR head. The existing read-only hosted probe is HTTP evidence only, not a logged-in session or model-generation test. Respect recorded browser blocks; do not reproduce a denied preview through another browser/CI renderer.

Publish only this scoped entry repair under the applicable approval, preserving all other production apps and native paid-generation gates. Do not use it to merge the larger PR #28, extend a pilot, submit to Product Hunt or overwrite the live Froge source. After any publication, record the exact merge SHA and final deploy/smoke result. Actual authenticated Android generation remains a separate check.

The iframe-first instructions in `docs/CODEX_TASK_FROGE_HOSTED_GENERATOR.md` are historical PR #27 instructions and are **superseded for Shop entry by this repair**. Keep the exact original app; do not reintroduce its failing automatic embedded view.

## Historical deployed evidence retained

Full previous ledger:
https://github.com/teslaeco/WORLDIFACT/blob/495a6524d7b597403eefd5b62bfbf8ee9fedc4e0/docs/CONTEST_STATUS.md

- PR #27 merged `e2446816708783532a26c2c949c733e19ca84e96` and deployed in run `35154269208`; public HTML/assets/DEMO smoke passed. That did not prove authenticated iframe usability, and the new owner screenshots reveal the failure.
- PR #27 final tests passed 102/102, plus main CI. Its no-cost HTTP HEAD returned 200. Those tests are historical, not the validation of this changed navigation behavior.
- The old paid pilot workflows skipped their paid/re-arm steps. This fix never changes their markers or limits.
- Review-only English/model work remains documented on PR #28's branch. Source parity between the live Studio and the separate Froge GitHub snapshot remains UNKNOWN; neither this ledger nor an HTTP success claims a newer hosted generator revision.

## Truth boundary

Distinguish source saved, CI passed, deployed, authenticated session and actual generation. Removing a failing iframe is not reinstalling a new generator, translating the external UI, restoring an account, raising quality or proving manufacture readiness. Preserve the original generator and all saved user work.
