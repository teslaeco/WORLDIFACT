# 15 October 2026 — PR #304 recovery: source-mask selection repaired

**IMPLEMENTED / TESTED on draft only. No new 3D job, paid provider request, merge, production deployment, customer-credit change or supplier order.** This is not a completed printable ECOMECH.

## Actual defect and correction

The original SAM2 input-point nesting defect and two wrong background annotations were already corrected in earlier saved commits. The actual v3 mask run [38751646199](https://github.com/teslaeco/WORLDIFACT/actions/runs/38751646199) passed its sparse-point screen, but its score-ranked selected mask (candidate 5) still removed parts of the visible forearm, ankle and foot. Passing a handful of points did not ensure the object between those points survived.

`mask_selection.py` now checks eleven manually reviewed source-image surface regions, requiring at least 95% retention in each, as well as the existing foreground/background and gap checks. Model scores only rank candidates AFTER this screen. No missing pixels are repainted or invented. The SAME selector is called by `sam2_reference_mask.py`; it is not a disconnected test-only fix. If no candidate passes, the script preserves evidence and refuses to produce an accepted mask.

Actual archived-mask replay changes selection from candidate 5 to candidate 3. In the fixed inspected rectangles: exposed forearm 64.56% -> 100%; heel armor 46.88% -> 100%; front foot 79.33% -> 100%. These are retained original-image pixels, **not mesh/likeness scores**. The lowest retention across eleven rectangles is approximately 97.32%; this is a limited research screening set, not full segmentation ground truth or human acceptance.

Original reference PNG SHA-256: `9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053`.
Correctly selected existing mask SHA-256: `91933979952de85d92cb3a925cbe9edaf8d79510889b0219a953ec6a293bd0a6`.

## Execution evidence

- [Real SAM2 CPU inference with the integrated selection fix, 38758676041](https://github.com/teslaeco/WORLDIFACT/actions/runs/38758676041): **SUCCESS**. This is source masking only, not a new 3D inference.
- [Independent existing-mask replay + seven regression tests, 38758804991](https://github.com/teslaeco/WORLDIFACT/actions/runs/38758804991): **SUCCESS**, including the actual archived masks and unchanged-input hashes. No inference is performed in this replay.
- [All offline reconstruction contracts, 38758811745](https://github.com/teslaeco/WORLDIFACT/actions/runs/38758811745): **SUCCESS** at tested code `6a7e7276520287a2adcd5aaf2c577af02c0fd40e`.
- [Full repository verify, 38758811741](https://github.com/teslaeco/WORLDIFACT/actions/runs/38758811741): still running when this checkpoint was written. Observe final exact-head status separately; do not assume green.

## Remaining 3D/GPU export blocker

The previous official Microsoft TRELLIS.2 GPU session returned provider previews but its GLB export failed with an authentication/free-quota category. No original GLB was received. That run was NOT retried here, no quotas bypassed, no GPU rented. See [the detailed prior session receipt](TRELLIS2_SESSION_RECOVERY_20261015.md). Native checkpoint/export recovery code was already saved before this continuation; native GPU execution remains unverified. The final reference-faithful, supplier-ready mesh is **NOT finished**. New masking tests cannot prove that a subsequent 3D reconstruction will meet that target.

## Preserved production history

The complete prior status has been retained byte-for-byte as [CONTEST_STATUS.before-mask-integrity-20261015.md](CONTEST_STATUS.before-mask-integrity-20261015.md), blob `f792c23027b83e3adf759b3f04fb313f59b6625d`. It records the separately approved live Chess/navigation release. This PR does not alter that deployment or its secrets/accounts.
