# WORLDIFACT — generation incident remains open

Updated 30 September 2026 after the owner's 16:33 device-time diagnostic screenshot. This branch changes read-only diagnostics only, not production generation, prices or budgets.

## VERIFIED — screenshot evidence, not a new successful generation

The owner ran the original collector in OCI Cloud Shell and supplied part of its output. Two visible jobs have `finished=false`, `unknownUsage=false` and the generic `WORLDIFACT_ASTRA_COST_GUARD` code. The bottom visible job has no root model.glb, model.blend, model.fbx, scene.json or model.froge-scene.json. The screenshot is partial; it does not show every artifact entry for the upper job or the full three-job report.

| Visible sample | Input tokens recorded | Output tokens recorded | Completed settlements | Held micro-USD | Remaining micro-USD |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 107682 | 2135 | 4 | 1624973 | 125027 |
| B | 97755 | 1288 | 5 | 1439410 | 310590 |

A records three references; B's null count means unavailable evidence, not zero images. The gateway request counters (five and six) include a stopped attempt and must not be described as five/six completed billable provider calls.

Using the reviewed v2 ledger's conservative rates (14 micro-USD/input token and 55/output token), the token totals exactly reproduce both held balances. Input accounts for 92.77% and 95.08% of these calculated upper allocations. These are local budget calculations, NOT verified OpenAI invoice amounts or evidence of cache misses. The remaining balance may be insufficient for a further request's input plus minimum output reservation. The generic error still does not reveal the exact rejected preflight subreason.

## VERIFIED — correct the diagnostic event-count ambiguity

Review of `oracle_connector/blender_mcp.py` at the pinned private reference revision d3f61b842dcfeda2ed794210caafc391919a75be confirms that `record` appends separate started/completed/failed rows. The original collector summed rows per tool. Consequently `get_modeling_contract: 2` can describe ONE successful invocation, not two reads. A single build_model row does not prove a successful Blender build: it could be an argument rejection or an incomplete start. Do not infer an agent loop or a built model from the original aggregate.

Implemented: retain the legacy field only with an explicit EVENT_ROWS_NOT_INVOCATIONS meaning; add separate started/completed/failed/unknown counts, bounded ordered recent events, recorded terminal-call/build-attempt/revision metadata and fixed allowlisted error-prefix categories. Recognize inspect_render. Unknown metadata stays null. No tool arguments, model code, prompts, images, exception text, paths, keys or authorization codes are emitted. This is a diagnostic correction, not a generator fix.

Ten new local synthetic tests pass, including start+completion counting, rejected build arguments, incomplete starts, anatomy failure, private canaries, malformed metadata, bounded history and no local subprocess/provider calls. The existing eleven privacy/budget tests are preserved. Dedicated CI must pass on the updated exact head; no remote execution of the updated collector or successful character is inferred from local tests.

## What remains required

Read the failed job's tool states, recorded build_attempts and fixed error category before changing modeling instructions or cost policy. Investigate context efficiency using exact request/usage evidence; repeated context is not automatically repeated billable uncached input. Preserve the full user brief, all references, geometry validation, current cost cap and one-reservation rule. Do not retry the failed job or start a new paid generation without explicit approval.

The customer credit ledger is not inspected; historical refunds and the credit-refresh timeout remain unresolved. The original generic guard maps several SpendError causes to one code and loses its subreason. No limit increase, refund, server restart or production deployment is performed in this diagnostic follow-up.

The new Commander screenshot reaches device authorization without the previous WebSocket startup error. It still displays waiting for authorization and returns to a shell prompt; successful pairing and a running connection are not established. Current plugin discovery reports Remote Desktop Commander not installed in this ChatGPT connection. Device authorization must be completed by the user; do not redeem or publish their temporary code. Cloud Shell and the compute VM remain distinct.

## Preserved release evidence

[CONTEST_STATUS_PR153_RELEASE.md](CONTEST_STATUS_PR153_RELEASE.md), original blob b19650def2d2f36d4e1b35acb31ec1b6e6611980, preserves the prior PR153/154 record byte-for-byte: real signed routing, 613 passing application tests and historical production readiness, but no proven new character generation. Its observations do not establish success of these failed jobs.

The collector continues to use the original OCI Cloud Shell key and strict known-host SSH over stdin. No VM upload, generation request, budget reset or credential-file content read is introduced. It fails closed when that SSH context is unavailable.

Release decision: NO-GO for claiming completed character generation. PR155 remains draft and diagnostic-only.
