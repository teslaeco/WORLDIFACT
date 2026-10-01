# WORLDIFACT — TerraformingPlanet Astra heroine released

Updated 1 October 2026.

## VERIFIED — one bounded live Astra character generation

The owner explicitly approved one paid GPT-6 Astra / Oracle / Blender character test with an unchanged maximum provider reservation of USD 1.75 and no automatic retry.

Workflow [36815867329](https://github.com/teslaeco/WORLDIFACT/actions/runs/36815867329), exact source `a5c8266f7c4b5c3348d6913bd48e90d759917f0d`, completed successfully.

- model: `gpt-6-astra`
- Oracle job: `a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- submitted jobs: 1
- automatic retries: 0
- customer charges/checkouts: 0
- maximum provider reservation: USD 1.75; actual provider invoice cost remains UNKNOWN
- GLB: 15,281,768 bytes
- GLB SHA-256: `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`
- structural inspection: 368,760 triangles, 21 meshes, 8 materials
- BLEND: 26,457,988 bytes
- BLEND SHA-256: `946c0ec1427cc710bc52877508c4c891f2d3361ce1322d1d12fc81fed4705bed`
- FBX: FAILED
- separate PBR ZIP: FAILED
- visual fidelity: REQUIRES_HUMAN_REVIEW

The three chat reference images were deliberately not published to the public GitHub repository and therefore were not passed as image bytes through this Actions test. Their visible character design was translated into the fixed generation brief: adult silver-haired sci-fi heroine, pearl-white/black/cyan outfit, empty hands and no glowing orb. This verifies the written-design generation path, not pixel-level multi-view similarity to those private chat images.

## VERIFIED — production integration

PR #157 passed all five exact-head checks at `31e0a023b61570cefc898f2a00a6e4e328691ae4` and merged as `2f8a94cca1f7d32a0a1706bd031024c926db0a3c`.

The integration:

- exposes only the exact generated job through `/api/avatar/terraforming-heroine`
- keeps bounded GLB validation and cache controls
- never starts generation while loading an avatar
- adds `TerraformingPlanet Heroine · Astra / Blender` to the shared-world character picker
- makes the heroine the default shared-world avatar
- preserves Neptune Queen and Rapper as selectable characters
- allows the existing GAME-only approximate locomotion binding when the generated model has no usable native rig
- leaves Stripe, PayPal, subscriptions, prices, credit rates and customer balances unchanged.

Production run [36816617943](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816617943), job `110222959900`, passed all release checks. It ran **615 tests: 615 passed, 0 failed**, typecheck/build/foundations/deployment dry-run, detailed-worker verification, payment no-charge readiness probes, Cloudflare deployment and public smoke. Cloudflare published version `052b2311-130a-428d-abf1-807a31b7361f` to https://worldifact.xodobrox.workers.dev.

## VERIFIED — exact production GLB readback

A separate no-cost post-deployment workflow [36816788673](https://github.com/teslaeco/WORLDIFACT/actions/runs/36816788673), job `110223489733`, fetched the public production route and required:

- HTTP success
- `Content-Type: model/gltf-binary`
- `X-WORLDIFACT-Avatar: TerraformingPlanet-Heroine-Astra`
- `X-WORLDIFACT-Source-Job: a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- valid GLB v2 header and exact embedded length
- payload larger than 10 MB.

Production returned exactly 15,281,768 bytes with SHA-256 `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`, identical to the generated test GLB.

## PAYMENT / GENERATION SAFETY PRESERVED

PR #156 had already restored authenticated completed-cache accounting and the owner installed the Oracle helper successfully with `CACHE_ACCOUNTING_VERIFIED`, `max_provider_usd: 1.75`, `payment_settings_changed: false` and `WORLDIFACT_CACHE_FIX_INSTALLED`.

This heroine release does not revert the current payment plans and does not change the USD 1.75 Astra job cap.

## LIMITATIONS — do not overclaim

The model has not received a human visual-fidelity approval in this release. Structural success and production delivery do not prove that the face, hands, hair or outfit exactly match the supplied artwork.

FBX and separate PBR ZIP are not available for this character yet. GLB and BLEND are the verified outputs.

MAKE remains validation-required. No manufacturing approval, supplier acceptance or production-ready claim was created.

Release decision: **GO — the generated Astra heroine is live as the default TerraformingPlanet/WORLDIFACT shared-world GAME avatar. NO-GO for reference-perfect-likeness, FBX/PBR-complete or manufacturing-ready claims until separately verified.**


## VERIFIED — Oracle timeout maintenance completed before this recovery fix

The owner-installed Oracle maintenance completed successfully on 1 October 2026 with `ASTRA_REQUEST_TIMEOUT900_VERIFIED`, `astra_request_timeout_seconds: 900`, `agent_budget_seconds_unchanged: 1800`, `max_provider_usd: 1.75`, `payment_settings_changed: false` and no paid quality test. A later authenticated read-only health probe confirmed production remained `ready: true`, `provider: openai`, `model: gpt-6-astra`, connector v33, agent budget 1800 seconds, photo planning budget 900 seconds and the current cache-accounting/output-policy evidence.

## VERIFIED — separate stuck-job UI incident

A later Shop screenshot showed one saved detailed job still rendered as `Preparing your model…` after more than 92 minutes. This is not evidence that Astra was still executing. Source inspection found a client recovery defect: after four consecutive status-read failures Shop returned from its polling loop permanently, while the elapsed-time interval continued. WorldCharacterStudio had equivalent stop-after-errors behavior and an additional finite-attempt polling stop.

The same screenshot also showed the exact account-ownership error `This model belongs to a different account or has no account receipt.`, which the prior client treated as a thrown poll error while retaining the current selection.

## IMPLEMENTED — GET-only stuck-job recovery candidate

Branch `fix/studio-stuck-job-recovery-20261001` implements the Codex task recorded in [CODEX_TASK_STUDIO_STUCK_JOB_REPAIR_20261001.md](CODEX_TASK_STUDIO_STUCK_JOB_REPAIR_20261001.md):

- normal polling remains 25 seconds;
- after four consecutive poll failures the UI switches to reconciliation/status-review instead of pretending generation is active;
- recovery continues using GET only every 60 seconds and never submits a replacement paid job;
- a later successful/terminal GET automatically supersedes the temporary review state;
- an exact account-ownership 403 becomes a preserved local reconciliation state rather than an endless thrown error;
- users can explicitly archive the uncertain local recovery receipt; the existing receipt-history path is used and this action does not cancel, refund or resubmit the server job;
- server-side nonterminal jobs older than 40 minutes from the actual entitlement reservation timestamp return `pending + reconciliationRequired`, without settling or refunding the reservation;
- a later real `succeeded`, `failed` or `cancelled` worker state still wins;
- WorldCharacterStudio now uses the same safe recovery behavior and no longer stops permanently after four failures or its prior attempt counter.

Stripe, PayPal, plans, point prices, customer balances, the USD1.75 Astra guard, the installed 900-second Astra request timeout, Oracle model identity and stored artifacts are unchanged.

## BLOCKED — production proof for the 92-minute job

This branch has not yet been merged or deployed. The already-visible 92-minute browser receipt has not been inspected through the user's current browser storage, so its actual Oracle terminal state remains UNKNOWN. Do not claim that old job is repaired or refunded merely from this source change.

Release decision for this hotfix remains **NO-GO until exact-head CI is green and the owner separately approves merge/deployment**. After deployment, verify the public Shop recovery state with no paid generation.
