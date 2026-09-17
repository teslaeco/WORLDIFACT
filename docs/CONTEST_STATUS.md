# WORLDIFACT status — FAST DRAFT source review, 17 September 2026

## Owner-confirmed working baseline

The owner now supplied a screenshot of a newly generated chess knight loaded as a GLB in WORLDIFACT, with model controls, explicit downloads and its device-archive entry. This supersedes the earlier lack of user-side end-to-end evidence for the native Shop. The owner reports approximately **16 minutes** to generate that model. Per-stage timings, server logs and the original artifact hash have not been independently retrieved; the screenshot is not a detailed performance trace.

The same screenshot shows **six cumulative reservations and zero remaining**. No new numeric paid-test allowance has been approved in this task. The previous pilot's absolute deadline was `2026-09-17T09:23:37.535Z`; it must not be extended or reset implicitly.

Production baseline remains the PR #34 fetch fix at `4313e9c83f0dbdecd25eac3bbb1bd978d249b30b`; later PR #35 and documentation did not redeploy runtime code. Main at task start: `538b94b9700e3927772c6cd31ee7bbc5e897c160`. Existing knight, receipts, local archive and original hosted Froge are untouched.

Earlier release evidence: https://github.com/teslaeco/WORLDIFACT/blob/538b94b9700e3927772c6cd31ee7bbc5e897c160/docs/CONTEST_STATUS.md

## Current task and scope

The owner requested a powerful Codex instruction and its execution to target **1–2 minutes for simple models**. Work is in draft PR **#36**, branch `perf/fast-preview-profile-20260917`.

- Full executed instruction: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)
- PR: https://github.com/teslaeco/WORLDIFACT/pull/36
- Worker patch, tests and installation boundaries: [../tools/fast_preview/README.md](../tools/fast_preview/README.md)

Implementation is performed directly with the connected GitHub tools; no separate paid/cloud Codex agent is claimed. No production deployment or Oracle installation has occurred. The 120-second end-to-end target remains **UNMEASURED**, not a guarantee obtained by setting a timeout.

## What was actually found

Reviewed source is `teslaeco/Froge-MPC-2-test@d3f61b842dcfeda2ed794210caafc391919a75be` from open PR #16, not assumed identical to the installed Oracle connector.

The real OpenAI path uses the Codex/MCP worker with up to 32 provider turns and five builds. Intermediate builds already export preview-only; full interchange export occurs once at `finish_model`. Therefore the earlier hypothesis that full exports repeat for every build was incorrect. Intermediate preview builds do perform optional multi-view rendered review, which can delay first useful output. These code facts do not allocate the owner's entire 16-minute delay to a particular stage.

## Implemented changes

| Area | Source behavior | Evidence boundary |
|---|---|---|
| Explicit profile | `standard` remains the default; `fast-draft-v1` is structured metadata, never inferred from prompt text | Old requests and canonical STANDARD digests remain byte-compatible |
| Worker policy | FAST: six provider requests, 12,000 output tokens, one Blender build and 110-second orchestration guard | Queue/startup/network/browser time are separate; no deadline success is fabricated |
| First useful artifact | Retain only a complete hash-checked candidate from the current execution, then stop without another paid model turn | Invalid/cancelled/stale/late candidates are rejected; no stock/Demo substitute |
| Review/export tradeoff | Keep core GLB and editable Blender checkpoint, defer optional image review and full interchange packaging | FAST is explicitly UNREVIEWED, `accepted=false`, `assessment_completed=false`; no fake `finish_model` receipt |
| Bounded simple objects | Text-only initial profile; compact geometry; generated maps capped at 2048 pixels without upscaling | Photos, portraits, terrain and larger-texture requests remain STANDARD or fail explicitly |
| Same-origin API | Require exact worker profile capability before preparing and again before reserving a paid job | Old workers cannot silently execute the slow default for a FAST request |
| Shop control | Explicit mode selector, default STANDARD; FAST unavailable until the worker advertises support | No new iframe, redirect, automatic generation or claim that the profile is already installed |
| Recovery/archive | Selected profile travels with the saved receipt and new archive metadata; old data is preserved | Original bytes, fetch binding, single-POST recovery and exact result identity remain intact |
| Timing evidence | Safe timing summaries and a matched-scene actual-Blender benchmark | Missing live timings stay null; fixture speed is not a live AI benchmark |
| Update safety | Hash-check four exact source blobs, compile narrow patches, assemble into a NEW output folder | Refuses unrecognized source/in-place overwrite; runtime re-verification is required |

The helper and patch do not install an AI provider, bypass code policy, modify secrets or drop required geometry/security/checkpoint validation. Changes are job-scoped, not global mutable FAST state. On-demand refinement/new export services are not invented; deferred formats remain unavailable until an explicit supported operation exists.

## Actual Blender measurement

Matched fixture run: https://github.com/teslaeco/WORLDIFACT/actions/runs/35206010927

- Source head at that worker measurement: `f98a6b0069d8eba3243d74a91ddfbb77ce8f68e4`.
- Official SHA-256-verified **Blender 4.3.0**, GitHub Ubuntu runner, four host CPUs, Blender configured for two threads.
- Same deterministic rocket scene; **one run per profile in this comparison**, STANDARD first and FAST second. This is not the user's knight and not a cold-start/percentile study.
- STANDARD preview path, including optional rendered-review images: **43.560 seconds**.
- FAST checked GLB path, without those optional renders: **0.615 seconds**.
- Both outputs: **1,948 triangles, three materials, one real 512×512 image, 397,056-byte GLB**.
- Both GLBs have identical SHA-256: `ede10636cb32daee34183f5fc39cb4e0d14f62a9dfad3085c207c4da982b9f9b`.
- STANDARD produced five review PNGs; FAST deliberately produced none. Geometry/material bytes did not change for this fixture.

This measures Blender process startup, scene construction and core export, plus STANDARD optional review. It **excludes AI planning, Codex orchestration, Oracle queue/container startup, network transfer and browser decoding/rendering**. It proves a useful renderer-path optimization, NOT that real AI generation is now under 120 seconds. Later CI reruns remain available in Actions; no p95 or universal speedup claim is made.

## Verification progress

The first worker source package passed eight FAST policy/current-candidate/HTTP tests plus **69 existing STANDARD regressions**, compilation and a real Blender benchmark. WORLDIFACT source changes subsequently passed full verification at `c67025cc82c8975576123694c0623aa7937a27e3` in run `35206950911`, including actual-source UI/profile/receipt regressions, TypeScript, HTTP, production build, pinned foundations and Worker dry-run.

The latest hardening adds a real supervisor test with an inert local child: it must retain a checked draft and terminate a 30-second idle child early without any provider access. Final-head results and the narrow source package are recorded in the PR after the final complete gate. A deterministic artifact or subprocess fixture is not a paid AI generation or physical Android test.

## Deployment and paid-test blockers

**GO for source review; NO-GO for claiming a live 1–2-minute result.**

1. **Installed-worker source parity/access remains UNKNOWN.** Public connector evidence reported v33; the reviewed repository snapshot contains later code. A working `/v1/jobs` credential is not an administrative deployment channel. No available authorized SSH/Oracle deployment action was found. Do not overwrite the working generator with the whole newer snapshot.
2. **The patch is not installed.** Applying source changes invalidates the old Codex/MCP binary/source verification receipt by design. The exact installed source must be inspected, the narrow patch reconciled, originals backed up, active jobs drained and the genuine runtime verification rerun before enabling the profile flag.
3. **New paid benchmark approval is absent.** The owner screenshot shows the original six reservations exhausted. No seventh attempt, refund, reset, deadline extension or automated fallback has been enabled. Request a clearly bounded fresh test only after the verified FAST worker is actually available.
4. **Production UI release is pending review.** Publishing only the selector cannot speed up an unchanged Oracle worker. Keep the current functioning STANDARD site until the complete path can be validated.

The original hosted Studio remains https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/ . Public WORLDIFACT remains https://worldifact.xodobrox.workers.dev/shop . No private archive, model, account setting, cloud VM/GPU, secret or contest submission was changed.

## Sources and truth labels

- Official latency guide: https://developers.openai.com/api/docs/guides/latency-optimization — reducing sequential work/requests and time to useful output, not a guarantee for our product.
- Official model guide: https://developers.openai.com/api/docs/guides/latest-model — current identifier and `low` reasoning support checked. This app's FAST DRAFT is NOT OpenAI's paid service-tier Fast mode; no service tier was changed.
- Owner screenshot/report: working knight + local archive + approximate 16 minutes + six reservations. Per-stage profile still unknown.

GAME drafts remain GENERATED/UNREVIEWED; MAKE remains validation-required. A faster draft does not certify likeness, native 4K/8K detail, full material equivalence across formats, manufacturing suitability or a public store product. No new competition decision is made here.
