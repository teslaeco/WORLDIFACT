# WORLDIFACT status — 17 September 2026

## Current correction: Studio ON the WORLDIFACT page

The owner rejected PR #29's top-level redirect because it removes the visible way back to WORLDIFACT. The corrected requirement is **the original Studio inside WORLDIFACT, with a persistent return link**, not another redirect and not a new generator.

**PR #30 is implemented and its first complete CI passed. It is not merged or deployed.** The last documentation-only update needs the final-head CI check before release.

- PR: https://github.com/teslaeco/WORLDIFACT/pull/30
- Branch: `fix/shop-stay-in-worldifact-20260917`
- Verified source head: `fbd02d9e6691ffb3f02d1b2117dae529cfe69727`
- Full verification: https://github.com/teslaeco/WORLDIFACT/actions/runs/35182183652
- Job: `105076523433`, every step SUCCESS: locked install, full verify, foundations, Worker dry-run and read-only hosted probe step.
- Production remains PR #29 merge `3f22fe5a8b4844d1415a35a622c061a9c19d48d2`, documentation main `b71b89db53343930e990369b70eebefb07cdc87c`.
- Exact Studio: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/
- WORLDIFACT entry: https://worldifact.xodobrox.workers.dev/shop

## Implemented behavior

1. No `location.replace`, navigation effect, `_top` or same-tab external links. Opening Shop does not navigate the WORLDIFACT document away.
2. A sticky parent toolbar keeps a real `Back to WORLDIFACT` link (`/`), Studio title, all five world links and session controls outside the embedded app.
3. The exact Studio appears in a bounded normal-flow iframe. Its cross-origin sandbox permits reviewed app capabilities but grants **no top-navigation permission**. No proxy, credentialless mode, script injection or cookie/token copying.
4. Sign-in/full Studio access is an ordinary `_blank` anchor with `noopener noreferrer`; WORLDIFACT stays open. No authentication claim or automatic reload on focus, load, login or tab return.
5. Only explicit `Reload Studio view` may recreate the iframe, after a warning about unsent text/photos. Cancelling preserves the frame. A wrapper reload neither cancels a server job nor submits another generation.
6. English help says separate-tab sign-in might not share a session with the embedded view. The separate Studio tab remains available without replacing WORLDIFACT.

This corrects navigation/return behavior. The earlier failing authenticated iframe is **not** claimed repaired merely by restoring embedding. The live generator's source, accounts, saved models, original quality and backend remain unchanged.

## Evidence matrix

| Check | Status | Boundary |
|---|---|---|
| Explicit in-page requirement | VERIFIED | Latest owner feedback supersedes the redirect-only entry decision |
| Actual Shop source/handler tests | PASS | Eight updated regressions using rendered TSX and its real reload handler with test adapters |
| Exact Studio and permanent return | SOURCE / TEST PASS | Return anchor precedes/is outside frame; no parent navigation effect; scoped sticky toolbar |
| New-tab-only authentication fallback | SOURCE / TEST PASS | Only external anchor uses `_blank` + `noopener noreferrer`; no `_top`, `_self` or `_parent` |
| Sandbox navigation boundary | STATIC CONTRACT PASS | Top navigation not granted; normal reviewed capabilities retained; no claim of a real browser sandbox run |
| Unsaved-work preservation | HANDLER TEST PASS | Cancelled reload keeps key; confirmed reload changes only frame key; rerenders do not reload |
| Full code/build/package verification | PASS | Run `35182183652` on source head above |
| Authenticated embedded generation | UNKNOWN / PREVIOUS OWNER ERROR | Existing re-login screenshot is still failure evidence; no fresh model job or authenticated device test |
| Android visual behavior | NOT TESTED | CSS/source/SSR evidence, not a physical-device screenshot or WebGL test |
| Production release | NOT PERFORMED | Merge/deploy is a separate gated step; current production still has PR #29's redirect |
| New paid operations | NONE | No new model/GPU request, quota, secret, Oracle installation or private archive migration |
| Wider PR #28 | NOT INCLUDED | Comment `5708560274` records the newest contract and warns against restoring #29's redirect when reconciling |

The eight Shop regressions cover embedded target/parent return, separate-tab fallback, frame permissions, stable rerender/no auth claim, cancelled reload, confirmed frame-only reload, five-world links and absence of paid/storage/navigation side effects. Old redirect assertions were replaced because the user rejected that behavior, not to hide a failing build.

## Browser documentation, not device proof

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe — nested documents, sandbox permissions and load/error limitations.
- https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies — embedded authentication depends on cookie/storage policy.

Signing in in a separate tab does not guarantee cookie access in a cross-site frame. No security restriction is bypassed. A complete integrated login solution still requires the actual hosted source and session contract. HTTP/source checks do not prove generation.

## Release and continuity

Keep all paid-pilot markers/configuration unchanged. Release only this four-file correction under the applicable merge/production authorization, not #28 or upstream source changes. Record the actual merge SHA, deployed version and public smoke only after success. Model quality, complete English localization, private Site updates and contest submission remain outside this fix.

Historical iframe-first and redirect-only instructions are superseded for this UI by the current **in-page Studio + persistent WORLDIFACT return + separate-tab sign-in/fallback + confirmed manual reload** contract.

PR #29 did deploy successfully in run `35180772180`, version `3904adb7-9354-4d3b-87d1-a07c24cc54d8`, with 105 tests and static smoke. That did not prove accepted navigation or authentication. Previous production ledger is preserved at https://github.com/teslaeco/WORLDIFACT/blob/b71b89db53343930e990369b70eebefb07cdc87c/docs/CONTEST_STATUS.md.
