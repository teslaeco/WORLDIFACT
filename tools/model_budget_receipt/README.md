# Immutable terminal Astra budget receipts

This optional package prepares the existing Oracle worker to report a final
upper bound for a terminated job's provider liability. It does not increase the
USD 1.75 cap, change point prices, run a model, reset a ledger, or prove an API
invoice amount. Source publication is not Oracle installation evidence.

## Protocol

The existing Oracle bearer authentication protects
`GET /v1/jobs/{canonical-lowercase-uuid}/budget`. Only a database row in
`succeeded`, `failed`, or `cancelled` state can produce a receipt. The server also
requires the source-bound runtime proof before sealing the job's existing ledger.

The successful response contains exactly these fields:

```json
{
  "revision": "worldifact-terminal-budget-v1",
  "jobId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "model": "gpt-6-astra",
  "policyRevision": "astra-low-reconciled-v2",
  "capMicroUsd": 1750000,
  "maximumLiabilityMicroUsd": 155312,
  "sealed": true,
  "sealId": "<64 lowercase hexadecimal characters>"
}
```

The example is synthetic. `maximumLiabilityMicroUsd` is a conservative upper
bound, never an invoice total. Nonterminal jobs return 409, missing jobs 404 and
missing, malformed or unverified budget evidence 503. No missing evidence is
interpreted as zero. A genuine authenticated completed response reporting zero
usage can produce a zero upper bound if its reservation record remains present.

The receipt is written atomically outside the job directory, while holding the
same file lock used by the installed reserve function. Every subsequent provider
reservation for that job is refused, including after service restart. A request
which reserved first is included at its full outstanding ceiling. Late completed
usage can reduce the ordinary ledger, but cannot lower or replace the immutable
receipt. Corrupt or linked seals keep reservation closed. Repeated reads return
the identical receipt.

Completed-call upper costs and unresolved holds are summed. Every request must
remain represented by its hold when there is no legacy balance; missing holds
refuse a receipt. Migrated legacy balances lack an immutable original request
count, so they retain the complete USD 1.75 liability and cannot release funding.
Original ledger records are never rewritten by sealing.

The receipt contains no prompt, images, credentials, reservation IDs, response
IDs or raw provider errors. Its hash is an immutable identity, not an alternative
to authenticated transport. WORLDIFACT must validate the exact receipt, same job
and account-owned fingerprint before applying at most one release of unused
ordinary funding. Customer point settlement remains separate.

## Reviewed source and activation

Only the exact reviewed installed cabinet-prebuild ancestor is accepted. Unknown
sources and already-installed STANDARD-context variants are refused; this
package does not silently install, replace or remove the separate context
optimization. The historical guard behavior remains unchanged; the installer loads its own
pinned dependency copy. `budget_patch.py` adds the seal check to the actual installed
v2 reserve path and the authenticated endpoint to the exact server source.

The pinned Cloud Shell launcher and installer are inert without explicit
maintenance approval. They use the original OCI account/key and strict verified
SSH to the existing worker. Installation requires the reviewed maintenance fence,
source preservation, fresh staged genuine Codex/MCP/Blender generic and cabinet
checks with inert responses, bound runtime receipts and authenticated health.
Before activation, failures restore the original source and receipts. After the
activation commit point, uncertain health is reported without rolling back a
worker which could have accepted new work. The tunnel, job database, model files,
credentials, point balances and historical spend ledgers are preserved.

Run only after exact-commit CI and maintenance authorization:

```sh
python3 -B oracle_budget_launch.py --source-commit REVIEWED_40_CHARACTER_COMMIT --approve-service-maintenance
```

The optional `--allow-cancelled-cleanup` retains the existing exact one-cancelled-
job consent boundary; it never permits queued, running or unknown job states.
Installation success must report `WORLDIFACT_TERMINAL_BUDGET_VERIFIED` and health
must contain `worldifactTerminalBudgetPolicy=worldifact-terminal-budget-v1` with
`worldifactTerminalBudgetMaintenance=false`. No live installation is claimed by
this package or its offline tests.

## Offline verification

```sh
MODEL_COMPLETION_SOURCE=/path/to/pinned/oracle_connector \
  python3 -B -m unittest discover -s tools/model_budget_receipt -p 'test_*.py' -v
```

The fixture is reconstructed from Froge commit
`d3f61b842dcfeda2ed794210caafc391919a75be` through the existing reviewed patch
chain. Tests exercise actual flock races, actual patched reservation/settlement,
the authenticated server handler with SQLite terminal states, immutable replay,
missing evidence, source ancestry, installer rollback and flat launcher package
integrity. They make no provider request and are not generated-model evidence.


## Historical dependency isolation (5 October 2026)

This package retains its original STANDARD-era fence and source manifest under
`reviewed_context/`. The files are exact original Git blobs, not updated copies:
`context_patch.py` is `6ed419f784f891e51bae8fc93de480a1ac31088a`, and
`maintenance_fence.py` is `d90d7b84abfb952f5056ce33e529aa0a19ea4e25`.
The evolving STANDARD context package does not supply either historical file.

The repository installer fallback and the pinned launcher now read these two
copies. Flat packages keep the original filenames and hashes; the guardian's
separate interpreter therefore resolves its adjacent original context manifest.
Only the loader's local fallback path and its own package checksum change.
Missing or mutated historical files fail closed. This does not adopt the new
pricing-aware STANDARD fence, relax historical maintenance rules, or authorize
running the old installer against a PR195 runtime.
