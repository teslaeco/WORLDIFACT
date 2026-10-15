# ECOMECH TRELLIS.2 — recovery from the interrupted session

Date: 2026-10-15. Draft PR #304. No production change, merge, customer billing or supplier order.

## Transport defect fixed and reproduced

The original research run [38735532844](https://github.com/teslaeco/WORLDIFACT/actions/runs/38735532844) timed out during `/start_session`, before image upload or generation. Its original archive SHA-256 is `5c2c10aabc76f4267cf4c9dfe585a0c62e1146fdec247151f92cba26e02ad920` and its receipt records zero generation submissions.

The installed `gradio_client==2.0.3` used one executor for both prediction and its `open_stream` helper. Our `max_workers=1` configuration could starve that helper. Transport workers are now eight, while business calls remain strictly sequential: at most one generation and one export. A separate process supervisor bounds shutdown, preserves an atomic receipt and never treats a killed local process as proof of remote cancellation. The updated client starts a session in the real recovery run; it no longer hangs until the 12-minute CI limit.

[Contract tests 38742089974](https://github.com/teslaeco/WORLDIFACT/actions/runs/38742089974): 27/27 PASS, including a shared-executor starvation fixture, unknown generation outcomes, export-only failure and stuck executor cleanup. The recovery source commit `3d055d0053cbf0a599a9d5b3119ad41381be90df` also passed [full Verify WORLDIFACT 38742606545](https://github.com/teslaeco/WORLDIFACT/actions/runs/38742606545) and [offline contracts 38742606626](https://github.com/teslaeco/WORLDIFACT/actions/runs/38742606626). These are code/transport tests, not model-quality acceptance.

## Actual corrected GPU session

The user's explicit resume request was implemented as a separate marker-only activation. It first downloaded the previous immutable archive and proved zero model submissions. The older failed Astra job was not retried.

[Audited recovery 38742596225](https://github.com/teslaeco/WORLDIFACT/actions/runs/38742596225):

| Stage | Observed result |
|---|---|
| Original reference PNG | SHA `9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053` verified |
| Session start | Completed |
| One whole-object GPU generation | Returned in about 29 seconds |
| Provider previews | 48 JPEGs: 8 angles × 6 rendering modes |
| One GLB export request | Rejected; `AppError`, sanitized category `AUTH_OR_FREE_QUOTA` |
| Downloaded original GLB | **NONE** |
| Process cleanup | Normal exit after 31.287 seconds, not a hung 12-minute process |
| New OpenAI or paid vendor requests | 0 / 0 |
| Automatic retries | 0 |
| Visual / print / supplier acceptance | All false |

Archive id `11975789984`, SHA-256 `df3018f34dffde023e26f8174f45adedf4bb280566d14deee925562ac867afaf` contains reconciliation, supervisor/attempt receipts and the 48 provider renders. It does not contain a GLB. The run correctly remains failed as an end-to-end reconstruction/export job. Do NOT call the JPEGs a downloadable model, original mesh verification or an independently rendered Blender result.

The official Space implementation returns snapshots from the generated mesh in normal/clay/base-color and three lighting modes. Its shape and export endpoints each use a separate `@spaces.GPU(duration=120)` allocation. Official ZeroGPU documentation lists two minutes for unauthenticated users and five for free signed-in accounts. This is consistent with an export quota block, but the sanitized receipt does not prove the exact remaining allowance or distinguish quota from authentication. No paid upgrade or quota evasion was attempted. The demo is not production infrastructure.

## Visual review: new geometry, still not acceptable

The retrieved clay snapshots show considerably more modeled helmet, armor and motor forms than the rejected V7 projected-mesh prototype. This is a qualitative observation of provider renders, not an independent mesh audit or a superiority benchmark. A large spurious sheet extends behind the body and between parts, so this result fails original-reference fidelity and print readiness.

Inspecting the exact prepared input (`3352fb71ba57f2ff0bd13e16aad5ff76ba0ce0a3d3796f4751b5e6f57c9e7d9d`) revealed background remnants under the raised arm and between the legs. The old coarse polygon mask had marked some enclosed background as definite foreground. Background contamination is a plausible cause of the spurious sheet; no causal A/B claim is made before testing a corrected mask.

A source-bound SAM2.1 CPU segmentation stage has been added separately to evaluate a better mask using positive body/chili anchors and negative background/limb-gap anchors. It preserves original RGB and never invokes another 3D generation. Its execution and full-mask visual review must be recorded separately; adding the file is not a successful test.

## Next execution gate

The native TRELLIS.2 adapter remains unexecuted on an owned GPU. It preserves raw decoder geometry before export and does not depend on two separate anonymous demo allocations. Microsoft documents Linux and NVIDIA memory of at least 24 GB; A100/H100 are validated upstream. This session has no confirmed accessible owned CUDA device, and the authorized Desktop Commander machine is offline.

A dedicated GPU test needs a connected compute environment and a concrete separate spending cap, including setup/download/storage and termination. The OpenAI-only allowance is not an automatic GPU rental authorization. No new GPU has been rented. The source mask, raw geometry, all-angle clay/PBR review, export hashes and eventual supplier-specific MAKE validation remain required.

Primary sources: [TRELLIS.2](https://github.com/microsoft/TRELLIS.2), [the exact demo app revision](https://huggingface.co/spaces/microsoft/TRELLIS.2/blob/ebf60b20fc5a4607f90a1c11c0aab0ceeda5429d/app.py), [ZeroGPU limits](https://huggingface.co/docs/hub/spaces-zerogpu). Geometry attribution is Microsoft TRELLIS.2 with WORLDIFACT orchestration; Astra was not invoked in this test.
