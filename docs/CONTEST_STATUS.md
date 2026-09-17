# WORLDIFACT status — 17 September 2026

## Corrective task: keep the generator ON the WORLDIFACT page

The owner rejected PR #29's top-level redirect because it takes the user away from WORLDIFACT and removes the visible way back. The required behavior is now explicit: **the original Studio inside WORLDIFACT, with a persistent return link**. This supersedes the redirect-only product decision, not the canonical generator URL or authentication safeguards.

- Production baseline: PR #29 merge `3f22fe5a8b4844d1415a35a622c061a9c19d48d2`, documentation main `b71b89db53343930e990369b70eebefb07cdc87c`.
- Corrective branch: `fix/shop-stay-in-worldifact-20260917`.
- Exact Studio: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/
- WORLDIFACT entry: https://worldifact.xodobrox.workers.dev/shop

## Implemented correction — not yet released

1. Removed `location.replace`, the navigation effect and all `_top` / same-tab external links from ShopPage. Opening Shop no longer sends the WORLDIFACT document elsewhere.
2. Added a sticky parent toolbar with a real `Back to WORLDIFACT` link (`/`), Studio title, five-world navigation and session controls. It is outside the embedded app, not a control inserted into someone else's document.
3. Embedded the exact original Studio in a bounded, normal-flow iframe. The cross-origin sandbox permits its scripts/origin/forms, exports, modals, new tabs and user-activated storage requests, but grants **no top-navigation permission**. No proxy, credentialless mode, injected script or cookie/token copy.
4. Sign-in/full Studio access uses only an ordinary `_blank` anchor with `noopener noreferrer`. The WORLDIFACT tab stays open. The wrapper does not infer successful authentication or automatically reload on focus, iframe load or return from another tab.
5. Only the explicit `Reload Studio view` click can recreate the iframe, after warning that unsent text/photos may be lost. Cancelling leaves the same frame intact. This does not cancel a remote job or create a new generation.
6. English help states that the browser may still refuse to share a session with the embedded app. Using the separate Studio tab remains available without replacing the WORLDIFACT page.

The earlier failing authenticated iframe path is not claimed fixed merely by restoring embedding. This correction fixes navigation/return behavior; live authentication, model generation and hosted-source parity remain separate unverified issues.

## Evidence and tests

| Check | Status | Boundary |
|---|---|---|
| User navigation requirement | VERIFIED | Latest explicit feedback requires Studio to stay on WORLDIFACT |
| Source correction | IMPLEMENTED | Three active Shop source/test files changed, original hosted application untouched |
| Regression suite | ADDED / CI PENDING | Actual TSX rendered; real reload handler exercised with test hook/window adapters |
| Persistent return UI | SOURCE CONTRACT TESTED WHEN CI PASSES | Return anchor precedes and is outside iframe; scoped sticky toolbar and bounded frame; not physical Android layout evidence |
| Redirect prevention | REGRESSION ADDED | No navigation effect, top-level external target, forwarded query/hash, timer, focus reload or iframe-load success claim |
| Frame permissions | STATIC CONTRACT TESTED WHEN CI PASSES | Top-navigation not granted, normal reviewed capabilities retained; third-party cookie rules still apply |
| Authenticated embedded generation | UNKNOWN / PREVIOUS OWNER ERROR | Existing re-login screenshots remain valid failure evidence; not reset to PASS |
| New paid jobs / quota / Oracle changes | NONE | No paid model test, limit change, secret change, Oracle installation or private archive migration |
| Broader PR #28 | NOT INCLUDED | Localization/quality review remains separate and must adopt the newest entry contract before release |
| Production | NOT RELEASED | Only a merged, completed deployment and public smoke may change this status |

Eight Shop regressions replace the obsolete redirect assertions: exact embedded target + parent return; safe new-tab-only fallback; no top-navigation sandbox grant; stable rerenders/no auth claim; reload cancellation; confirmed frame-only reload; five-world links/truth boundaries; no paid/storage/navigation/automatic-reload side effects. These tests are not a browser session, screenshot, actual sandbox enforcement run or successful generation.

Full `npm run verify`, foundation assembly and `npm run deploy:check` are required on the final head before release. Keep all paid-pilot marker/configuration files unchanged. New tests enforce a changed user requirement rather than suppress a broken test.

## Browser reference boundary

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe — nested documents, sandbox permissions and load/error limitations.
- https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies — embedded authentication depends on cookie/storage policy.

Reviewed documentation is not proof of this user's exact cookie state. Signing in in a separate tab does not guarantee session access in a cross-site frame. No security restriction is bypassed; canonical hosted-source access is still required for a fully integrated authentication solution.

## Historical production evidence

PR #29 deployed successfully in run `35180772180` (version `3904adb7-9354-4d3b-87d1-a07c24cc54d8`), with 105 tests and HTTP/static smoke passing. That proves its redirect implementation was released, not that the user accepted its navigation or that the generator was authenticated.

The complete previous ledger is preserved at:
https://github.com/teslaeco/WORLDIFACT/blob/b71b89db53343930e990369b70eebefb07cdc87c/docs/CONTEST_STATUS.md

The earlier iframe-first task and subsequent redirect-only task are historical. The current contract is **in-page Studio + persistent WORLDIFACT return + new-tab sign-in/fallback + explicit confirmed reload**, with authentication/quality limitations retained honestly. No contest submission or new competition-readiness decision is part of this task.
