# CODEX TASK — stop flat-photo cabinet outputs; raise reference-character geometry quality

Date: 2026-10-02
Scope: WORLDIFACT signed STANDARD Astra → Oracle/Codex → Blender generation.

## Owner evidence

Three real photos show an open industrial electrical control cabinet with deep enclosure geometry, door-mounted hardware, terminal strips, breaker/protection rows, relay/control modules, vertical wireways, thick top-entry power cables and dense colored control wiring.

The latest generated result visibly failed: it reproduced the reference photo as a large flat interior image inside a simple cabinet shell instead of reconstructing the electrical equipment in 3D. This must not be accepted as a successful paid detailed model.

The existing historical WORLDIFACT MCC asset proves that repeated industrial device geometry can be rendered at useful density, but it is not a substitute for the uploaded cabinet and must not be silently returned as the new result.

External industrial references reviewed for layout vocabulary only:
- Rockwell Automation CENTERLINE 2100 MCC manual: https://literature.rockwellautomation.com/idc/groups/literature/documents/in/2100-in012_-en-p.pdf
- Rockwell PowerFlex 750 cabinet/wiring data: https://literature.rockwellautomation.com/idc/groups/literature/documents/td/750-td001_-en-p.pdf
These sources support ordinary concepts such as plug-in units, terminal blocks, DIN/wiring bays and vertical wireways. They are not source geometry and must not be copied as proprietary model assets.

## P0 — industrial electrical cabinet reference mode

1. Classify photo-backed electrical/switchgear/MCC/control-cabinet prompts as `industrial-electrical-cabinet-v1`.
2. Send a strong agent contract: uploaded photos are geometry evidence, never a large visible texture/decal.
3. Build actual volumetric components: enclosure/doors, supports/backplates, DIN rails, slotted ducts, terminal strips, breakers/protection devices, contactors/relays/interface modules, displays/controllers, top cable entries, grounding, fan/door hardware and routed 3D cable bundles.
4. Devices must protrude from mounting surfaces. Cables must be 3D paths, not painted lines.
5. Use repeated/linked geometry where useful, but preserve the photographed layout/asymmetry.
6. Do not invent electrical ratings, safety certification or commissioned wiring. This is visual GAME reconstruction.
7. Before a customer job is settled as success, apply a structural GLB gate. Reject sparse/photo-card results. A rejected output returns the reserved customer points and never starts an automatic replacement generation.
8. The gate is structural, not a perceptual-likeness or electrical-engineering certification.

## P1 — realistic reference character / figurine mode

For photo-backed human/character/figurine requests:
- require volumetric head/face, ears, neck, limbs, hands with separated fingers, feet/shoes and hair volume;
- require layered garment geometry with thickness, seams/hems/folds/straps/hardware rather than a body texture;
- separate skin/hair/fabric/rubber-metal-plastic material regions;
- keep front/side/back consistency and prefer a good static mesh over a broken rig;
- reject billboard/cutout/extremely sparse proxy output structurally;
- keep MAKE as validation-required; no manufacturing claim.

## Accounting and security

- Preserve the existing GPT-6 Astra model, USD1.75 provider guard, 250-point customer cost, cache accounting, 15-minute request timeout and no-auto-retry rule.
- Bind the quality profile to the signed account job reservation so a later poll cannot downgrade the acceptance rule.
- Repeated submissions with the same job id but a different quality profile must fail closed.
- Cross-account receipts remain invalid.
- Do not touch Stripe, PayPal, plans, subscription grants or unrelated balances.

## Game Lab library

The already merged library fix must remain intact: every locally archived GLB stays visible in Game Lab; server verification is additive only. No generation occurs on library refresh.

## Regression / release gates

- cabinet request receives the industrial true-3D instructions;
- realistic character request receives the layered-character instructions;
- sparse deterministic GLB fails both detailed gates;
- dense deterministic multi-mesh GLB passes;
- a sparse cabinet result settles failed and refunds exactly once;
- a dense cabinet result settles completed once;
- all existing idempotency, receipt, payment, private-world and artifact tests remain green;
- lint, typecheck, full tests, HTTP smoke, build, foundations and deploy dry-run green;
- no paid API test is required to merge this code-level guard;
- production deployment only after exact-head green CI and owner authorization (already given in chat for this repair window).
