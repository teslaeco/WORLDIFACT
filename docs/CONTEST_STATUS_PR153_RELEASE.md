# WORLDIFACT — current release evidence

Updated 30 September 2026. All timestamps below are UTC.

## VERIFIED — actual Astra/Blender routing restored and published

The owner requested a working detailed character route after PR150 left that workflow blocked and authorized repair, merge and deployment after green checks. [PR #153](https://github.com/teslaeco/WORLDIFACT/pull/153) passed all six exact-head workflows at `f9c26e1ab70666d4395ec8654e92a3e01c49396c`, including [Verify WORLDIFACT 36717479887](https://github.com/teslaeco/WORLDIFACT/actions/runs/36717479887). It merged as `110055288c6508322afd4bb05ffd6c86b8cfc198` at 2026-09-30T12:54:06Z.

[Production publication 36717823536](https://github.com/teslaeco/WORLDIFACT/actions/runs/36717823536), deploy job `109895052089`, completed successfully. This first functional publication of PR153 produced Cloudflare version `b47e9061-4b61-463d-967f-6d8949fc677a` at 12:55:50Z. These identifiers record that observed release, not an assertion that no later documentation publication can produce another version.

Public Shop: https://worldifact.xodobrox.workers.dev/shop

At 12:55:59Z the public `/api/studio/status` check confirmed `ready=true`, `detailedReady=true`, `costGuardReady=true`, `outputPolicyReady=true`, `photoReady=true`, `detailedReferenceLimit=4` and `accountRequired=true`. An unauthenticated preparation request was rejected with HTTP401 before any model job. Deployed configuration has `ENABLE_STUDIO_JOBS=true` and `ENABLE_ORACLE_JOBS=false`. This is verified routing/readiness, not evidence of a newly generated realistic character.

## VERIFIED — root causes and implemented repair

The Shop previously selected `/api/blueprint` even for detailed characters, while the existing signed `/api/studio` route remained disabled. A bounded blueprint provides supported procedural scene objects, not the requested reference character. The installed Oracle photo protocol accepts four images and `side`, not the UI's `left`/`right` labels. Appending fixed instructions to long user prompts could also exceed Oracle's 5,000-character limit.

Detailed requests now use the real StudioCoordinator -> account-bound signed Studio endpoint -> existing Oracle/Codex -> Blender path. They do not use a blueprint substitute. One to four reference images are supported, including the owner's three views; four are not compulsory. All accepted image bytes are sent. Left/right map to the compatible upstream side enum while the original ordered labels travel in agentInstructions. The complete user prompt, up to 4,000 characters, fits because fixed manufacturing/reference instructions travel separately. The distinct procedural concept path retains its six-image capability and must not be confused with the four-image mesh path.

Current runtime proof is required before a new detailed job: the unchanged USD1.75 per-job guard, input-token preflight and low-reasoning/reconciled v2 output policy. Restoration changes only the account-bound Studio flag, not anonymous Oracle access, credit prices, customer quotas or provider-spend limits. Production rechecks the installed proof before publication and checks deployed readiness afterward without creating a model.

The existing signed receipt, single reservation and recovery survive duplicate clicks and lost connections. Newly completed jobs require an actual nonempty material-bearing GLB structure before completed settlement. Missing/invalid output fails and returns the customer reservation once; uncertain reads retain recovery. Structural inspection does not establish facial similarity, photorealism, texture quality or manufacturing approval. Safe cost-limit messages do not expose private upstream text. Mobile layout constrains form and preview widths instead of hiding overflowing controls; physical Android interaction remains unverified.

## VERIFIED — tests and production evidence

The final release passed **613 tests, 613 passed, zero failed, zero skipped**, plus TypeScript, build, real local HTTP smoke, foundation packaging and Worker deployment dry-run. Existing findings remain: 27 lint warnings, zero lint errors, and three dependency advisories (two moderate, one high). No forced dependency update was included.

Automated regressions exercise the real Shop submission handler and signed Studio/account state machines with deterministic provider fixtures. They cover four image payloads, long intact prompts, correct route selection, incompatible labels, missing/stale monetary proof, one-time250-point reservation, failed-output settlement, cost-limit errors and recovery. Fixtures are not live AI generation evidence. Earlier preparation failures exposed strict typing and a trailing-whitespace fixture mismatch; both were corrected without skipping tests or weakening behavior checks.

At 12:55:58Z the public no-cost release smoke passed for 16 HTML routes, 52 matching hub assets, 105 original application entries/assets, API404, explicit DEMO generation and origin rejection. The new detailed-route readiness/HTTP401 guard check passed at 12:55:59Z. Payment readiness/security checks passed. Existing deployment probes created and immediately expired isolated unpaid Stripe sessions; no customer card was charged and no purchase or historical credit correction was completed.

## VERIFIED — existing installed runtime policy

Initial [audit 36713365291](https://github.com/teslaeco/WORLDIFACT/actions/runs/36713365291) found the OpenAI / gpt-6-astra / connector33 runtime and the earlier failed cost-guard activation job; that job was not retried.

Extended [audit 36714798184](https://github.com/teslaeco/WORLDIFACT/actions/runs/36714798184), [preparation 36717085333](https://github.com/teslaeco/WORLDIFACT/actions/runs/36717085333), and the production preflight at12:55:32Z confirmed the already installed `astra-low-reconciled-v2` policy, low reasoning, 16,000 maximum output tokens, authenticated completed-usage settlement, reference input and existing USD1.75 cap. No blind reinstallation, provider-budget reset or cap increase was performed.

## UNKNOWN / not completed

No new paid character generation or visual-quality trial was executed by this repair. The requested character's appearance, reference fidelity and successful new export remain unverified. A structurally valid model can still be visually inadequate; do not advertise realistic quality from health status or unit tests. Existing cost limits can still reject a job that exceeds its approved budget.

Historical customer reimbursements have not been performed. Identify actual account/job ledger entries before correcting credits; do not infer a duplicate bank-card charge from screenshots. No customer balance was arbitrarily changed. New failure-settlement behavior is not evidence that previous deductions have been returned.

Release decision: **GO — actual signed detailed route restored and production readiness verified. UNKNOWN — successful new character generation and visual quality. Historical refund remains unresolved.**

## Preserved earlier evidence

The complete prior status ledger is retained byte-for-byte in [CONTEST_STATUS_ARCHIVE_20260930_BEFORE_DETAILED_RESTORE.md](CONTEST_STATUS_ARCHIVE_20260930_BEFORE_DETAILED_RESTORE.md), Git blob `7261825dd4121170b4ec43c96ee65b46d31284c3`. It includes PR150 safety changes, PR148 payments, earlier archive links, warnings and unperformed refunds. Its disabled-route statements describe the earlier release and are superseded by the observed PR153 routing publication above.

The current production workflow also runs on documentation pushes to main. A documentation-only follow-up can republish unchanged application code; it must not be described as incapable of creating another deployment version.
