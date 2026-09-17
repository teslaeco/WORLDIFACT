# WORLDIFACT status — FAST recovery and source completion, 17 September 2026

## Recovery of the interrupted response

The owner asked to resume after the chat displayed a failed-thinking message. The exact reason for that chat-side interruption is UNKNOWN; it is not evidence that the generator, source or CI failed.

At recovery, PR #36 still contained head `805d40ed33910cc1fbc0f9f72d33303e805a2124`. Both associated checks had succeeded: `35207836071` (WORLDIFACT) and `35207836053` (FAST worker). Artifact `10490781508` was recovered through the authorized GitHub action. Its ZIP SHA-256 matched `b9b9f92ac01fb42b734fc5366bf30c4ce9e6411bd0d603271ac70b170bedadea`, and all 37 inner-manifest files were independently checked after extraction. No source or artifact had to be regenerated merely because chat delivery failed.

## Current reviewed change

- PR: https://github.com/teslaeco/WORLDIFACT/pull/36
- Branch: `perf/fast-preview-profile-20260917`
- Complete Codex task: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)
- Patch and installation boundaries: [../tools/fast_preview/README.md](../tools/fast_preview/README.md)
- Detailed pre-resume ledger: https://github.com/teslaeco/WORLDIFACT/blob/805d40ed33910cc1fbc0f9f72d33303e805a2124/docs/CONTEST_STATUS.md
- Earlier native Shop/fetch release ledger: https://github.com/teslaeco/WORLDIFACT/blob/538b94b9700e3927772c6cd31ee7bbc5e897c160/docs/CONTEST_STATUS.md

The resume review identified and corrected three concrete implementation issues in the proposed FAST runner:

1. Its per-turn developer guidance still described the STANDARD budget and encouraged optional rendered review/full finalization. FAST now receives consistent one-build guidance, its real remaining six-request ceiling, no optional review/finalization request and the existing exact-error correction guidance. STANDARD guidance is untouched.
2. The trusted gateway used low reasoning for FAST, but the CLI still requested high. Both now agree; STANDARD remains high. This does not change the provider, model identifier, service tier or spending approval.
3. Returning early after a checked FAST result skipped ordinary stdout-reader cleanup. The FAST termination path now drains the reader before its log is closed.

These changes are assembled by `tools/fast_preview/completion.py` inside the existing hash-checked patcher. The installed worker is NOT monkey-patched or modified by this source operation.

## Verification of the resume fixes

Code head `33bfdd07db6828620afadd3c8df2759d1e66b173` passed both checks:

- https://github.com/teslaeco/WORLDIFACT/actions/runs/35211376317 — complete WORLDIFACT verification, foundations and Worker dry-run.
- https://github.com/teslaeco/WORLDIFACT/actions/runs/35211376443 — exact-source worker assembly, compilation, FAST and existing STANDARD regressions, real Blender fixture comparison and artifact creation.

The new tests exercise the actual CLI argument builder and Gateway continuation text for both profiles. The real supervisor fixture retains a checked GLB and terminates an inert child instead of waiting for its 30-second sleep; background-reader errors are checked. All provider responses are fixtures. No new paid generation or API credit use is claimed.

This ledger update changes documentation only; the final exact-head verification and artifact identifiers are recorded in the PR handoff. Do not treat a successful source check as an Oracle deployment.

## Implemented FAST behavior

The working STANDARD Shop is preserved. FAST v1 is a separate, explicit, opt-in profile for a compact text-described object, not a silent quality reduction or another generator.

- Same existing Astra/Codex/Blender worker and same-origin WORLDIFACT interface.
- Versioned `fast-draft-v1` capability required before receipt preparation and again before any paid reservation. Unsupported workers cannot silently run STANDARD for a FAST request.
- One Blender build, six provider-request ceiling, 12,000 output-token ceiling and 110-second orchestration guard. This is not a guaranteed 120-second click-to-visible result.
- Core GLB/materials and editable Blender checkpoint first; optional rendered review and full interchange packaging deferred.
- Finite geometry, file/resource bounds, sandbox policy, current-execution identity, hashes and existing structural checks retained. Invalid, partial, stale, cancelled or late candidates are not returned as successful FAST results.
- Explicit GENERATED/UNREVIEWED draft with `accepted=false` and `assessment_completed=false`; no forged `finish_model` receipt or manufactured likeness/print approval.
- Requested map ceiling up to 2K; no source upscaling. Initial FAST does not accept reference images, people/portraits or terrain; use STANDARD explicitly for those cases.
- Old STANDARD canonical input bytes and receipt digests remain compatible. Profile choice survives recovery and new archive records. One paid POST, native fetch binding, same-job GET recovery and separate current/archive/example identities remain.
- The UI selector defaults to STANDARD. It does not offer an operational FAST choice until the connected worker advertises support. Deferred PBR/FBX exports are not presented as available FAST outputs.

## Measured evidence, with its limits

The owner supplied a successful chess-knight screenshot showing an actual loaded GLB, explicit download controls and a device-archive entry, and reported approximately 16 minutes. That establishes owner-observed end-to-end success. Per-stage timing and the original knight's artifact hash have not been independently obtained.

Recovered exact-head `805d40ed` benchmark: official checksum-verified Blender 4.3.0, GitHub Ubuntu runner, four host CPUs, two Blender threads; one fixed rocket scene, STANDARD first and FAST second, one sample per profile in that run.

| Measured renderer path | Wall time | GLB evidence |
|---|---:|---|
| STANDARD preview, including five review PNGs | 41.820 s | 1,948 triangles, three materials, one 512x512 image |
| FAST core export, with optional review deferred | 0.615 s | Same 397,056-byte GLB |

Both GLBs were byte-identical with SHA-256 `ede10636cb32daee34183f5fc39cb4e0d14f62a9dfad3085c207c4da982b9f9b`. Later required CI runs retain their own measurements; do not pool them as controlled cold-start trials or claim a percentile.

The comparison EXCLUDES real AI planning, Codex orchestration, the owner's Oracle queue/container startup, network transfer and browser decode/render. It is a useful Blender-path improvement, not proof that a new AI knight takes less than two minutes. The application target of 60–120 seconds remains UNVERIFIED until an authorized live test.

## Production and spending boundary

**Source review: GO after the final recorded checks. Production FAST activation / claim of 1–2 minutes: NO-GO pending installed-source verification and a live benchmark.**

The previous working production runtime remains the PR #34 fetch fix, `4313e9c83f0dbdecd25eac3bbb1bd978d249b30b`. No merge, website publication, Oracle update, credential change, quota reset/refund or new generation occurred during this resume.

Public Shop: https://worldifact.xodobrox.workers.dev/shop
Original hosted Studio, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

The patch base is `teslaeco/Froge-MPC-2-test@d3f61b842dcfeda2ed794210caafc391919a75be`. Previous installed-connector evidence reports v33; the reviewed source has later changes. Four source hashes are checked by the patcher, and in-place installation on unknown source is rejected. This is deliberate protection for the already working generator, not a substitute for completing its deployment.

The connected GitHub tools support repository work and existing website workflows. Searches did not find an available administrative Oracle/SSH connector. Repository evidence points to the owner's existing SSH session and `$HOME/froge-connector`; no authenticated administrative session is available to this task. A `/v1/jobs` credential is not permission or an endpoint for updating the host. Do not use model-generated code, a sandbox escape, private key extraction, or another provider to bypass that boundary.

Next installation prerequisite: inspect only the installed worker source revision/hashes through the existing authorized SSH session, reconcile this narrow patch to that exact code, preserve rollback copies and drain jobs. Re-run genuine Codex/MCP/Blender verification after source changes; do not fabricate its receipt. Then approve and publish the scoped release and verify the advertised profile before testing.

The successful user screenshot shows six reservations and zero remaining. The earlier absolute pilot deadline was `2026-09-17T09:23:37.535Z`. These are recorded observations, not a current billing/account balance. A new paid benchmark needs an explicit bounded allowance; do not reset the original counter or extend the window automatically. No paid test was run here.

## Source checks and wider project

Official model guidance was reopened during this resume and confirms `gpt-6-astra` and low reasoning support: https://developers.openai.com/api/docs/guides/latest-model . Official latency guidance supports reducing sequential work and time to useful output, not an unmeasured latency promise: https://developers.openai.com/api/docs/guides/latency-optimization . WORLDIFACT FAST DRAFT is not the provider's service-tier Fast mode.

No browser-security workaround was attempted. A direct public status read in this resume was blocked by the browsing tool and was not retried through an alternate route. Existing authorized CI checks and their logs remain separate evidence.

The original knight, original hosted app, archives and STANDARD quality path remain untouched. No exact likeness, native 4K/8K detail, manufacturing approval, public product catalog, supplier order or competition submission is established by this performance patch. Earlier contest requirements remain a separate decision; no contest decision is made here.
