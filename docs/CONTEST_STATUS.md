# WORLDIFACT — generation restoration remains open

Updated 30 September 2026. Owner instruction: restore generation while preserving all new payments. [PR156](https://github.com/teslaeco/WORLDIFACT/pull/156) is based on production source `673be0cecd83ebb5959770fe90716cd2485369e5`; it is not a full rollback.

## VERIFIED — preservation boundary

The GitHub PR changed-file listing contains exactly five files: this evidence record, `tools/profit_guard/astra_spend_v2.py`, `install_cache_accounting.py`, `test_cache_accounting.py` and `test_cache_install.py`.

No files in `server/`, `src/`, `.github/`, `config/` or `public/` are changed. No payment product, price, subscription, checkout, webhook, entitlement balance, generation-credit rate, credential, database or deployed environment was changed. This code update is limited to the Oracle guard helper, its opt-in maintenance installer, regression tests and this record.

The existing deployment workflow publishes Cloudflare application code, not the installed Python process on Oracle. Merging this branch alone must NOT be reported as restoring the model worker. Do not perform a cosmetic application deployment and claim the Oracle fix is live.

## VERIFIED — a concrete accounting defect; full incident cause remains UNKNOWN

The existing `astra_spend_v2.settle_completed` ignores `usage.input_tokens_details` and prices every completed input token at 14 micro-USD. It therefore fails to release the unused part of the conservative hold when the authenticated provider response confirms discounted cache reads. This can prematurely stop multi-step generation, but the owner's screenshots do not include cached-token counts and do not prove cache hits in those failed jobs. Failed model-building arguments and the generic guard error still require actual job evidence.

Official sources reopened on 30 September:
- [Astra model and pricing](https://developers.openai.com/api/docs/models/gpt-6-astra): Standard short input $10/M, cache reads $1/M, writes $12.50/M, output $50/M; long-context boundary 272K.
- [API pricing](https://developers.openai.com/api/docs/pricing): 10% regional-processing uplift.
- [Cache usage fields](https://developers.openai.com/api/docs/guides/prompt-caching): `cached_tokens` and `cache_write_tokens` in input-token details.

## IMPLEMENTED — same cap, evidence-based settlement

Preflight still reserves all input plus 2,048 tokens of headroom at the unchanged worst-case 14 micro-USD/token. Output remains bounded at 16,000 tokens and 55 micro-USD/token. The total USD1.75 per-job cap, expiry, model, reasoning policy and Standard service tier are unchanged.

Only a completed response from the existing authenticated same-request stream can release unused funds. Complete, valid cache details price confirmed reads at a conservative 2 micro-USD/token (above $1.10/M including regional uplift). All other input, including cache writes, stays at 14. Missing or partial details use the old conservative bound; malformed, contradictory, incomplete, wrong-model or wrong-tier responses preserve the original hold. Duplicate completions cannot release funds twice. Historical completed entries and unknown legacy reservations are never recalculated or reset.

`install_cache_accounting.py` defaults to PLAN ONLY. Explicit maintenance checks exact reviewed source ancestry and the old helper blob, verifies current receipts/services and an empty job queue, backs up touched files, replaces only the helper and its hash receipt, runs the genuine offline Codex/MCP/Blender verifier with provider fixtures, then checks the local authenticated `astraCacheAccounting=astra-confirmed-cache-v1` marker. A failed check rolls back the touched helper/receipts. It does not cancel jobs, invoke a paid model, change customer billing or raise limits. The installer has not been executed on Oracle.

## VERIFIED — exact implementation-head CI

All six PR workflows passed for implementation head `5e5a98e1df0922191e62b72c7c5bae49caef9145` (GitHub test merge `0c1b280c8898dd63d624a63e6ccd3dc71591083b`):

- [Astra guard verification 36773686202](https://github.com/teslaeco/WORLDIFACT/actions/runs/36773686202), job110086145850: **56 tests passed, zero failed, zero skipped**, including exact installed-source ancestry reconstruction from the pinned private reference. The earlier local five skips are resolved in this CI result.
- [Verify WORLDIFACT 36773686033](https://github.com/teslaeco/WORLDIFACT/actions/runs/36773686033), job110086144980: **613 application tests passed, zero failed, zero skipped**, TypeScript, build, local HTTP smoke, foundation assembly and Worker deployment dry-run passed.
- The four existing FAST installation/worker/launcher and Oracle project-file review workflows also passed. No new privileged workflow was created.

The actual application test log includes payment recovery, preserved active subscriptions, additive/idempotent grants, checkout reuse, webhooks and generation reservation tests. Those tests use deterministic fixtures, not customer card charges or a successful new AI model. Existing findings remain: 27 lint warnings and three dependency advisories (two moderate, one high); no forced dependency upgrade was made.

At 20:36:46Z the existing read-only CI service probe received HTTP200 and READY from production Studio and Oracle health, without credentials, model downloads or generation POSTs. This shows the service was responding, not that its later modeling steps work or that this helper is installed.

A synthetic six-step usage scenario completes its reservation/settlement sequence under the unchanged cap when confirmed cache hits are present. The no-cache scenario still stops at the cap. This is an accounting regression, NOT live AI evidence, a reconstruction of the owner's jobs or proof of character quality.

This documentation-only follow-up does not change the verified implementation. Its checks must not be conflated with an Oracle installation or a production character test.

## BLOCKED / not performed

The current Remote Desktop Commander read still returns no connected devices. No Oracle runtime installation, restart, new paid generation, historical refund or balance correction was executed. The helper must be installed and its runtime marker observed through an authorized working execution connection before calling it deployed. Then a separately approved bounded generation must deliver an actual reviewed GLB before reporting successful character restoration. No new ChatGPT subscription is required for this code change; ChatGPT and API billing are separate.

Release decision: **NO-GO for claiming restored production generation.** The scoped implementation and installer passed CI; new payment settings are preserved. PR156 remains draft because Oracle installation and an actual model result are unverified. Do not ask the owner to keep paying for blind retries.

## Preserved release evidence

The complete previous PR153/154 record remains at [the immutable pre-change status](https://github.com/teslaeco/WORLDIFACT/blob/673be0cecd83ebb5959770fe90716cd2485369e5/docs/CONTEST_STATUS.md), original Git blob `b19650def2d2f36d4e1b35acb31ec1b6e6611980`. It records 613 application tests and the successful routing/readiness publication, not a successful later character. Earlier archives linked from that record are unchanged. PR155 remains a separate diagnostic draft; its private-job counts are not exposed by this repair.
