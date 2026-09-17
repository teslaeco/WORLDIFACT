# Five-hour quality and English work session

Date: 17 September 2026 (Europe/Amsterdam). Owner: Sebastian.

## Coordination

- Branch: `work/five-hour-quality-english-20260917`.
- Draft PR: https://github.com/teslaeco/WORLDIFACT/pull/28
- Base: `495a6524d7b597403eefd5b62bfbf8ee9fedc4e0`.
- Editor: **ACTIVE — continuation 2 is editing this branch. Do not edit concurrently.**
- Scheduled continuations completed: **1 of 5**.
- Next task: complete the exact-source English inventory for native WORLDIFACT, pinned Chess/Terra and the real 8 Planets source where accessible; then continue source-level model/texture validation without touching the live Froge Site.

## Non-negotiable continuity

Keep `https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/` as the active generator reached from WORLDIFACT `/shop`. PR #27 is deployed. Do not recreate it, use `forge-studio-public` as a replacement, or overwrite the hosted Studio with an older GitHub snapshot.

No canonical hosted-source editing connector was available in this run. The newer GitHub branch `teslaeco/Froge-MPC-2-test:codex/v27-mcp-startup-audit` remained at `735058af6e53a2e44f417b5dcf864f62bd334bb2`; its checkpoint records the private Site on a newer source whose Git clone/API access previously failed. GitHub source patches therefore remain review-only and are not described as live.

## Continuation 1 — completed changes

### ISS English

The source-owned ISS surface is now English across:

- static HTML/help/accessibility text and `lang=en`;
- all eight repair tasks, tool names, step labels and state errors;
- runtime goals, inventory/mission status, EVA/interior state, interaction hints, airlock/door/tool actions, torque instructions, map/view/reset/save/load and NASA-map errors;
- in-world canvas signs: `LABORATORY`, `EVA AIRLOCK`, `TOOL BAG`, `EVA SUIT`, `EXTERIOR EXIT`, `RETURN TO AIRLOCK`;
- Model Context tool titles/descriptions/errors and WebGL fallback copy.

IDs, task order, state version 2, inventory consumption, collision positions and training disclaimers were preserved. `tests/iss-english.test.mjs` now checks static + runtime English, canvas signs, DOM hooks and the complete eight-task/save compatibility path.

### Five-world language inventory started

See [LANGUAGE_AUDIT.md](LANGUAGE_AUDIT.md). Current evidence:

- WORLDIFACT portal definitions and native workbench inspected English.
- ISS source translation implemented as above.
- Pinned Chess `e134964e9c8b7edc43c26b508973f6fb658af90d` builds successfully; its exact source-wide string audit remains to be completed.
- Pinned Terra `ae90f7367587e0973782c470cde3f5103c0540fc` main UI inspected English in `web/src/main.tsx`; scientific/data-contract field names are not user-facing copy and are not renamed. Other components still need scanning.
- 8 Planets and hosted Froge are external apps. Parent wrapper English is not treated as translation of their cross-origin UI; their real source is required.
- Native AI Game Lab / Workbench copy inspected so far is English; deep scan remains.

### 3D / texture quality evidence

The previous WORLDIFACT preview-lifetime fix remains: late/wrong-session GLBs cannot replace the current preview and released shared geometry/material/texture resources are disposed once. This improves correctness, not likeness.

A separate **draft Froge source PR #16** was opened against the newer reviewed GitHub runtime branch:
https://github.com/teslaeco/Froge-MPC-2-test/pull/16

It keeps the no-upscale rule and changes texture evidence so an 8K request cannot be mistaken for an 8K result. The report now records the actual maximum source/export edge, whether the export truly reaches the requested edge, texture count and downsample count. Tests cover a requested 8192 px job whose real source is only 1122×1402 and a real 8192→4096 downsample. Touched texture-limit/memory diagnostics were translated to English. This patch is source-only; it does not improve face/hair geometry by itself and is not installed on Oracle or the private Site.

## Verification

WORLDIFACT code head `f2d7f9000e9194ae93c973967a3f597a8a1ba02a` passed PR CI run https://github.com/teslaeco/WORLDIFACT/actions/runs/35163081507:

- **108/108 tests passed**;
- lint: 9 warnings, 0 errors;
- TypeScript, local HTTP smoke and production build passed;
- pinned Chess/Terra foundation assembly passed;
- Worker `deploy:check` passed with paid generation and Oracle jobs disabled;
- hosted Froge read-only probe returned HTTP 200, generation NOT_TESTED, embedding UNKNOWN.

The later language-audit/checkpoint commits are documentation-only; current PR head CI should still be checked before any review/merge decision.

Froge PR #16 head `9cfc57f7f57b67a6ceb468e4025c32b53d8fa881` has CI queued/running under `Oracle Codex MCP (no paid API)` at the end of this continuation. Do not mark it verified until that run completes.

## Remaining quality priorities

Hair silhouette/root continuity, face/neck/jaw/shoulder proportions, hands, clothing intersections, UV/PBR material integrity, export/reimport material preservation and visual comparison remain unresolved for the private hosted generator. Pixel metadata and structural tests do not prove likeness, 4K/8K detail, Android/WebGL behavior or manufacturing readiness.

No new paid API/GPU generation, quota increase, secret change, Oracle installation, private archive access, model download, merge, production deployment or contest submission occurred in continuation 1. No separate Codex/Copilot agent was launched; work was executed through connected GitHub tools.

## Continuation protocol

Read current main/PR, AGENTS.md, CONTEST_STATUS.md, LANGUAGE_AUDIT.md and this checkpoint. Claim the editor marker, take the next incomplete package, make actual source/test changes, check current-head CI, update the ledger, increment the count exactly once, and return the marker to IDLE. Reuse WORLDIFACT PR #28. Keep Froge PR #16 draft/review-only unless later explicitly authorized for merge/deployment.

After continuation 5 provide a consolidated Polish report with actual changes/tests/SHA/PRs, remaining source-access and visual-quality blockers, costs and GO/NO-GO. Do not extend the work window or start another schedule.
