# Sol/Luna detailed model integration — installation checkpoint

Status: **Oracle installation and Worker publication verified; LIVE acceptance pending**.
PR #268 merged as `878dcff08ffa9b303faccae5912d6dfda651591d`. Production run
38227050993 passed at 09:03 UTC with version
`860436e0-ee67-4fcd-907c-e8040c4825cc`, matching 12 HTML routes and 436 built files.
The later status correction #269 is also deployed; see CONTEST_STATUS.md.
The original SSH connection was restored on 12 October. It confirmed the exact
expected predecessor, active worker/tunnel services and no nonterminal jobs.
The prior `unconfirmed` launcher result was traced to the existing owned parent
directory's 0755 mode, before any attempt folder or unit existed. Restricting that
parent to 0700 allowed source `27c45c81eec9cc2275006e5acfa867075f5583bb` to start
in the VM's existing lingering user manager. A later, separate SSH status read
confirmed `running` after the launch session exited. That same durable attempt
then finished successfully: `activation_committed=true`,
`job_rows_changed=false`, `paid_generation_requested=false` and
`provider_limits_changed=false`. Do not resubmit it with a different commit.
At 08:46 UTC a separate SSH inspection verified all six source-bound evidence
hashes, `studio-execution-v1` for all three models and both modes, and running
worker/tunnel services. The original job history and latest chessboard are
unchanged. This uses real CLI/MCP/Podman-Blender with inert provider responses;
the installed receipt correctly retains `live_provider_verified: false`.

The source continuation handles this legacy parent safely on approved start and
adds a failing-before/passing-after regression. It never repairs a shared-writable
root or mutates paths on read-only status. The Worker publication envelope is
prepared at exact main `6f9bcbc333746c42090a8768efd3ebd851ba6222`; it preserves
billing/configuration and grants no financial waiver. Final head
`f5ebb0a0cade09976edc9612fc90c6f5f702d636` passed all seven hosted workflows,
including Verify 38225827019 (2,257 tests) and construction review 38225826955.

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
The new actual CLI/Podman gates subsequently passed on Oracle as recorded above;
that result is distinct from these unit tests and the hosted native-Blender job.

`detached_construction.py` submits the pinned installation to the VM's existing
lingering systemd user manager. It requires the original SSH key and strict host
checking, can use the already-known public VM address without OCI discovery,
and changes no SSH credentials, login policy or service permissions. The
bounded unit has `Restart=no`; its private durable folder is a once-only latch.
SSH disconnect does not own that service. Separate SSH sessions confirmed the
same running attempt after its launching session exited, then its successful
completion. A physical phone/browser logout was not separately tested.

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

1. DONE: restore and verify the original Oracle SSH connection. Inspect the
   existing detached attempt using its original immutable commit.
2. DONE: the approved `--update-models` transaction finished as the detached VM
   service. Read its same durable result after any connection loss. The old
   `--update-execution` mode does not install model routes. The original installer
   head and permission/release continuation both passed hosted CI.
3. DONE: genuine isolated CLI/MCP/Blender gates passed for the legacy routes and
   every new selection. Installed source-bound receipts match all six successful
   evidence files. New execution health additionally binds the construction receipt.
4. DONE: runtime activation/health, hosted CI and preserving Worker publication
   are verified. Existing secrets, runtime variables, billing configuration,
   balances and original assets were retained.
5. Paid live acceptance remains pending. The recovered test ledger's fixed
   approval expired at 04:00 UTC, so it cannot admit another attempt. Its uncertain
   reserved attempt was not released or retried. A fresh explicit bounded test
   authorization is required before new paid acceptance work. Verify actual
   provider model, resulting GLB/Blender files, original-job recovery and account
   settlement; installation and mocked-provider checks do not establish these.

Official contracts checked on 12 October:
https://developers.openai.com/api/docs/models/gpt-6.1-sol
https://developers.openai.com/api/docs/models/gpt-6-luna
https://developers.openai.com/api/docs/models/gpt-6-astra
https://developers.openai.com/api/docs/guides/fast-mode
