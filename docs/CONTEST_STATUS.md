# WORLDIFACT status — Oracle FAST installed, website release in review

Date: 17 September 2026.

## New completed milestone: owner-side Oracle installation

The owner supplied the completed Cloud Shell launcher output (phone screenshot at 16:43). It reports:

```json
{
  "phase": "INSTALLED_AND_LOCALLY_VERIFIED",
  "source_commit": "a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b",
  "paid_generation_requested": false,
  "site_deployed": false,
  "worker_service": "active",
  "tunnel_service": "active",
  "maintenance_service": "active"
}
```

The summary also gives the preserved rollback workspace `/home/opc/.local/state/worldifact-fast/20260917T143508Z-16dbbba6`. Treat that directory as recovery material, not something to remove. The subsequent `FAST_INSTALLED` line says the generator was restarted and locally checked; website publication and the paid benchmark are separate.

This is owner-provided execution evidence from the previously reviewed installer/launcher. It is stronger than the earlier preflight or CI fixtures, but it is not an administrative SSH session held by the assistant, a successful new AI model, or a measured 120-second result. The installer must not be run again merely because the website has not been published yet.

The earlier `NOT INSTALLED` status is superseded for the Oracle milestone. The website merge/deployment remains pending until its actual release completes.

## Authorization

The owner explicitly approved exact-v33 backup/install/temporary stop/restart and subsequent PR #36 publication after successful worker verification. This installation output satisfies the stated worker-evidence condition. No repeated merge consent is needed for that specific release.

The approval excludes new paid generation, more capacity, counter reset/refund, expiry extension, new cloud resources and contest submission. The website is released with the existing reviewed disabled-cost configuration. No old pilot marker is edited or re-armed by this PR.

## Current review and release

- PR: https://github.com/teslaeco/WORLDIFACT/pull/36
- Branch: `perf/fast-preview-profile-20260917`
- Task: [CODEX_TASK_FAST_PREVIEW.md](CODEX_TASK_FAST_PREVIEW.md)
- Original hosted Studio, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/
- Public Shop entry: https://worldifact.xodobrox.workers.dev/shop
- Previously deployed runtime: PR #34 fetch fix `4313e9c83f0dbdecd25eac3bbb1bd978d249b30b`; main before this release `538b94b9700e3927772c6cd31ee7bbc5e897c160`.

Head `cd0ff1ddded5f5590cea4ac8163bbb530e41a02c` passed all four checks before this handoff:

- WORLDIFACT: run `35233495623`.
- FAST worker/real Blender fixture: run `35233495707`.
- v33 installation safety: run `35233495774`.
- Cloud Shell launcher: run `35233495896`.

After the installation screenshot, the existing read-only release probe was extended to report the actual `fastReady` Boolean without conflating it with `ready` or the remaining allowance. Two added regressions verify credential-free GET-only behavior, no authentication-redirect following, strict capability types and redaction. The production workflow now records this same existing probe after publication so the deployed proxy/Oracle connection is checked, not merely the earlier source build. It does not generate a model or change capacity. Final-head checks must pass again before merging.

**Release decision: GO for the scoped website release after final-head checks. NO-GO for claiming a live 1–2-minute model or spending another attempt without its separate approval.**

## What the website release contains

STANDARD remains the default and its existing input digests, native fetch binding, same-job recovery and archive originals are preserved. A separate `FAST DRAFT` mode becomes selectable only when the actual connected worker confirms `fast-draft-v1`. The proxy checks that capability before receipt preparation and again before any reservation; it will not silently run STANDARD for a FAST request.

FAST v1 is for a compact text-described single object. It uses one Blender build, a six-provider-request and 12,000-output-token ceiling and a 110-second orchestration guard. Core GLB/materials and an editable Blender checkpoint are returned before optional visual-review images and interchange exports. Required geometry/file/checkpoint validation remains; stale, partial, corrupt, cancelled or late candidates cannot become successful drafts.

FAST is labelled UNREVIEWED, with no visual acceptance or MAKE approval. Initial FAST supports up to 2K maps and no reference photos or terrain. STANDARD remains the explicit path for photo-driven and larger-texture work. Deferred PBR/FBX processing is not advertised as a completed FAST export. Profile identity is retained in new receipt/archive metadata without rewriting saved originals.

The page stays inside WORLDIFACT, with a return link and all five worlds. It does not reinstate an authenticated iframe, automatic external redirect, stock-model substitution or JSON brief masquerading as generation. The owner's previously successful knight and archive are not changed.

## Performance and spending limits

The owner's successful knight and approximately 16-minute wait remain the real baseline. Prior fixed-scene Blender comparisons (about 41–44 seconds with optional review versus 0.615 seconds for identical GLB bytes without it) exclude real AI orchestration, queue/startup, transfer and browser rendering. They are not the live FAST benchmark. A 60–120-second end-to-end result remains UNVERIFIED.

The previous successful-knight screenshot showed six original reservations used and zero remaining. The old absolute expiry was `2026-09-17T09:23:37.535Z`. Those are historical observations, not permission to add a seventh attempt. Actual remaining/disabled values will be reported by the public read-only check after release; they must not be guessed or rewritten. A new bounded model test needs explicit approval after publication.

Oracle service readiness and FAST profile support are distinct from a paid write gate. Even with the worker running and FAST installed, the Generate button can remain disabled because no currently approved allowance is available. This is not an instruction to reinstall or restart the server.

## Earlier evidence preserved

- Exact v33/source comparison and preflight: https://github.com/teslaeco/WORLDIFACT/blob/a02d74529a6b9b754f7e46765867e71404b5a48c/docs/CONTEST_STATUS.md
- Tested installer and rollback design: https://github.com/teslaeco/WORLDIFACT/blob/a1dfc7b847043d6f0f9f682ddd9db6137c5e5d9b/docs/CONTEST_STATUS.md
- Approved pinned launcher and checks: https://github.com/teslaeco/WORLDIFACT/blob/cd0ff1ddded5f5590cea4ac8163bbb530e41a02c/docs/CONTEST_STATUS.md

The exact installer invoked genuine local Codex/MCP/Blender checks with fixture model responses, enabled the FAST service drop-in only after successful verification, restarted the worker and checked loopback readiness. The screenshot confirms its recorded success; the tunnel was not restarted. No binary receipt was fabricated and no new provider model was requested.

## Remaining truth boundaries

A source test, fixture benchmark or local health check does not prove a newly generated FAST model, production-model visual quality, native 4K/8K detail, manufacturing suitability, a store product or contest readiness. Physical Android use of the new FAST selector and its full paid generation still require their own evidence. Browser restrictions are respected; the release uses the existing authorized CI/public HTTP checks.

Implementation and release management use connected GitHub tools. No separate cloud-agent execution is claimed. After successful publication, record the real merge, deployment, public capability/counter read and skipped paid-pilot gates rather than leaving this pre-release ledger as the final state.
