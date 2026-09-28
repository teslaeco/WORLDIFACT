# Codex task: model prices, inclusive draft quality and Astra output allocation

Work in a branch based on `0d9d444ed783b808c667d5cb0f13557716d53ff5`. Preserve all customer balances, subscriptions, original models and the existing production Oracle files. Do not run another paid test or reset the already consumed one-off test approval.

Implement and test:
1. A single shared reviewed model catalogue used by UI and server: GPT-6 Luna 5 points (maximum provider reservation USD0.03), GPT-6 Sol 50 (USD0.35), GPT-5.6 Terra 60 (USD0.42), GPT-6 Astra 250 (USD1.75). Terra is not a guessed GPT-6 ID and is not cheaper than Sol at current Standard output pricing.
2. Per-request server model validation, model-bound idempotency, debit before provider work, and no fallback to a more expensive model. Preserve the shared funded free pool and separate provider ledger.
3. Native model selector adjacent to the prompt and a matching price/balance notice. Budget mode may analyze one normalized reference within the same funded cost ceiling; changing a model never starts a job or a payment.
4. A meaningful free-quality baseline: modular MCC bays with bevels, separate door/control/HMI/indicator geometry and procedural roughness/normal maps. Free and paid procedural previews must use the SAME geometry/material recipe. Clearly label inference and GAME/MAKE boundaries.
5. Correct the Astra high-reasoning/output-budget interaction. Preserve USD1.75/job, account-level reservations, interrupted-stream holds and the old FAST guard. Reconcile a job-local reservation only against verified completed provider usage, once; never restore unknown spend. Provide a reviewed, reversible Oracle upgrade, not an unconditional remote overwrite.
6. Save provider evidence before exports in test tools. Correct the headless DataTexture export gap without claiming a browser/device test.
7. Write an evidence-based MCC case study. Reference photo and earlier unfinished WORLDIFACT screenshot are available, but a matching Meshy result and the owner's improved final Astra result must be supplied before awarding a winner. Do not fabricate images, ratings, mesh counts or performance claims.

Run `npm run verify`, `npm run deploy:check`, the new model/ledger/geometry tests and the Python guard tests. Report exact commit/run IDs, unresolved tests and actual versus unverified deployment state. Open a PR. Do not merge, activate paid Astra or launch promotion merely because unit tests pass.

Execution note: this is the task specification for reproducibility. Implementation and CI execution must be evidenced separately; the existence of this file does not prove an external Codex agent was run.
