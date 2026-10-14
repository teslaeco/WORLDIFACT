# AI Shop provider parity recovery — 2026-10-13

Status: IN PROGRESS — isolated branch; no production changes.

## Goal
Preserve GPT-6 Astra as the default and foundation. Make AI Shop use the same proven Oracle/Blender MCP generation lifecycle as the working Froge MPC2 Studio. Add selectable GPT-6.1 Sol and GPT-6 Luna via the server-side OpenAI Responses API.

## Verified API model IDs
- Astra: `gpt-6-astra` (default)
- Sol: `gpt-6.1-sol`
- Luna: `gpt-6-luna`
Source: https://developers.openai.com/api/docs/guides/latest-model

## Implementation acceptance criteria
1. Inspect current WORLDIFACT backend routes, queue, worker bindings, Oracle dispatch, and reference Froge-MPC-2-test; do not blindly copy code or secrets.
2. Preserve existing Astra provider and request/response contracts. Allow Sol and Luna only when the configured API project supports them; distinguish unsupported/unavailable from successful generation.
3. All provider calls occur server-side. Keep secrets in existing secret stores. No keys in VITE_* or commits.
4. Preserve model selection across job submission, Oracle execution, status polling, preview, library persistence, and download. A selected model must actually be called, not merely displayed.
5. Reuse working idempotent Oracle job dispatch and durable status/retry behavior. Never create duplicate paid jobs after refresh/retry; deduplicate by idempotency key.
6. The selected model creates validated structured specifications; Blender/Oracle creates GLB. Never label a specification as a finished 3D asset.
7. Test prompt-only and image-reference inputs for all three models, with real backend evidence and explicit cost limits.
8. Preserve Stripe, pricing, subscriptions, user points, credit accounting, library assets, RLS, and current production configuration. Do not bypass quotas or financial gates.
9. Run lint, typecheck, tests, build, end-to-end preview/library/download smoke. Record actual model, Oracle job ID, timings, and redacted evidence.
10. Do not merge or deploy until CI is green, live generation is verified, and the owner explicitly approves release.

## Source observations
- WORLDIFACT main history includes #266 image references, #267 Shop exports, #268 Sol/Luna pipeline gates, #269 status throttling, #271 stale errors.
- Froge-MPC-2-test latest visible commit 44c53208 restores 900s Astra/Blender limits; this alone does not prove production equivalence.
- Production connectivity and end-to-end live generation are not yet verified in this recovery.
