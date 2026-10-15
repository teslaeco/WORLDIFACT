## 2026-10-16 — Two paid owner reference trials requested; no fabricated 3D results

**INPUT PREPARED / NO RUNPOD GPU / NO ASTRA INFERENCE.** Owner supplied exact ECOMECH V4 and Halloween music room PNG references plus QA board; approved two paid tests and asks for two actual 3D model URLs. Private source input ZIPs and mask candidates are held in the user's ChatGPT session, not copied into the public repo. Source-pack validation and synthetic tests added on an isolated branch. Provider account GET verified zero RunPod endpoints, PR #305 remains nonmergeable and commercially restricted nvdiffrast PBR path remains blocked. Halloween scene requires multi-object scene construction, which PR #305 does not support. No paid inference executed, no model URLs can honestly be issued. See docs/REFERENCE_TRIALS_20261016.md.

---

## 2026-10-16 — RunPod/R2 credentials present in GitHub, safe production preflight staged

**SCREENSHOT EVIDENCE / NOT CONNECTED / NOT DEPLOYED / ZERO GPU SPEND.** Owner screenshots show Production has 14 environment secrets and 4 variables, including R2, RunPod and Oracle. The R2 S3 endpoint variable looks like a literal explanatory placeholder, not a URL: fail closed until corrected. RunPod key had returned 403 on a prior v1 check; owner now reports restricted Read/Write scope and a USD 33 RunPod budget, neither independently validated. Draft #305 stays unmerged; its offline provider and real Blender fixture CI passed, with flaky ISS source timeout cleared by rerun.

**IMPLEMENTATION:** Add read-only RunPod REST v2 connection and private R2 atomic create/read/duplicate/delete one-object preflight, offline tests and separate marker-gated trusted-main-only GitHub workflow. No Production secrets used from PR, no GPU endpoint created, no model loaded, no paid request, no merge/production deployment. Approval to merge narrow preflight and subsequent marker-only main commit are still required. Details: docs/RUNPOD_R2_PREFLIGHT_20261016.md.

---
# 15 October 2026 — My World / AI Shop / AI Game Lab separation (branch only)

Status: **IN PROGRESS / NOT DEPLOYED**. No merge, paid generation, export build, secret, billing adjustment, or production deployment performed. Changes on [feature/my-world-game-lab-separation](https://github.com/teslaeco/WORLDIFACT/tree/feature/my-world-game-lab-separation).

## Scope: six original experiences preserved
- VERIFIED IN SOURCE: /chess, /iss, /planets, /shop, /lab, /terra remain registered in src/config/foundations.ts. The original five 3D meadow portal IDs remain unchanged in src/config/portals.ts; Earth observation remains reachable as the sixth experience.
- AI Shop: removed duplicate PortalAstraGenerator drawer, added link to My World. Detailed Studio generation, existing saved jobs, models, billing, and recovery untouched.
- My World (/account/worlds): remains existing private account-scoped scene editor, now contains the historical WorldBlueprint studio behind a collapsible panel; explicit validated object import and save-to-Game-Lab handoff. Legacy /builder redirects to My World.
- AI Game Lab (/lab): new exclusive saved-world playtest, simulated rover driving, validated local speed/steering/render tuning, private-world revision-checked save. Individual GLB files remain device-local, not automatically exported with the game.
- 8 Planets: explicit experimental/under-development confirmation screen before preview.
- SUBSCRIPTION GAME EXPORT: **BLOCKED / PLANNED**. Windows, Linux and Android build buttons are disabled. They must remain disabled until an authenticated server-side entitlement check, actual build pipeline, reliable artifacts, cost/quotas and security tests exist. No fake downloadable games or inferred membership.
- Gameplay parameter speed is a simulation target in km/h, not calibrated real-world physics. AI text-to-script and full physics engine not yet connected.

## Gates before any production deployment
- [ ] CI lint, typecheck, unit/integration tests, build, Wrangler dry-run all PASS on this branch.
- [ ] Review API authentication, game persistence, older-world compatibility, account switching, conflicts.
- [ ] Android/desktop layout and WebGL fallback smoke tests; verify portal links and 8 Planets notice.
- [ ] Owner explicitly reviews GO/NO-GO and authorizes merge/release.
- [ ] Subscription-only cross-platform downloadable games remain separate BLOCKED milestone, not delivered by this UI refactor.

---

# 15 October 2026 — Single Chess menu and native unload protection: VERIFIED LIVE

## VERIFIED source and merge
- [Cube Chess PR #146](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/pull/146) merged as `3658ed1c5c1f83fe417f7a59218b8a439090cf0e`. Exact tested source `8f519bc37dd850dc886cbbaab02e0bcc0320f07e` passed the original game tests/build and [desktop+mobile browser menu/navigation matrix #38719645010](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38719645010), both browser jobs SUCCESS. The tests confirmed exactly one in-game Exit control, a native beforeunload prompt during a real reload, cancel preserving the match, and no prompt after confirmed in-document exit. They also cover the existing game menu, About and premium HUD layout.
- [WORLDIFACT PR #301](https://github.com/teslaeco/WORLDIFACT/pull/301) merged as `d514699367675ad83e11d117688ae345567ab30d`, pinning the exact reviewed Chess source. [Verify WORLDIFACT #38719688102](https://github.com/teslaeco/WORLDIFACT/actions/runs/38719688102) and the four independent safety workflows all passed: full `npm run verify`, pinned Chess/Terra foundation assembly, Wrangler dry-run and read-only Studio inspection.

## User-requested behavior
- During a real Chess game the original small Menu control is hidden/disabled, so the top bar has only one visible **Exit to menu**. A literal escaped newline in the hide rule was diagnosed using failed [browser run #38718051008](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38718051008), and fixed before the successful desktop/mobile rerun. The start/demo menu remains available.
- The existing Exit action still confirms loss of the current unfinished match without reloading. Saved games, profile, AI constraints, credits and 3D models are unchanged.
- Browsers receive a standards-based `beforeunload` request for a real active/paused/finished match when the user refreshes, enters another address or closes the tab. No warning is requested for the demo or after a deliberate in-app Exit. Browsers choose the wording and can skip prompts on some mobile app terminations; this is not automatic saving.
- No paid generation, backend modifications, subscription, billing, secret synchronization or Oracle restart occurred.

## VERIFIED LIVE — Cloudflare publication

The owner-authorized source release [#38720659648](https://github.com/teslaeco/WORLDIFACT/actions/runs/38720659648), job `116374114016`, completed **SUCCESS** on release commit `50825a0632979e6e14bd74ff1ba0204eb977226b`. Cloudflare version `bd085cf6-ff55-4321-a511-87c57a4d2908`, public origin https://worldifact.xodobrox.workers.dev; game https://worldifact.xodobrox.workers.dev/chess.

Release gate PASS: 2314/2314 unchanged WORLDIFACT tests, green lint/typecheck/build, exact Chess/Terra foundation assembly, Wrangler dry-run, and `wrangler deploy --keep-vars` with potentially sensitive CLI output suppressed. The `PUBLIC_RELEASE_VERIFIED` receipt confirmed **12 HTML routes and 437 static assets** matching built bytes/MIME, `GET /account/worlds` 200, expected six-portal/partner resource markers, actual compiled Chess `beforeunload`+legacy `returnValue` and CSS `open-menu[hidden]` markers, and Studio READY with Astra/Sol/Luna. The independent Cube Chess [desktop/mobile Chromium browser test #38719645010](https://github.com/teslaeco/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/actions/runs/38719645010) passed both jobs before merging the exact Chess source.

No paid generation, payment change, secret synchronization or Oracle restart was performed. The previous Cloudflare version `dbd875c7-26d5-42c5-b6d9-bbe3f48708e8` is superseded. Physical Android visual QA, iOS and actual signed-in session testing remain UNKNOWN. Browser-native warnings have browser-specific wording and mobile limitations; automatic saving is not claimed.

## Release method and preserving protections
**COMPLETED (see verified LIVE receipt above):** One-use `.github/workflows/single-chess-exit-release-once.yml` is armed by `ops/SINGLE_CHESS_EXIT_RELEASE_20261015.json`. Its strict parent and exact-four-file allowlist restrict the published change to this already merged, reviewed release. It reruns the original full verify/foundations and Wrangler dry-run, deploys the existing reviewed preserving config with `--keep-vars`, and requires an actual Cloudflare receipt, matching 12 HTML routes and all public asset bytes/MIME, Chess unload/single-menu JS+CSS markers and a read-only Studio READY check before declaring LIVE.

Prior Cloudflare version `dbd875c7-26d5-42c5-b6d9-bbe3f48708e8` is superseded by the LIVE version above. Physical Android and signed-in account testing remain UNKNOWN.

## Preserved previous status
Prior status is stored byte-for-byte in [CONTEST_STATUS.before-single-chess-exit-20261015.md](CONTEST_STATUS.before-single-chess-exit-20261015.md), original blob `ab5f26d4c64863ec3b68296cbcc139070d14f11f`. Earlier published status claims are historical and not proof that this specific bug fix is already live.
