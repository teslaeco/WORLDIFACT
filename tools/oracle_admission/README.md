# Durable Oracle admission candidate

**NO-GO for production installation.** This is an implemented, offline-tested
protocol candidate and a read-only operator probe. It is not an installer. Do not
copy its server output into the live connector or replace any integrity receipt.
The existing maintenance grant does not authorize or attest these new bytes.

The owner's 12 October Cloud Shell screenshot matches the reconstructed current
`server.py` SHA-256 `3ca9da9a246c406ced7f1183b2e6e85f95d1ce733f0ef12af652c5aaf5812227`
and six other sampled files. `assemble_observed_runtime.py` reconstructs the full
15-file public manifest from the existing context-v2 assembler and the immutable
transport transform at `496b8c9f2120346993720357c3f920a4e3e9f2ae`. Every final hash
must equal the existing `construction_manifest.model_manifest()`. No old pins
are changed. The remaining installed files and receipt chain still need a VM check.

## Protocol and financial boundary

For authenticated fresh Astra/Sol/Luna selections, a separately attested runtime
can advertise `oracle-durable-admission-v1`. Worker then sends the exact original
body to `/v1/jobs/stage`, with the account-bound input fingerprint and a hashed
owner identity. Oracle commits immutable body bytes and their SHA-256 to private
SQLite with `synchronous=FULL` before ACK. This cannot queue or call a provider.
Worker verifies the complete ACK before the existing account/global reservations.

The existing one-use account dispatch claim authorizes `/v1/jobs/start` over the
same ID/body hash. Worker makes this call once, then uses same-ID GET recovery on
ambiguous responses. No fallback to a paid legacy POST follows a staging error.
Servers without the new capability keep their existing protocol; therefore a
Worker-only deployment cannot be described as durable-ingress recovery.

Oracle START atomically records authority. A serialized consumer commits each
attempt count before local preparation, fsyncs input files and their directory,
and inserts the original jobs row. Up to three local preparation attempts are
allowed. They cannot invoke a provider. Replays compare the immutable input marker
and preserve an existing row's state; they never enqueue completed or uncertain
work again. Corrupt/exhausted input enters `blocked` for review. Only unfunded
staging expires (35 minutes); input evidence is retained. The inbox has a 16-waiting
request cap, alongside the original 300-job/free-disk checks.

The exact original worker is changed to claim queued work in `BEGIN IMMEDIATE`
with FULL synchronization and to retain never-started queued work after restart.
A process lock precedes startup recovery. Interrupted processing remains failed
and reviewable, without new provider authority or a guessed zero-cost receipt.
Missing original rows after successful local preparation are uncertain: GET
remains recoverable and START cannot recreate them. No point, subscription,
provider-price, customer-artifact or original cost-guard implementation changes.

## Repeatable offline checks

Use the existing context assembler against its pinned ancestor and public source,
then run:

```sh
python3 -B tools/oracle_admission/assemble_observed_runtime.py \
  --context .upstream/p0-context-runtime \
  --transport .upstream/transport-reference/tools/mcp_transport_repair/repair.py \
  --destination .upstream/new-admission-observed
ORACLE_ADMISSION_SOURCE=.upstream/new-admission-observed \
ORACLE_ADMISSION_PHOTO_SOURCE=.upstream/model-completion/oracle_connector \
python3 -B -m unittest discover -s tools/oracle_admission -v
node --test tests/oracle-durable*.test.* tests/studio-recovery-native.test.mjs
```

The separate `Oracle durable admission (no paid calls)` workflow reconstructs
those inputs and runs Python 3.9/3.12. SQLite/HTTP/process tests use real local
storage with inert readiness and ledger binding. Native workerd tests use actual
SQLite Durable Objects through restarts, with mocked Oracle/provider responses.
None writes a valid production attestation or demonstrates live provider quality.

`cloud_shell_probe.py --commit <exact-reviewed-commit>` downloads only three
independently SHA-256-pinned public files, discovers the existing `froge-blender`
instance in `eu-amsterdam-1`, and requires the owner's existing SSH key and host
trust. It runs 12 disposable SQLite tests on the VM and reads source/receipt/SQLite
metadata. It never restarts a service, installs code, submits a job, reads a
credential, edits a production row, or prints customer identifiers/prompts.
Successful GLB header counts are not full artifact or download verification.

## Outstanding activation work

The current installer supports older fixed releases only. A new reviewed
transaction must preserve its idle fence, pidfd/guardian, exact source inventory,
backups, four genuine offline CLI/MCP/Blender gates, six model/mode gates,
receipt-chain rebinding and activation/rollback rules. This PR does not weaken
those checks or claim that unit tests can replace them. A working installer and
actual VM staged acceptance/restart proof remain release blockers.

Also required: correlate an original missing signed request across Worker,
account ledger, Oracle ingress and provider evidence; verify a real authenticated
account library/download read; capture the production version and approve exact
preserving release scope. No new paid acceptance test is authorized. Keep any
ambiguous provider spend/point holds unchanged and incident #272 open.

Before activation, rolling back this candidate means removing only its proposed
code. After any future activation, retain the admissions journal and original
jobs/artifacts/ledgers; never downgrade to legacy POST for unresolved staged IDs
or restore an old database snapshot to compensate for a code rollback.

## Staged installer preparation — 13 October 2026

The new `install_admission.py` accepts `--source <exact-pinned-runtime>` and defaults to read-only validation. `--prepare --destination <fresh-isolated-directory>` writes an fsynced private 0700 candidate stage after verifying all 15 current server SHA-256 pins and independently pinned durable helpers. It refuses changed or symlinked source, unknown files, preexisting helpers and existing stage paths. Eight dedicated unit tests pass locally. The stage is **not** a complete production installation and never touches the running VM or creates a paid job. `--activate` deliberately refuses until the separately reviewed production transaction binds real CLI/MCP/Blender and six model/mode gates, full receipt rebinding, process idle fence, rollback and authenticated health. Do not bypass this refusal, repurpose historical grants, or merge PR #274 as a reliability release on these tests alone.

