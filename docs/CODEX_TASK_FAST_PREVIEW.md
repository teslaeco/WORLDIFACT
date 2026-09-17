# Codex execution task — WORLDIFACT FAST preview, target 60–120 seconds

## Mission

Implement, test and measure a faster path for the existing working WORLDIFACT /shop generator. Do not stop at a proposal. Preserve the successful chess-knight model, its GLB/materials, archive, job receipt, provider and STANDARD behavior. Communicate with Sebastian in Polish; source, UI and this task are English.

The owner reports that a real chess-knight generation took about 16 minutes and shows its loaded GLB plus device archive. This is owner-observed end-to-end success and duration, not a measured per-stage profile. The screen also shows six cumulative reservations and zero remaining. There is no new numeric spending approval.

Deliver a distinct opt-in **FAST DRAFT** with a 60–120-second target for simple single objects. This target is not a guarantee or a reason to mark a timeout successful. Keep STANDARD as the default until the actual worker advertises tested FAST support. Do not silently substitute a generic chess template, stock asset, cached result or DEMO for a requested AI model. Do not silently reduce STANDARD quality.

## Read fresh state and work on the actual pipeline

Read AGENTS.md, docs/NIGHT_SHIFT.md, docs/CONTEST_STATUS.md, current main, active PRs and existing client/server tests. Preserve concurrent work and use expected SHAs. WORLDIFACT is the competition/release repository. The exact original hosted Studio remains https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/; do not overwrite it with an older GitHub snapshot or restore the broken iframe/redirect.

Current inspected source coordinates (revalidate):
- WORLDIFACT main `538b94b9700e3927772c6cd31ee7bbc5e897c160`; production runtime from PR #34 `4313e9c83f0dbdecd25eac3bbb1bd978d249b30b`.
- Reviewed Froge source `d3f61b842dcfeda2ed794210caafc391919a75be` on open PR #16; its installed Oracle parity is unverified. Do not automatically install this whole snapshot over the working v33 worker.
- `oracle_connector/server.py` routes real OpenAI jobs through `codex_runner.run`, then waits for completion. `codex_runner.py` instructs up to 32 model turns and five builds. `blender_mcp.py` already uses `preview_only=True` for intermediate builds and performs full format finalization at `finish_model`. Therefore, do not claim exports repeat on every build or assume all 16 minutes are export time.

## Instrument before claiming speed

Record monotonic durations for queue wait, runtime startup, AI/tool orchestration, each Blender build, GLB checkpoint availability, optional review/export, transfer and browser parse/first visible result. Keep server ready time distinct from client receipt time. Missing intervals stay UNKNOWN; do not invent an ETA from a timeout or elapsed/limit ratio. Keep provider tokens/turns, build count, source/version, cold/warm state, input kind, texture dimensions and model hash with timing evidence, never API keys, hidden reasoning, signed URLs or private image data.

Use the completed knight as a baseline only through its authorized receipt/export; do not bypass its identity guard, enumerate private jobs or regenerate it merely to obtain timings. At present its per-stage timings are unavailable through the public proxy. Document that gap rather than assign time to guessed bottlenecks.

## FAST profile

1. Use explicit job-scoped profile metadata, not magic prompt detection or global process flags. STANDARD preserves existing behavior. Reject unknown profile revisions before paid reservation. FAST must be capability-negotiated with the installed Oracle worker.
2. Keep the existing Astra/Codex/Blender sandbox and server-only credentials. Do not introduce an alternate provider or change the model ID without checking the current official Model Guide.
3. Prefer one compact scene build, one bounded geometry-correction opportunity only when explicitly budgeted, modest mesh density, and existing PBR material operations. For the first FAST revision restrict scope to a text-described single object; images/people/complex multi-asset scenes remain STANDARD until separately validated. Never ignore images silently.
4. Publish only a validated GLB draft promptly. Keep finite coordinates, bounded geometry/instances, self-contained resource checks, current execution/job identity, hashes and cancellation. Do not disable mandatory anatomy, security or file-integrity checks.
5. Separate optional multi-view image assessment and final FBX/OBJ/STL/PBR packaging from first draft availability. FAST must record `accepted=false`, `assessment_completed=false` and GENERATED-UNREVIEWED / FAST DRAFT. It must not forge a finish receipt that claims an AI visual review.
6. Stop an agent after a valid current FAST draft is retained, without buying another model turn just to announce success. Do not wait until the deadline when the valid draft is already available. Cancel remaining subprocesses safely and preserve the actual exported result.
7. A 120-second work budget is a guard, not an output promise. If no valid current draft exists at expiry, return an honest timeout; do not mark an old model or partial GLB successful. Account for queue/startup/transfer separately. Never auto-fallback to another paid STANDARD request.
8. Bounds apply to actual work, not only prompt text: job deadline, AI request/output ceilings and candidate-build count must be enforced in trusted worker code. Keep all credentials out of Blender and model-controlled code.
9. Optional exports/refinement must use explicit existing operations or remain visibly unavailable. Do not advertise on-demand exports that have not been implemented. Refinement may cost another job and requires separate explicit user intent. Preserve the FAST original as a revision, not an overwrite.

## Frontend/proxy and compatibility

Add a shared versioned profile validator. FAST is unavailable unless server capability says the complete tested profile revision is supported. Old Oracle workers and old saved receipts continue working as STANDARD. Existing inputs with no profile must keep exactly the same normalized digest/payload as before. Profile changes must change the input digest so a receipt cannot be reused across profiles.

Maintain `fetcher.bind(globalThis)`, receipt-before-POST, no repeated paid POST after network failure, same-job GET recovery and separate archive/current/example identities. The successful knight remains unchanged. Downloads remain explicit. Keep the user in WORLDIFACT with its return link and all five worlds.

Do not claim that changing the 25-second polling interval accounts for a 16-minute job. Under healthy polling it only adds up to roughly one polling interval to visibility. Tune polling only inside the actual limiter; never add rate-limit failures by polling faster than three requests/minute.

## Tests and artifact package

Use a reviewable fail-closed worker patch against exact inspected source hashes rather than overwrite an unknown live worker. Refuse wrong versions before touching files; preserve originals. Test the patch against pinned source in CI, compile all patched files, exercise STANDARD and FAST with no paid fixture adapters, and produce a deterministic source/update artifact plus manifest and rollback instructions. An update package is not an installed worker.

Test mode validation, old-input/digest compatibility, capability absence, rejection before reservation, bound enforcement, current-candidate identity, no stale/partial success, no extra turn after ready draft, preserved structural checks, cancellation/timeout, no silent retries, no automatic export/refine, no-upscale truth labels, and provider-secret isolation. Verify real renderer output with a deterministic free Blender fixture when available; label fixture timing as fixture timing, not AI performance.

Run full WORLDIFACT lint/typecheck/tests/HTTP/build/foundations/Worker dry-run after runtime changes. A native browser API regression is not an Android/complete UI benchmark. Respect recorded browser-security blocks; do not route around blocked local previews using another browser, CDP or file URL.

## Benchmark and acceptance

For every authorized real run report both click-to-visible-GLB and worker durations with artifact identity, hardware, model/profile revision, actual texture sizes, triangles and errors. Compare equivalent prompts and explicitly disclose profile quality differences. Report sample count; one run cannot establish p95. Keep slow/failing attempts in the data. Do not silently exclude cold starts or queue wait.

FAST is performance-VERIFIED only after a real valid output is visible within 120 seconds with the relevant quality checks. Before that label it IMPLEMENTED/TESTED IN FIXTURES or BLOCKED FOR LIVE TEST, not '1–2 minutes achieved'. STANDARD time ranges are unknown; the sole present baseline is the owner's approximately 16-minute observation.

## Approval and publication

No new paid generation, quota increase/reset/refund, new cloud VM/GPU cost, production Oracle installation, source overwrite, contest submission or unrelated deployment without applicable approval. The earlier six-attempt ceiling is exhausted on the supplied screenshot. Complete free source/test work now, then ask for one clearly bounded new test authorization only when the tested worker can actually be installed and used. Do not spend a new trial before FAST capability is confirmed.

Keep docs/CONTEST_STATUS.md updated on the branch with exact PR/head/CI and deployment boundaries. Present GO/NO-GO for the specific release. Publish only the expected reviewed SHA under applicable explicit approval, and do not redeploy test-only changes in a way that resets active generation settings. Clearly state if Oracle access/source parity is the remaining blocker.

## Sources checked for this task

- OpenAI latency guide: https://developers.openai.com/api/docs/guides/latency-optimization — fewer sequential requests/tokens and separating first useful output from optional work; this does not guarantee our runtime.
- Current model guide before changing models: https://developers.openai.com/api/docs/guides/latest-model.
- Actual reviewed worker: https://github.com/teslaeco/Froge-MPC-2-test/tree/d3f61b842dcfeda2ed794210caafc391919a75be/oracle_connector.

Execute the safe implementation and tests. Do not just restate this brief or claim a separate Codex/Copilot agent ran unless its actual run was launched and observed.
