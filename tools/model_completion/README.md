# WORLDIFACT model completion repair

This is an opt-in maintenance package for the exact installed Oracle v33 worker
with the reviewed FAST-spend, Astra profit guard, low-output policy, completed
cache accounting and 900-second request-timeout updates. Unknown source bytes
are rejected before stopping the service. No paid model generation is invoked.

## Repair scope

Only explicit WORLDIFACT standard/reference completion instructions activate the
new behavior. Ordinary Froge and FAST draft behavior remain compatible.

- The complete first build takes priority over generic small-part-count advice.
- Each current GLB snapshot supplies actual structural measurements and actionable
  deficits. The cabinet floor remains 20,000 rendered triangles, eight distinct
  meshes, six meshes with at least 24 triangles, eight primitives, three materials
  and eight nodes. Counts are not visual fidelity or manufacturing approval.
- Finishing requires the verified current GLB and actual current required render
  requests. Cabinet review includes three-quarter. Failed structural checks cannot
  be accepted; an explicitly rejected draft must name unresolved issues.
- A premature **clean CLI exit** permits at most one same-job continuation. It
  shares one gateway, execution identity, spend ledger, cumulative request/output
  counts and original monotonic deadline. All prior build attempts and edit history
  survive. New CLI contexts must inspect images again. The old process group must
  be gone first.
- Nonzero exits, cancellation, provider errors, response.incomplete, unknown usage,
  exhausted limits and unfinished MCP calls never trigger that continuation.
- A max_output_tokens truncation is terminal; clean-exit continuation does not
  retry it. While the current GLB is
  missing or structurally insufficient, the existing guard must be able to reserve
  at least 2,048 output tokens; it refuses smaller allocations before creating a
  hold or sending a model request. Structurally passing GLBs retain the existing
  256-token minimum for compact review/finish calls. Default legacy behavior, the
  USD 1.75 cap, prices and conservative incomplete-response holds are unchanged.
- A WORLDIFACT job without finish_model ends failed, with an allowlisted public
  failure code. It cannot silently become a succeeded sparse candidate.

This improves first-build execution and avoids predictably tiny fragment calls.
It does not guarantee that every requested reconstruction fits USD 1.75.

## Original OCI Cloud Shell

Use the original account, existing SSH key and verified host-key entry. The
launcher resolves only the existing running `froge-blender` instance in
`eu-amsterdam-1`. It never reads/uploads the key or creates cloud resources.

After publication and exact-commit CI review, download `oracle_launch.py` from
that exact 40-character public commit. Run it with the **same** commit:

```sh
python3 oracle_launch.py --source-commit REVIEWED_40_CHARACTER_COMMIT --diagnose-job EXISTING_JOB_UUID
python3 oracle_launch.py --source-commit REVIEWED_40_CHARACTER_COMMIT --approve-service-restart
```

The first command is read-only and emits only bounded existing ledger counts,
held totals and unsettled input/output ceilings. Missing evidence is nonblocking.
It never prints prompts, credentials, reservation keys or response IDs. It does
not invoke any ledger-directory creation helper. Both flags may be combined to
print the diagnostic before authorized maintenance. Without an explicit operation
flag the launcher is plan-only and performs no network or SSH operation.

The installation requires an idle queue, healthy worker/tunnel and valid existing
runtime/guard receipts. It takes private backups, stops only the existing worker,
patches exact files, executes the unchanged genuine Codex/MCP/Blender offline
fixture under network denial, refreshes its genuine runtime receipt, restarts and
checks authenticated local health. Failure restores previous files/receipts and
service. Original model files, database, secrets, spending ledgers, payment
settings and service/security permissions are not modified by the patch.

Verified health fields:

```json
{"worldifactCompletionPolicy":"worldifact-reference-completion-v1","worldifactCompletionMaxContinuations":1}
```

These fields require matching source, completion, spend-policy and genuine
Codex/MCP/Blender receipts. They are readiness evidence, not paid visual-quality
evidence. A new paid test requires separate explicit authorization.

## Reproducible offline checks

CI checks out `teslaeco/Froge-MPC-2-test` at
`d3f61b842dcfeda2ed794210caafc391919a75be` and reconstructs the exact installed
ancestor through the reviewed patch chain. It uses no Oracle connection or paid
provider request.

```sh
MODEL_COMPLETION_SOURCE=/path/to/pinned/oracle_connector \
  python3 -B -m unittest discover -s tools/model_completion -p 'test_*.py' -v
```

Coverage includes underbuilt retained candidates, distinct versus linked meshes,
unchanged floors, persisted failed build attempts, shared gateway and
execution identity, nonzero/incomplete no-retry behavior, unchanged insufficient
allocation ledgers, source/receipt binding, current-render finish requirements,
active-job/unknown-source refusal, verification and partial-write rollback,
no-side-effect diagnosis, strict original-key SSH and flattened-package imports.
Local tests use inert geometry/CLI fixtures; genuine Codex/Blender round-trip and
worker restart remain installation-time checks on the original Oracle VM.

## Reviewed direct-export source compatibility

The maintenance package supports the original FAST v33 server and its exact
public direct-export v2 transform from PR125 commit
`c7ed3c364127cef7074d01e58921a7e2557fd51c`. The unchanged transform from
`tools/export_prepare/direct_v33_patch.py` (Git blob
`385811ea2aeb8a817328ffed584ab79e48c10026`) is vendored as
`reviewed_direct_export.py`. No historical installer or paid-test script runs.

Preflight reverses the extension to the reviewed base, verifies that base, then
reapplies the extension byte-for-byte. It preserves export helpers, routes and
recovery markers. All other source pins, guard receipts, idle-queue checks and
rollback requirements remain unchanged. Unknown variants are rejected.

The launcher includes the pinned transform dependency and refreshed installer
and source-patch hashes. Default execution is plan-only. Explicit restart mode
performs the installation and offline verification without a paid generation.
The source regression tests cover public-source reconstruction, real preflight,
active-job refusal, export preservation and byte-exact rollback using synthetic
state fixtures. Test success does not prove a real generated preview.

## Separate original-input test preparation

The preparation package includes `test_original_job_once.py`. The maintenance
launcher never executes it and rejects `--approve-paid-test`. Its separate
staging mode downloads and verifies the package without installing, restarting,
diagnosing a job or contacting a provider:

```sh
python3 oracle_launch.py --source-commit REVIEWED_40_CHARACTER_COMMIT --stage-test-helper
```

Run staging only from the original OCI Cloud Shell. It prints
`WORLDIFACT_MODEL_TEST_HELPER_STAGED` and the private `helper_path` on the generator
VM. Staging cannot be combined with installation or diagnosis. The maintenance
launcher remains incapable of invoking a paid test.

`oracle_original_test_once.py` is a separate wrapper for a later explicitly
approved test. It reuses the verified package; it is not part of the staged
16-file payload. Preparation, staging and repair installation do not authorize
paid execution. Before any paid invocation, the owner must explicitly approve
one test and its provider-cost limit; the operator must use the exact reviewed
public source commit and supply these private parameters:

- `--source-job PRIVATE_SOURCE_JOB_UUID`: the existing original job.
- `--test-job PRIVATE_NEW_TEST_JOB_UUID`: one distinct new test job.
- `--expected-original-artifact-sha256 PRIVATE_ORIGINAL_GLB_SHA256`: the expected
  original GLB hash, required by the wrapper and for a succeeded-but-unfinished
  source.
- `--approve-paid-test ORIGINAL_INPUT_ASTRA175_ONCE`: the generic execution marker,
  used only after the separate owner approval.

No actual job UUID, original artifact hash, prompt or reference image belongs in
public source, command examples, reports or CI fixtures. The original prompt,
instructions and ordered references are read on the generator VM and remain
private. The helper defaults to zero-read/zero-network `PLAN_ONLY`; its status
mode only observes the selected test and never submits a missing job.

One constant private durable claim path binds the source and test UUIDs, expected
artifact hash and exact original inputs before the sole submission POST. Changing
parameters cannot create another test, including during a concurrent claim race.
Once submission is claimed, rejection, interruption or an uncertain response
leaves the claim consumed; later invocations can only observe that same test job.
There is no automatic retry or replacement test ID.

A succeeded-but-unfinished source requires matching current-candidate execution
identity and checkpoint, agreement between root, local and served artifacts, no
final attestation, and saved and authenticated review evidence of unfinished
execution. Its artifact must match the privately supplied expected hash and fall
short of the public structural completion floors; missing, unknown, changed or
normally finished evidence blocks before the claim or POST. No private historical
geometry measurements are embedded as eligibility rules.

The provider-token reservation remains capped at USD 1.75. Provider usage may
still be billed when generation fails; tax and actual invoice totals are not
established by this guard. The helper performs no customer checkout or point
debit and does not alter provider limits, payment settings or service state.

Only a reviewed host model with an actual downloaded GLB hash bound to its passed
host acceptance gate is labelled `VERIFIED_MODEL_READY_FOR_VISUAL_REVIEW`.
Other Oracle `succeeded` drafts are explicitly `REJECTED_OR_UNREVIEWED_DRAFT`.
Neither result substitutes for human inspection of the actual generated preview.
The test helper, by itself, uploads no prompts, photos, model files or screenshots
to GitHub or another storage service.
