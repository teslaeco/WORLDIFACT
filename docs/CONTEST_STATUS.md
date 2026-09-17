# WORLDIFACT status — native Shop deployed, 17 September 2026

## Completed implementation and release

The owner requested a full Codex instruction and execution of the Shop repair. **The instruction is committed, the native Shop is deployed, and the unused portion of the previously approved generation allowance has been restored and verified.** A fresh AI model generation was not requested by this task and is not claimed proven.

- Public Shop: https://worldifact.xodobrox.workers.dev/shop
- Full executed task: [CODEX_TASK_SHOP31_FINISH.md](CODEX_TASK_SHOP31_FINISH.md)
- Main repair: https://github.com/teslaeco/WORLDIFACT/pull/31
- Release queue correction: https://github.com/teslaeco/WORLDIFACT/pull/32
- Tested Git history gate correction: https://github.com/teslaeco/WORLDIFACT/pull/33
- Final deployed source: `69fb684914450508d48433b49e7581801acac81b`
- Final Cloudflare version: `612d5a88-be90-4bdd-994c-e4f958b96e06`
- Original hosted Froge, unchanged: https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/

Implementation was performed directly through the connected GitHub tools. Writing the Codex task does not imply that a separate Codex/Copilot cloud-agent job ran.

## Verified availability and original allowance

Final public read-only check at **2026-09-17T06:23:45.992Z** returned:

```json
{
  "ready": true,
  "used": 5,
  "remaining": 1,
  "expiresAt": "2026-09-17T09:23:37.535Z",
  "paidGenerationRequested": false
}
```

This is **one genuinely unused attempt within the original cumulative ceiling of six**, not a new allowance or six additional attempts. The generation window expires at **09:23:37 UTC / 11:23:37 Europe/Amsterdam and Europe/Warsaw on 17 September 2026**, or capacity ends earlier if that remaining attempt is reserved. These values describe the recorded check, not an indefinitely current balance.

The resume operation required confirmed photo-capable Oracle readiness and a real read of the original counter before activation. It made no model request. Tests use controlled fixtures, not paid provider calls.

Final deployed gates:

| Setting | Value |
|---|---|
| `ENABLE_STUDIO_JOBS` | `true` |
| `PUBLIC_PILOT` | `true` |
| `GENERATION_REQUEST_LIMIT` | `6` cumulatively |
| `GENERATION_EXPIRES_AT` | `2026-09-17T09:23:37.535Z` |
| `ENABLE_ORACLE_JOBS` | `false` for the legacy public route |
| `ENABLE_PAID_GENERATION` | `false` for procedural world blueprints |

The original Durable Object identity `worldifact-generation-budget-v1` and `reserved-attempts` counter are unchanged. No reset, refund, higher ceiling, extra paid test, new API secret, Oracle installation or private archive migration occurred.

**Important for later releases:** an ordinary production publication uses the reviewed disabled-cost base configuration. Do not assume it preserves this temporary activation, and do not re-arm or increase capacity automatically on unrelated commits. This evidence update is documentation-only with `[skip ci]` so it does not redeploy and close the current window.

## What users now receive

The active flow is `WORLDIFACT form -> same-origin Worker -> existing Oracle /v1/jobs -> same-job recovery -> actual GLB -> in-page preview and explicit downloads`.

- The familiar half-living/half-skull character display appears beside the description/reference form and is labelled **EXAMPLE ONLY**. It is not returned as a replacement for a failed generation. Its existing public render images are referenced; no private source model was copied or altered.
- The active Shop no longer depends on a cross-site ChatGPT authentication iframe or an automatic redirect. `Back to WORLDIFACT` and all five worlds remain available. The original hosted Studio remains an optional safe new-tab link.
- English prompt, purpose, up to four reference views and requested texture-size ceilings. References are normalized without upscaling. 2K/4K/8K are ceilings, not a guarantee of recovered detail.
- A signed exact-input receipt is stored before the only generation submission. Server-side atomic reservation prevents duplicate submissions for that receipt. A failed response or reload recovers the same job by GET, not by a new paid POST.
- The generated GLB is loaded into the page; file downloads are explicit. PBR/FBX/Blender exports are requested only from files the existing worker can provide; unavailable exports produce an error instead of a false success.
- Current job, archived model and example identities are separated. An archived model cannot receive another job's filename or export controls. Original bytes in the device archive are not silently overwritten by a different revision.
- Completed models are saved to a private device IndexedDB archive with prompt, ID, timestamp, size, SHA-256 and UNREVIEWED status. This is not a public store catalog, sale approval or manufacturing validation. Clearing browser storage can remove it; explicit backups remain necessary.
- Game Lab now distinguishes procedural world blueprints from detailed model/texture generation and links to the actual Shop. A disabled blueprint service is no longer automatically labelled exhausted credits.

## Verification and release evidence

| Milestone | Result | Source |
|---|---|---|
| PR #31 final source verification | PASS | Head `2d3a908d13b687a1f670d59a95730482048174bb`, run `35188352307` |
| PR #31 merge and initial production | PASS | Merge `8835d2bd077ead1604ecd288e335ce88edc04e73`, release `35188501496`, public HTML/assets/DEMO smoke passed |
| PR #32 queue correction | PASS | Head `bf38b3f101a3b38901c5bd611713f23afbe7f27c`, CI `35188897973`, merge `030f940052b9c65a17d6f9b70ed0ccccc666005e`, release `35189029946` |
| PR #33 tested history gate | PASS | Head `5512ab652d34f56d555f169534387be62d368447`, CI `35189399898`, merge `69fb684914450508d48433b49e7581801acac81b` |
| Final production publication | PASS | Run `35189491035`, job `105098691033`, including public HTML/assets/DEMO smoke |
| Final allowance resume | PASS / ACTUALLY EXECUTED | Run `35189566878`, job `105098924866`; all steps executed successfully, including counter read, conditional deploy and final public readiness check |
| Final complete test suite | **151/151 PASS** | Same final-source resume run; zero failures, skipped or cancelled tests; lint 9 warnings / 0 errors; TypeScript, HTTP, build and reviewed foundations passed |
| New paid model request | **NOT REQUESTED** | Readiness report explicitly records `paidGenerationRequested: false` |

Direct release evidence:

- https://github.com/teslaeco/WORLDIFACT/actions/runs/35189491035
- https://github.com/teslaeco/WORLDIFACT/actions/runs/35189566878
- https://github.com/teslaeco/WORLDIFACT/actions/runs/35189399898

### Failures fixed rather than hidden

Starting run `35186713564` had two failing tests. Correct ES-module default-export handling fixed the actual-source portal renderer. Awaiting artifact validation inside the API catch fixed invalid GLBs escaping as unhandled Worker failures. Assertions were retained. Later regressions cover exact model identities, archive collision preservation, strict enum input, signed receipts, double clicks, lost-response recovery and the actual Worker route with a complete deterministic material-bearing triangle GLB.

The first allowance continuation `35188573555` was cancelled before any job started due to the shared legacy queue. PR #32 isolated that queue. Its subsequent run `35189108573` skipped because a depth-one fetch made `HEAD^1` unavailable, and the shell conditional concealed the failed diff. PR #33 replaced the mutating fetch with read-only remote-ref inspection and a gate tested using actual local bare Git repositories and shallow clones. Missing history now fails explicitly; stale or unrelated releases cannot pass the marker check. Neither failed operational attempt reserved capacity or started generation.

## Preserved earlier work

PR #30 and reconciled PR #28 had already merged as the preceding baseline `3680fba140148530b4e5a16ff1a7a1cdaa332d6d`, with successful main and deployment checks. Their English ISS/native-world and safer model-inspection work remains. The former ledger statement that PR #30 was unmerged was stale and is superseded.

PR #31 deliberately replaces the rejected embedded Shop surface, not the original Froge hosted application or its private data. Separate upstream quality/source PRs are not made live merely by this integration.

## Remaining truth boundaries

- **Actual end-to-end fresh generation through this UI: NOT TESTED in this task.** Connector readiness and capacity are confirmed separately; the owner's explicit Generate action may use the one remaining approved attempt.
- **Physical Android / WebGL visual verification: NOT TESTED.** CPU, server-render, local HTTP, Git and API fixture tests are not device screenshots or real renderer evidence. Recorded browser restrictions were respected.
- **Likeness and texture detail: UNREVIEWED.** No claim of a new improved character, native 4K/8K detail, full export shader equivalence or sale-ready quality follows from these tests.
- **MAKE: VALIDATION REQUIRED.** No manufacturing approval, order, quote, automatic sale or product publication is performed.
- **Full hosted-site localization/source parity: not solved by this repair.** Existing hosted Froge is unchanged; the new WORLDIFACT interface is English.
- **Contest submission/eligibility: not assessed or executed here.** Earlier final-launch requirements still need their own official-source and product verification.

The scoped code repair, public deployment and remaining-capacity activation are complete. Further claims must distinguish those verified milestones from actual generated output and device usability.
