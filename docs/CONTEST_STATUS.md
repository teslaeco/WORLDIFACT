# WORLDIFACT status — 17 September 2026

## Current urgent task: replace the failed embedded entry

Owner Android screenshots at 05:04 show the production Shop's embedded Froge UI asking the user to sign in again and unable to read its saved Oracle connection. They do not establish an old deployed version, erased connection or a failed Oracle server.

The production source already targets the exact owner-selected generator:

https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

The old `forge-studio-public` brief exporter is not that target. Do not replace the live Studio with an older repository snapshot or attempt to copy/bypass its authenticated session.

## Implemented fix — PR #29

PR: https://github.com/teslaeco/WORLDIFACT/pull/29

Branch: `fix/shop-top-level-studio-20260917`, based only on production main `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`. Broader English/quality PR #28 remains separate.

- Removed the Studio iframe, its shell and old frame CSS from `/shop`.
- A top-level Shop visit opens the exact original Studio with `location.replace`. Replacing the launcher entry prevents Back from bouncing through `/shop` again.
- An explicit top-level anchor and a safe new-tab anchor remain visible if automatic opening is denied. Embedded WORLDIFACT does not automatically navigate its ancestor.
- No query strings, hashes, tokens or prompts are forwarded. No timers, automatic login, cookie manipulation, Oracle pairing, paid POST, archive read, model download or quota change.
- The original hosted generator, its stored work, language and model quality are unchanged. This is an entry repair, not installation of a new generator build.

## Verification

| Check | Status | Evidence / boundary |
|---|---|---|
| Android re-login failure in embedded UI | OWNER SCREENSHOT VERIFIED | No private session headers or backend traffic inspected |
| Exact generator destination | SOURCE VERIFIED | Canonical `REFERENCE_LINKS.modelGenerator` retained unchanged |
| Cookie/server root cause | UNKNOWN | Cross-site session restrictions are plausible, not proved on this device |
| No-iframe/direct navigation source | IMPLEMENTED / TESTED | Actual Shop server-render and captured-effect regression tests |
| Full verification | PASS | Reviewed head `ce1cf8a8e9af9530bba734dd4ec8db162825c4f0`, run `35177256931`, job `105061604113`: locked install, full verify, pinned foundation assembly, Worker dry-run and read-only hosted probe step all succeeded |
| Browser authentication / real generation | NOT TESTED | Tests use test window objects; no authenticated Android/browser or fresh model generation is claimed |
| PR #29 publication | NOT DEPLOYED | Ready for scoped merge/release review; a source/CI success is not production publication |
| PR #28 compatibility | HANDOFF RECORDED | Comment `5707899926` warns that its old Shop-iframe assertion must change after adoption, and the failed frame must not return |
| New paid generation | NONE | No paid model API/GPU job, quota increase, secret change, Oracle install or private data migration |
| Contest release | NOT ASSESSED / NOT SUBMITTED | This repair is not a new competition-readiness decision |

Verification run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35177256931

The regression suite checks the exact original URL, absence of iframe/legacy form, no query/token forwarding, repeated effect setup causing only one navigation, no automatic ancestor navigation, denied-navigation fallback, five-world links and no paid/storage side effects. Existing safety checks remain in place. The previous iframe assertion was replaced because the owner-reported failure changes the intended product behavior; it was not removed to conceal a failure.

The user may still need to sign in to the existing account on the original Studio page. Do not tell the user that Oracle was reconnected or that all generation/quality issues are resolved merely because entry no longer uses a frame.

Background on the session hypothesis, not device evidence: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value . SameSite rules distinguish top-level navigation from cross-site iframe requests.

## Release boundary

Publish only PR #29 under the applicable approval, not the wider PR #28 or its upstream source changes. Keep all native paid gates/markers unchanged. Record the actual merge SHA and final production deployment/smoke outcome after release. Authenticated device use remains separate from HTTP/static checks. No bypass of prior browser/security restrictions is allowed.

Historical iframe-first instructions in `docs/CODEX_TASK_FROGE_HOSTED_GENERATOR.md` are superseded for the Shop entry by PR #29. The canonical generator URL is not superseded.

## Historical production and review evidence

The complete previous production ledger is preserved at:
https://github.com/teslaeco/WORLDIFACT/blob/495a6524d7b597403eefd5b62bfbf8ee9fedc4e0/docs/CONTEST_STATUS.md

PR #27 merged `e2446816708783532a26c2c949c733e19ca84e96` and deployed in run `35154269208`; public HTML/assets/DEMO smoke passed. Its 102 tests and HTTP 200 probe did not prove authenticated iframe usability. Owner device evidence now demonstrates that missing gate.

The paid pilot workflows skipped their paid/re-arm steps on that release. This fix changes neither those markers nor their configuration. Review-only English/model improvements remain on PR #28 and separate upstream branches. Their GitHub snapshots are not assumed identical to the current hosted Studio.

## Truth boundary

Keep source saved, CI passed, deployed, authenticated session and actual generation as separate facts. Removing an iframe does not translate the external UI, restore an account, install a new model, improve texture detail or establish manufacturing readiness. Preserve the original generator and all saved user work.
