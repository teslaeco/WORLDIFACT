# WORLDIFACT — TerraformingPlanet heroine integration

Updated 1 October 2026. The owner explicitly approved one bounded paid GPT-6 Astra character test and deployment while preserving the new payment system.

## VERIFIED — generator restoration and payment boundary

PR #156 merged as `bcc63fbfff94a00b671bda1394f593acd3c5cfa3` after six green exact-head workflows. Its Cloudflare publication run `36815630843` and application CI `36815630885` passed. The Oracle cache-accounting helper had already been installed from the owner's OCI Cloud Shell and reported `CACHE_ACCOUNTING_VERIFIED`, `max_provider_usd: 1.75`, `payment_settings_changed: false` and `WORLDIFACT_CACHE_FIX_INSTALLED`.

Stripe, PayPal, subscriptions, product prices, generation-credit rates and customer balances were not rolled back by this restoration. The Astra job cap remains USD 1.75.

## VERIFIED — exactly one live Astra / Oracle / Blender heroine job

The one-time workflow [36815867329](https://github.com/teslaeco/WORLDIFACT/actions/runs/36815867329), exact source `a5c8266f7c4b5c3348d6913bd48e90d759917f0d`, completed successfully with no automatic retry and no customer checkout or credit mutation.

- Model: `gpt-6-astra`
- Oracle job: `a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- Maximum provider reservation: USD 1.75
- Submitted jobs: 1
- GLB: 15,281,768 bytes; SHA-256 `92d777562e0292f2175f2bf4c6580fb4df03614e38f738afec2efcd25ed3028a`
- GLB structural inspection: 368,760 triangles, 21 meshes, 8 materials
- BLEND: 26,457,988 bytes; SHA-256 `946c0ec1427cc710bc52877508c4c891f2d3361ce1322d1d12fc81fed4705bed`
- FBX export: FAILED
- PBR ZIP export: FAILED
- Actual provider invoice cost: UNKNOWN; the USD 1.75 figure is the enforced maximum reservation, not a claimed invoice charge.

The private chat reference images were NOT committed to the public repository and were NOT transported by this GitHub Actions test. Their visible design was translated into the fixed written character brief: adult silver-haired sci-fi heroine, pearl-white/black/cyan outfit, empty hands, no glowing orb, full-body GAME asset. Therefore this run verifies the written-design pipeline, not pixel-level multi-view similarity to the three uploaded images.

The workflow's success is mechanical evidence of a real generated 3D model and valid GLB structure. It is NOT a human visual-fidelity approval. Visual quality remains `REQUIRES_HUMAN_REVIEW`.

## IMPLEMENTED — shared TerraformingPlanet world integration

Branch `feat/terraforming-heroine-world-20261001` wires the exact successful job into a dedicated read-only avatar route:

- `/api/avatar/terraforming-heroine`
- source job fixed to `a8e67f26-7f72-4e90-a0b2-4f0f6ad0e781`
- no generation is triggered by avatar loading
- bounded GLB validation, lossless transport and existing cache controls are preserved
- `TerraformingPlanet Heroine · Astra / Blender` is added to the world character picker
- the new heroine becomes the default shared-world avatar; Neptune Queen and the archived Rapper remain selectable
- an unrigged heroine may receive the existing GAME-only approximate locomotion binding; original generated geometry/materials are not silently replaced.

Focused regressions cover exact Oracle job routing, client cache reuse, world picker/default wiring and failure isolation. Full exact-head CI and deployment are required before this integration is called live.

## LIMITATIONS / NO FALSE CLAIMS

FBX and separate PBR ZIP were not produced by the test. Do not advertise those exports for this character yet. The GLB and BLEND are the verified outputs.

No claim is made that the generated face, fingers, garment details or overall likeness already match the supplied artwork. A browser/visual review is still required after deployment.

No manufacturing approval was produced. MAKE remains validation-required.

Release decision: GO for CI/release of the exact generated GLB as a GAME avatar if the integration PR is green. NO-GO for claiming reference-perfect likeness, FBX/PBR completeness or manufacturing readiness.
