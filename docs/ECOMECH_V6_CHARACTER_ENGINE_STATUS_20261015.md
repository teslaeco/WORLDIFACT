# ECOMECH V6 — Character Engine P0: original geometry and QA, 2026-10-15

**Status:** IMPLEMENTED (experimental), TESTED (real image-to-mesh and QA), **NO-GO visual quality**, **NOT DEPLOYED**.  
**Draft PR:** https://github.com/teslaeco/WORLDIFACT/pull/298, depends on V5 https://github.com/teslaeco/WORLDIFACT/pull/297.  
**Original source image:** SHA-256 `9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053` (1122 × 1402 PNG), no replacement artwork.

## What was genuinely implemented and tested

- Character V5 fixes the concrete routing defect: an image-guided humanoid robot with **MCC/motors/contactors** must never be misclassified as a cabinet. Its system prompts now prioritize helmet/limbs/proportions/grip, real physical components, actual views, visible pixels, truthful failure and no automatic model switch. The user can see Sol/Astra **advice** and price before explicitly choosing the draft model; neither advice nor read-only inspections submit paid jobs.
- V5 legacy reservation test was corrected to match the **actual existing accounting contract**, without touching balances or production ledger code: the legacy `/reserve` request without Studio funding binding deducts 250 spendable points and does not increase the newer `reservedCredits` hold ledger. An identical original UUID does not debit twice. Reference-quality classification is not a new tariff.
- [V5 full repository verification #38701270312](https://github.com/teslaeco/WORLDIFACT/actions/runs/38701270312): SUCCESS on `827fe3b7`. V5 remains draft, no production merge.
- [V6 single-image open neural CPU #38697241335](https://github.com/teslaeco/WORLDIFACT/actions/runs/38697241335): SUCCESS, genuine TripoSR geometry. **It visually fails** to separate armored plates and exposed mechanics.
- [V6 six-part native neural CPU #38698419490](https://github.com/teslaeco/WORLDIFACT/actions/runs/38698419490): SUCCESS. Exact original approved reference produced six separate neural meshes (helmet, chest, raised arm/chili, lowered exposed arm, armored leg, mechanical leg) using local TripoSR (open source) and WORLDIFACT's assembly.
- Original six-part GAME GLB **4,376,136 bytes**, SHA-256 `193ad27bd19ec94941b24222662024460d62758c7e2b0e53e7e55e51196f5970`, actual **218,450 instantiated triangles**, **six meshes**. This is **NOT an Astra-made mesh**; TripoSR MIT original source code is attributed to Tripo AI & Stability AI. No Tripo/Meshy paid vendor API calls.
- [V6 independent geometry/PBR QA #38701960353](https://github.com/teslaeco/WORLDIFACT/actions/runs/38701960353): SUCCESS. This test **correctly rejects** quality/release with factual evidence. Original artifact retrieval and material QA are bounded/untampered. Follow-up test exercises tampered task manifest, invalid GLB and score leakage.
- [V6 original artifact archive #38702243568](https://github.com/teslaeco/WORLDIFACT/actions/runs/38702243568): SUCCESS. Original GLB and QA manifest persisted under `research/ecomech-v6-neural-originals/` **outside** `public/`, not published as a Shop product. Commit `d02a706e6dcc036920a9e620a64179fc818eecb8` contains the genuine original binary as a Git blob.
- **New OpenAI API spend this milestone: USD 0.00**. External paid geometry services, GPU rentals, customer points, Stripe, original Oracle job and existing subscriptions: **no change**.

## Quality evidence — why the model is still NOT premium

| Test on actual six-part GLB | Measured | QA result |
|---|---:|---|
| Triangle faces | 218,450 | Structural evidence, not photorealism |
| Body bbox X/Y/Z | 1.736 / 2.692 / **0.301** m | Extremely flattened depth |
| Depth / height | **0.11164** | FAIL, threshold 0.15 |
| Draft manually drawn reference silhouette IoU | **0.80342** | NOT independent! The same image annotation guided part placement; never infer similarity confidence or publish as a win |
| Embedded glTF materials | **0** | FAIL |
| Embedded textures/images | **0** | FAIL |
| Normal/PBR metallic-roughness image maps | **0 / 0** | FAIL |
| Rig/animation | 0 / 0 | NOT READY |
| Four authentic model-angle human-reviewed renders | Not confirmed for V6 | BLOCKED |
| Actual invoice/settlement of older failed V4 Astra UUID | UNKNOWN | No paid retry |
| GAME storefront review | **NO-GO** | No premium or production |
| MAKE | **BLOCKED** | No printing/selling as manufacturable |

Full original QA report: `research/ecomech-v6-neural-originals/independent-qa.json`. The V5/HQ geometry is an independent development branch and neither PR is merged. A green test here proves the quality gate **blocked** bad geometry; not that the output looks better than Tripo, Meshy or the user's original image.

## MPC2 reference baseline and next actual quality work

The original reference project `teslaeco/Froge-MPC-2-test` has `docs/CHARACTERS_V10.md`, `oracle_connector/runtime/anatomy.py`, a genuine anatomical mesh and packed normal/textile maps, and actual Blender render validation. Its v10 character quality work is useful for normal/skin/fabric topology and a truthful face review, not permission to copy unreviewed licensed meshes/textures into WORLDIFACT. It does **not** provide a detailed humanoid mecha automatically.

Remaining P0: physically deep asymmetrical robot anatomy, correctly identified mechanical parts, real detailed PBR/albedo/normal maps, coherent UV, reliable full 360-degree meshes, Blender actual multiview renders and subjective likeness acceptance. A single view cannot establish the unseen rear exactly. Open-source higher-quality reconstructor with a suitable authorized GPU or a manually engineered Blender hard-surface sculpt is necessary before making superiority claims. Paid GPU/vendor inference requires a separate quote/approval. Never disguise provider provenance; OpenAI Astra can be the controller without being the underlying geometry model.

## Release / finances

Do not merge either draft PR or deploy production without an explicit GO/NO-GO and confirmation. No new spending or customer account data modifications were made. The initial failed V4 Astra original UUID remains non-retriable without its final cost evidence. We did not enable an external vendor key, author a new billable API, publish the GLB in `public/`, or claim premium-ready quality. Latest V6 full CI after GitHub Actions bot archival push may display **ACTION_REQUIRED** and requires an authoritative exact-head run before merge; do not mislabel it green.
