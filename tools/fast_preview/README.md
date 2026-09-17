# Existing Oracle worker: FAST DRAFT source review

This directory implements an opt-in `fast-draft-v1` for the **existing** Froge Astra/Codex/Blender worker. It is not a second generator and does not replace the hosted Studio. STANDARD behavior is preserved.

## Scope

FAST v1 accepts a new text-only compact object, at most one Blender build, six provider requests and 12,000 cumulative output tokens within a 110-second worker orchestration budget. Actual provider settings use low reasoning instead of the STANDARD high setting. The short budget leaves a *target* margin for overhead but does not guarantee a 120-second click-to-view result.

The renderer still performs its existing geometry/material/sandbox and checkpoint checks. FAST limits output to 300,000 triangles and 128 mesh objects, downsizes generated maps only when above 2048 pixels, and keeps the GLB and editable Blender checkpoint. It defers multi-view rendered review and full interchange export rather than running them before first result. A validated current candidate is returned as a draft without a further paid model turn. Failed, late, cancelled, corrupted or wrong-execution candidates cannot be promoted as a fast success.

FAST never claims visual review or acceptance. It writes a separate `fast-preview.json` and `visual-review.json` with `assessment_completed=false`, `accepted=false`, timing/hash and deferred-work labels. It does NOT forge `finish_model` or `agent-outcome.json`. No cache/stock/parametric fallback is silently substituted for AI output. First-revision portraits/photos/replay remain STANDARD.

The optional existing export routes may report unavailable formats for a FAST draft. This package does not claim a new on-demand refinement/export service. GLB and a saved `.blend` checkpoint remain useful, but further expensive processing needs its own explicit implementation/intent.

## Source and assembly

Reviewed base: `teslaeco/Froge-MPC-2-test@d3f61b842dcfeda2ed794210caafc391919a75be`. Original code is MIT; preserve its LICENSE.

`apply.py` verifies Git blob hashes for the four modified source files, checks exact patch contexts, compiles updates, copies clean sources into a NEW output directory and writes a manifest. It rejects in-place application, different revisions and symlinks. `state`, credentials, downloaded runtime tools and caches are excluded. The output is a **review source package**, not a live upgrade.

The running Oracle connector was previously reported as v33, while this inspected base contains later source. Source parity with that installed service is UNKNOWN. Do not overwrite it wholesale. An operator must first export/read only its code revision (not credentials), reconcile this narrow patch against that exact source, preserve a rollback copy, stop new submissions/drain the active job and rerun the existing Codex/MCP binary-integrity and Blender fixture verification. Changing runner/MCP source invalidates the old verification receipt by design; do not rewrite that receipt to bypass verification.

The new profile remains disabled unless `FROGE_FAST_DRAFT_V1=1` is explicitly enabled on the verified worker. Its `/v1/health` then advertises `generationProfiles` including `fast-draft-v1` only with existing readiness true. Requests select it through structured `generationProfile`, never through user text. Without the field, old requests remain STANDARD. Reusing an existing job ID with another profile is a conflict.

The WORLDIFACT proxy must require this advertised revision before reserving any paid FAST attempt. A merely shortened prompt or faster status polling is not installation of this worker profile.

## Evidence and limits

The baseline 16 minutes is owner-reported for a successful chess knight. It is not a per-stage benchmark. Existing code already delays full interchange export until `finish_model`; it does not repeat full exports on each build. `timing_summary()` can summarize existing allowed timing/tool records without copying prompts, code, private errors or hidden reasoning. Missing data remain null.

CI applies the patch to pinned source, compiles it, runs new tests against actual worker classes and local HTTP routes with deterministic files, and runs existing STANDARD regressions. Those tests do not contact OpenAI, create a paid model, perform a production update or prove 1–2 minutes on the user's Oracle. A generated source artifact is not an installed runtime.

Before a real performance claim: install on the correct source under explicit production approval, verify the FAST health revision, obtain a bounded new test budget, and record click-to-visible GLB, queue/startup/AI/build/transfer durations, hardware, actual image edges, triangles, profile/source revision, valid artifact hash and failures. Report n=1 honestly, not p95.

Current spending boundary: the supplied successful-knight screen shows all six previously authorized attempts reserved. No extra slot, counter reset/refund or paid test is part of this code review. Do not extend the expired pilot automatically. The original knight/archive must remain untouched.
