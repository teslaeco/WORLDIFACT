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
- The observed incident included max_output_tokens truncation, so clean-exit
  continuation alone is not its explanation or cure. While the current GLB is
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
print the diagnostic before authorized maintenance. Without either flag the
launcher is plan-only and performs no network or SSH operation.

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

Coverage includes the 156-triangle/13-box incident shape, distinct versus linked
meshes, unchanged floors, persisted failed build attempts, shared gateway and
execution identity, nonzero/incomplete no-retry behavior, unchanged insufficient
allocation ledgers, source/receipt binding, current-render finish requirements,
active-job/unknown-source refusal, verification and partial-write rollback,
no-side-effect diagnosis, strict original-key SSH and flattened-package imports.
Local tests use inert geometry/CLI fixtures; genuine Codex/Blender round-trip and
worker restart remain installation-time checks on the original Oracle VM.
