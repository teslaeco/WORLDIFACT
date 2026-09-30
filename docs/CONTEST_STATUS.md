# WORLDIFACT — generation incident reopened

Updated 30 September 2026. This diagnostic branch does not change production source, worker configuration, prices or budgets.

## VERIFIED — user-visible failure after PR153

The owner supplied a new screenshot at device time 15:52 showing no new character, the example preview, an Astra cost-limit message and a credit-refresh timeout. PR153 restored routing and readiness, not a proven completed generation. Do not describe the incident as resolved or ask the owner to keep buying retries.

The complete previous release record is preserved without edits in [CONTEST_STATUS_PR153_RELEASE.md](CONTEST_STATUS_PR153_RELEASE.md), Git blob `b19650def2d2f36d4e1b35acb31ec1b6e6611980`. It records PR153/154, 613 passing tests and the earlier successful production readiness checks. Those observations remain valid but do not prove the later failed job worked.

## VERIFIED — misleading error classification

The reviewed Oracle installer catches every `astra_spend.SpendError` and emits the same `WORLDIFACT_ASTRA_COST_GUARD` code. The v2 installer preserves this generic handler. SpendError can mean monetary exhaustion, token-count preflight failure, invalid state, policy rejection or expired review. Therefore the displayed cost-limit sentence cannot prove that USD1.75 was spent. The exact failure subreason was not retained by this handler.

## IMPLEMENTED — read-only evidence collector, not a generation fix

`tools/diagnostics/generation_report.py` reads the three most recently modified UUID job folders. It reports allowlisted gateway error codes and token counts, conservative budget holds and completed settlements, reference counts, tool-call counts, and existence/sizes of known artifacts. A present file is explicitly unvalidated; a hold is not an OpenAI invoice. Missing evidence stays unknown, never zero cost or success. It does not read the customer credit ledger.

On the original OCI Cloud Shell it locates the existing RUNNING `froge-blender` instance in eu-amsterdam-1 and uses the existing `ssh-key-2026-09-06.key` and strict known-host verification to execute the read-only collector through SSH stdin. It reads no credential-file contents and prints no keys, prompts, images or raw provider errors. No VM upload, service restart, model request, refund, quota reset or provider-cap increase is performed. It fails closed when the original SSH context is unavailable.

Local verification: 11 Python tests passed, including privacy canaries, corrupt/missing ledgers, symlinks, bounded files and no process/provider invocation during local inspection. Dedicated PR CI is included. Remote execution on the owner's VM and full application CI must not be inferred from local tests.

## BLOCKED / UNKNOWN

The new job's actual provider usage, original preflight cause, saved partial model and customer refund are not yet verified. The owner has not approved the separately proposed USD1.75 paid quality trial. No new paid test was performed.

The Commander screenshot shows Node.js20 without the native WebSocket needed by its current remote dependency; device startup failed. The Remote Desktop Commander ChatGPT connection is not installed according to plugin discovery in this turn. Oracle Cloud Shell is distinct from the compute VM running the generator. Starting a process in Cloud Shell alone neither connects ChatGPT nor restarts the generator.

Next required evidence: run the read-only collector in the original OCI shell, then repair the evidenced failure without silently raising costs or replacing the requested character with a blueprint. Independently complete Commander authorization using a compatible Node runtime. The credit-refresh timeout still needs authenticated account-path diagnosis; do not claim an observed refund from a generic UI sentence.

Release decision: NO-GO for claiming completed character generation. This branch is diagnostic only and is not a production hotfix.
