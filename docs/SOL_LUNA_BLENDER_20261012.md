# Sol/Luna detailed model integration — installation checkpoint

Status: **not installed and not LIVE verified**. The Oracle connection initially
allowed an exact source snapshot. A fresh connection later confirmed the same
14-file execution predecessor, active worker/tunnel/Ollama services and existing
user lingering. Cloud Shell then disconnected again, including with `tmux`.
No production runtime, attestation or ledger was modified. Main remains PR #267.
Do not merge this checkpoint as a completed fix.

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

Application evidence on published head `2295850ad4c664f4522ce4c2be11ade0b5addde4`:
all 2,254 tests, lint, TypeScript, HTTP smoke, production build, foundations and
Worker dry-run passed in hosted run `38207825999`. All five other branch reviews
also passed. Seven cost-ledger tests pass against both repository dependencies
and captured installed dependencies. Eleven tests execute the proposed real
Gateway handler with inert provider responses, including all six model/mode
combinations. These tests are not native Blender or paid-provider evidence.
The added admin-allocation regression passed. Hosted CI remains the authority
for the complete current tree; these previous results do not cover the new
installation additions below.

Initial hosted CI on `f6ff681` passed 2,253/2,254 tests. The remaining native
Chromium test correctly rejected its outdated explicit fixture bundle, which
omitted the new execution and model catalogue dependencies. The bundle now
includes both real modules; the corrected hosted result above passed without
skipping or weakening either browser test.

## Reviewed installation additions

`install_construction.py --update-models` accepts only the exact installed
required-tools predecessor and writes three source files plus nine receipts.
All four original gates remain mandatory. `offline_models.py` adds six distinct
actual CLI/MCP/Podman-Blender gates, one for each model/mode, with inert provider
responses, current GLB/PNG hashes, exact source hashes and terminal cost seals.
The new receipt binds those six evidence files and the construction receipt;
it explicitly records `live_provider_verified: false`. No receipt is created
from unit tests. Original pidfd guardian, idle admission, source inventory,
SQLite activation fence, backup and rollback behavior remain in force.

Seven transaction tests cover every write/lost acknowledgement, rollback,
existing history/receipt drift, missing old/new gates and cross-model evidence.
Five detached-run tests cover loss of acknowledgement, incomplete dispatch,
strict result parsing, repeated requests and unsafe paths. The complete local
construction suite ran 299 tests: 295 passed, three kernel tests are blocked by
this environment's process namespace and the opt-in native Blender test skipped.
Hosted Python 3.9/3.12 and the existing native Blender workflow must pass.
The new actual CLI/Podman gates still require Oracle; no native success is
inferred from these tests or the separate native-Blender regression workflow.

`detached_construction.py` submits the pinned installation to the VM's existing
lingering systemd user manager. It requires the original SSH key and strict host
checking, can use the already-known public VM address without OCI discovery,
and changes no SSH credentials, login policy or service permissions. The
bounded unit has `Restart=no`; its private durable folder is a once-only latch.
SSH disconnect does not own that service. This behavior is tested with inert
process boundaries; actual logout survival on Oracle remains unverified.

From the original Cloud Shell, with both launcher modules from the same reviewed
commit available, the operator command is:

```sh
python3 -B tools/model_construction/detached_construction.py \
  --source-commit EXACT_REVIEWED_40_HEX_COMMIT \
  --ssh-address 141.148.242.30 --approve-service-maintenance \
  --allow-cancelled-cleanup \
  --expected-cancelled-job f91612e5-eb5a-4fec-9585-1ce08c9f38ad
```

That cleanup consent applies only to the already-authorized cancellation, never
to a new active job; its history/files remain unchanged. A `started` response is
only a service dispatch acknowledgement, not installation proof. Inspect the
same attempt with `--status --source-commit EXACT_REVIEWED_40_HEX_COMMIT
--ssh-address 141.148.242.30`, without maintenance or cleanup flags. Missing or
uncertain results require inspection, never an automatic repeat with a new ID.

## Remaining activation work

1. Restore a responsive Oracle connection and re-read source, service, job and
   receipt identities. A stale Desktop Commander Online label is insufficient.
2. Verify the new exact-head hosted checks and start the prepared `--update-models`
   transaction through the detached VM service. The old `--update-execution`
   mode is only the previous required-tools repair; it does not install these
   model routes. Recheck the same durable attempt after any connection loss.
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
