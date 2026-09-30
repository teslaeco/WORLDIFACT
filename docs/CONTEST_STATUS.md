# WORLDIFACT — current release evidence

Updated 30 September 2026. Times below are UTC.

## Actual Astra/Blender route restoration — awaiting final PR checks

Owner explicitly requested a working detailed character route after PR150 left that workflow blocked, and authorized repair, merge and deployment after green checks. This follow-up is not deployed yet. Last recorded functional release: PR150 / `d3a7dd53783035eb1d8ea839a9460987b0202d4e`.

## VERIFIED — root causes and repair

The Shop selected `/api/blueprint` even for detailed characters, while the existing signed `/api/studio` model route remained disabled. The bounded blueprint engine cannot deliver the requested reference character. The installed Oracle photo protocol accepts four images and `side`, not the UI's `left`/`right` labels. Long user prompts plus appended fixed instructions could exceed Oracle's 5,000-character ceiling.

The repair sends detailed requests through the real StudioCoordinator -> account-bound signed Studio endpoint -> existing Oracle/Codex -> Blender path. It never substitutes a blueprint for a character. One to four images are supported, including the owner's three views; no compulsory four-image minimum. All accepted image bytes are sent. Left/right map to the compatible upstream side enum while original ordered labels travel in agentInstructions. The full 4,000-character user prompt fits because the fixed manufacturing/reference instructions are carried separately.

A new job can be prepared only after current runtime proof of the unchanged USD1.75 per-job guard, input-token preflight and low-reasoning/reconciled v2 output policy. Restoration changes only the account-bound Studio flag, not anonymous Oracle access, credit prices or provider-spend limits. The public release job checks this proof again before publication, and checks deployed readiness plus unauthenticated rejection afterward without creating a model.

The existing signed receipt, one-reservation rule and recovery survive double-clicks and lost connections. Newly completed jobs require an actual nonempty material-bearing GLB structure before completed settlement. Missing/invalid output fails and settles customer credit once; uncertain reads retain recovery. Structural inspection does not prove facial similarity, photorealism or manufacturing approval. Fixed cost-limit messages do not leak provider details. Mobile layout now constrains form widths rather than hiding overflowing controls.

## VERIFIED — read-only runtime evidence

Initial [audit 36713365291](https://github.com/teslaeco/WORLDIFACT/actions/runs/36713365291) found the existing OpenAI / gpt-6-astra / connector33 runtime and the previously failed cost-guard activation job. No new attempt was made.

Extended [audit 36714798184](https://github.com/teslaeco/WORLDIFACT/actions/runs/36714798184) at 12:27 confirmed the installed `astra-low-reconciled-v2` policy, low reasoning, 16,000 maximum output tokens, authenticated completed-usage settlement, photo input and the existing USD1.75 cap. The current check in [preparation 36717085333](https://github.com/teslaeco/WORLDIFACT/actions/runs/36717085333) also passed. Installation was already present; no blind reinstallation or budget reset was performed.

## Verification and release gate

Preparation run `36717085333` passed full `npm run verify`, foundation packaging, deployment dry-run and the fresh authenticated runtime check before committing source as `a59364dd307c0aa16bdfda3809ea41e95d830617`. Final ordinary-source PR workflows are still required after the publication workflow is included and temporary preparation workflows are removed. Earlier preparation failures exposed a strict union type and trailing-whitespace fixture mismatch; both were corrected without skipping tests or weakening behavioral assertions.

## UNKNOWN / unchanged limitations

No new paid character generation or live visual-quality trial has been executed. Automated provider fixtures are not live AI evidence. Physical Android/WebGL interaction and a successful new download of this requested character remain unverified. Historical customer reimbursements have not been performed; identify the actual account/job ledger before correcting credits. No customer card was charged, and no price, quota or spend safeguard was increased.

Release decision: pending exact-head green checks and guarded production publication. Even after routing is available, realistic appearance and reference fidelity require a real reviewed generation; do not call them verified from service health or unit tests.

## Preserved earlier evidence

The complete prior status ledger is retained byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260930_BEFORE_DETAILED_RESTORE.md](CONTEST_STATUS_ARCHIVE_20260930_BEFORE_DETAILED_RESTORE.md), Git blob `7261825dd4121170b4ec43c96ee65b46d31284c3`. It includes PR150 safety changes, PR148 payments, earlier archive links, warnings and unperformed refunds. Its disabled-route statements describe the earlier release, not the intended restored route in this PR.
