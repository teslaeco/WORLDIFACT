## 2026-10-16 — RunPod on-demand-only policy enforced in offline CI

**RECOMMENDATION / IMPLEMENTED TEST / NOT DEPLOYED.** Owner requires RunPod GPU only when WORLDIFACT actively generates a model, and automatic scale-down afterward. Added an executable profile regression test on draft PR #305 for queue-based Serverless Flex: Active=0, Max=1, 1 GPU, 1 handler, 5-second idle timeout, no automatic upgrade, no provisioned endpoint/image/rate. Workflow now runs test. No paid GPU/image/resource creation. Actual deployed provider policy remains UNKNOWN until live readback. No browsing, gallery or GET status may trigger new GPU work.

---

## 2026-10-15 — RunPod actual account GET denied 403; safe v2 migration

**VERIFIED / BLOCKED / NOT DEPLOYED**. The one-time read-only RunPod GitHub
probe was reviewed under PR #306, merged with its own green CI, and triggered
from trusted main. Its actual GET to RunPod management REST returned
**HTTP 403**: https://github.com/teslaeco/WORLDIFACT/actions/runs/38801996493.
The secret was available to the runner (masked) but no resource access was
granted. This did NOT launch a GPU, purchase storage, send a paid generation,
expose the key, or modify customer data. The main-branch one-time workflow
was removed immediately afterward at
2e41b15a11f6f023f1189892033f3923929af511.
An unrelated release workflow was invoked by the main push but stopped before
credential setup/deploy at
https://github.com/teslaeco/WORLDIFACT/actions/runs/38801996415.

**VERIFIED in docs**: Official management API moves from REST v1 to v2 on
https://api.runpod.io/v2 and retires v1 on 2026-11-15. In draft PR #305 the
staging verification scripts and tests were updated for official paginated
v2 JSON response types, with GET-only, zero-secret-logging checks. This code
has not yet obtained a successful authenticated staging response.
Documentation: https://docs.runpod.io/api-reference-v2/migrate-from-v1

**BLOCKED**: Owner's RunPod key must be enabled and have adequate read
permissions for endpoints, volumes and Pods. Existing GitHub and installed
RunPod plugins do not expose account secret/permission administration here.
No unauthorized workaround, payment operation, credential rotation, paid
worker start, or endpoint creation was attempted.

**NO-GO**: Native TRELLIS2 image and end-to-end ECOMECH PBR GLB remain
unverified, as do private storage, actual rate/cost, side/back shape fidelity
and supplier MAKE checks. Draft PR #305 is intentionally not merged.

---

## Staging GET-only RunPod connection gate — 2026-10-15

**IMPLEMENTED / TESTS PENDING / ACCOUNT ACCESS BLOCKED / NOT DEPLOYED.**
The user confirmed installation of RunPod Official plugin and showed a
RUNPOD_API_KEY secret under GitHub Production. This is evidence of secret
presence only, NOT successful authentication or a deployed GPU endpoint.

PR #305 now contains a strict read-only API preflight and tests, plus a one-use
GitHub Actions staging environment workflow. The latter is not armed: a separate
runpod-staging environment with its own read-only API key and required reviewer
must be configured before its marker-only run. Do not expose the many unrelated
Production secrets to draft branch workflows. The existing staging manual
workflow was corrected to the official RunPod REST v1 hostname.

User reference uploaded in this conversation matches the previously approved
decoded original 1122x1402 RGB pixels (SHA-256:
3d601608694b61932ccf11a4e0eff979f49e0c08c2a20e161c117f8e10126508).
The raw PNG copy has its own SHA; do not mistake a different lossless encoding
for a new reference. No original reference bytes were committed publicly.

**Cost impact:** zero paid RunPod/OpenAI calls, zero provisioning, zero persistent
volume purchase, no merge, no production change. Initial planned operating
settings remain workersMin=0, workersMax=1, one GPU, Flex scale-to-zero.
A live TRELLIS2 + Blender ECOMECH test and MAKE approval remain BLOCKED.

---

## 2026-10-15 — RunPod staging credentials step prepared (no real API connection)

**IMPLEMENTED / NOT ACTIVATED:** Draft [PR #305](https://github.com/teslaeco/WORLDIFACT/pull/305) now includes a manual-only, read-only RunPod REST v2 connection check (`.github/workflows/runpod-staging-readonly.yml`) protected by the `runpod-staging` GitHub environment. It is intentionally not runnable from an unmerged PR; a reviewed merge is required for GitHub workflow_dispatch availability. The owner must create a least-privilege RunPod API key via the official credentials console and save it as the `RUNPOD_API_KEY` GitHub environment secret. The ChatGPT GitHub connector does not create/read secret values. The test uses a single authenticated GET to list Serverless endpoints; no private body/token is logged, no GPU/endpoints/storage/images are created or bought, no jobs are dispatched. Full instructions in `docs/RUNPOD_CREDENTIAL_SETUP_20261015.md`. RunPod provider auth, RunPod GPU, production Cloudflare runtime secrets and original ECOMECH geometry all remain **UNVERIFIED/BLOCKED** until separately tested.

---

# 15 October 2026 — Astra + RunPod Flex GPU + Blender preparation (draft PR #305)

**IMPLEMENTED / OFFLINE TESTED / NOT DEPLOYED.** [PR #305](https://github.com/teslaeco/WORLDIFACT/pull/305) prepares the owner's requested architecture without creating a paid endpoint, altering the current Oracle generator, customer prices/points, secrets or six experiences. Source baseline is main `e3dc3b644ba97e6d7bf6b8b9ba998499067290ae`.

## Implemented scope
- Server-only Astra Responses/strict-JSON plan adapter, exact PNG hash and a mandatory existing-budget permit. No model-generated code execution or hidden retry.
- Asynchronous RunPod `/run` + GET-only status, immutable tenant/job/input identity, transactional submission claims, conservative per-tenant daily exposure admission and runtime/TTL limits. Uncertain submissions require reconciliation, not another billing-capable POST.
- Native Linux TRELLIS.2 worker with an audited local model bundle, private conditional object storage and durable duplicate-delivery handling across scale-to-zero. Preserve original shape AND spatial PBR checkpoint before GLB baking, then original GLB before Blender.
- Fixed Blender stage with separate GAME GLB, editable BLEND and eight actual renders: PBR/clay, front/three-quarter/side/back. Source geometry is not voxel-repaired or distorted to conceal missing likeness. Output is `REVIEW_REQUIRED`, not print/supplier approval.
- Preparation recipe and operator profile: Active workers 0, Max workers 1, GPUs per worker 1, concurrency 1, idle timeout 5 seconds. No permanent VM/Windows or public Hugging Face demo. Cold starts and storage are separate costs; runtime math is not a guaranteed invoice cap.

## Evidence and limits
Local strict TypeScript checks and **13 Node + 15 Python tests passed**. [Dedicated pipeline workflow #38783630158](https://github.com/teslaeco/WORLDIFACT/actions/runs/38783630158) passed the provider/transaction contracts, worker/storage tests and real Blender export/render stage on an explicitly identified **box fixture**, not ECOMECH. The initial dependency-install failure in #38783384979 was corrected by pinning boto3 1.43.66 to satisfy RunPod SDK 1.12.0; no tests were bypassed. Full repository verify/deployment dry-run status is recorded in the current PR checks and must be read for the exact head before any merge.

This PR adds **no public POST route or production UI switch**. Existing authenticated account/budget admission, storage ingestion and preview authorization must be wired before activation. Native CUDA/TRELLIS inference, audited GPU base-image build, real S3 conditional-write semantics, RunPod endpoint deployment, real API cost/latency, original-reference fidelity, Android preview and supplier-specific MAKE remain **UNVERIFIED**. No new robot was generated by this preparation task. No live OpenAI call, paid GPU rental, competitor geometry API, merge, production deployment or supplier order was performed.

Implementation and activation runbook: [ASTRA_RUNPOD_BLENDER.md](ASTRA_RUNPOD_BLENDER.md). GPU and server flags remain disabled by default; private originals and partial checkpoints remain separate from public files. Historical main status is preserved below unchanged.

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
