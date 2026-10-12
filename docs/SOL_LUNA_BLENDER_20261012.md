# Sol/Luna detailed model integration — source checkpoint

Status: **not installed and not LIVE verified**. The Oracle connection initially
allowed an exact source snapshot, then Desktop Commander stopped answering even
an inert connection check. No production runtime, attestation or ledger was
modified. Main remains PR #267. Do not merge this checkpoint as a completed fix.

The Shop previously sent Sol and Luna to the procedural blueprint endpoint.
Their OpenAI calls did not make them detailed Blender models. This change adds
an immutable `studio-execution-v1` selection to preparation, signed input,
account reservation, Oracle admission, CLI model selection and terminal cost
evidence. Missing selection retains the existing Astra route and receipt bytes.

| Selection | Responses model | Customer points | Per-job provider ceiling |
|---|---|---:|---:|
| Sol, Standard or Fast | `gpt-6.1-sol` | 50 | USD 0.35 |
| Luna, Standard or Fast | `gpt-6-luna` | 15 | USD 0.10 |
| Astra with explicit execution selection | `gpt-6-astra` | 250 | USD 1.75 |

Existing Astra tier selections retain their original terms. Fast explicitly
uses `service_tier: fast`, with twice the conservative Standard token rates
inside the same selected-model ceiling. Cache writes and regional uplift are
included; no cache discount is assumed. This is conservative liability
accounting, not an invoice. No one-minute or visual-quality guarantee is made.

References use the existing bounded photo contract. New detailed jobs cannot
reuse an old reviewed scene without calling the selected model. Mode/model
changes alter the signed input commitment and cannot modify an admitted job.
Completed results retain their selection and correct point terms through local
and account recovery. The separate procedural concept option and historical
results remain recoverable.

`tools/model_execution/model_routes.py` is a pure transform for the exact
observed server/runner hashes. It does not install files, renew receipts or
change a service. `studio_execution.py` uses a separate immutable ledger for
new selections; it leaves historical Astra ledgers untouched. Unknown usage
retains its reservation, terminal seals stop further dispatch, and missing
binding evidence cannot fall back to Astra.

Local evidence: lint and TypeScript passed; the complete application run passed
2251/2253 tests, with only the two existing native Chromium tests unavailable
because Chromium is absent. Separate HTTP smoke, production build and Worker
dry-run passed. Seven cost-ledger tests pass against both repository dependencies
and captured installed dependencies. Eleven tests execute the proposed real
Gateway handler with inert provider responses, including all six model/mode
combinations. These tests are not native Blender or paid-provider evidence.
The added admin-allocation regression is checked separately; hosted CI remains
the authority for the complete current tree.

## Remaining activation work

1. Restore a responsive Oracle connection and re-read source, service, job and
   receipt identities. A stale Desktop Commander Online label is insufficient.
2. Extend the existing reviewed idle-only maintenance transaction for this exact
   predecessor, three changed/new source files, eight existing receipts and the
   new execution receipt. Preserve its process guardian, backup, rollback and
   ambiguous-activation stop. The old `--update-execution` mode is only the
   previous required-tools repair; it does not install these model routes.
3. Run genuine isolated CLI/MCP/Blender gates for the legacy routes and every
   new selection. Create source-bound receipts only from those new successful
   gates. New execution health additionally binds the construction receipt.
4. Install and verify runtime health, freeze the exact preserving Worker release
   scope, pass hosted CI and deploy. Existing secrets, runtime variables,
   billing configuration, balances and original assets must remain intact.
5. Run explicit bounded real Sol/Luna acceptance requests using the remaining
   previously approved test allowance. Verify actual provider model, resulting
   GLB/Blender files, original-job recovery and account settlement. An uncertain
   attempt continues to consume its maximum reserved test liability.

Official contracts checked on 12 October:
https://developers.openai.com/api/docs/models/gpt-6.1-sol
https://developers.openai.com/api/docs/models/gpt-6-luna
https://developers.openai.com/api/docs/models/gpt-6-astra
https://developers.openai.com/api/docs/guides/fast-mode
