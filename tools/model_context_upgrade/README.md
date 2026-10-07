# Installed STANDARD context upgrade, reviewed runtime package

This is an isolated, narrowly scoped upgrade of the exact installed PR214
pricing runtime at commit `2380a7e2dad05a40b3753faf06c2635ed444be51`.
Publication, Oracle maintenance and a new paid generation remain separate
approval gates. The owner-run upgrade now has live source-bound activation
evidence; see the final verification record below.

See [presentation evidence](../../docs/STANDARD_CONTEXT_UPGRADE_20261007.md)
for the exact helper changes, measured text counts and important limits.
The additional schema-discovery turn is not a budget increase or quality proof.

## Exact target and persistent write set

The installer accepts only the nine fixed installed PR214 source hashes and
matching complete source-bound STANDARD/completion/prebuild/guard/generic/
pricing/terminal-budget receipt chain. A pre-context runtime, missing pricing
helper, mixed revision, unknown source, invalid receipt or existing maintenance
marker refuses. There is no automatic second activation or reinstall shortcut.

Only these live files may change:

- `context_policy.py`, from v1 to the frozen v2 helper
- `.worldifact-standard-context.json`, recording the new stage verification and
  the predecessor receipt hash
- `.worldifact-standard-maintenance.json`, a transient nonce-bound admission
  marker created before source writes and removed only at activation

The other eight core sources and all six inherited receipt files remain
byte-identical. A private backup contains all nine original source files and all
seven original receipts with their exact bytes, original modes and manifest.
The full backup write set is in `ORIGINAL_MANIFEST.json`. Credentials, job
folders, artifacts and financial state are never copied into the disposable
verification stage. The installer never rewrites, repairs, deletes or settles
any existing job, model, balance, budget ledger, liability, immutable tier terms
or seal. Historical USD 1.75 / 2 / 4 terms are unchanged. The current authenticated
health cap must still be USD 1.75.

## Maintenance and activation boundaries

Fresh local source/receipt and authenticated health checks run before the
maintenance fence. The current PR214 pidfd/independent-guardian machinery is
retained verbatim apart from its new finite source-manifest adapter and a
repository-only path fallback to the exact hash-checked journal helper. It
requires idle resources, exact worker/tunnel/unit/cgroup/socket identities,
read-only logout-policy proof, valid process visibility, and no nonterminal,
unknown, NULL or cancelled jobs by default. The quick tunnel is never stopped.

Nonempty container-engine/storage selectors are refused before source reads
and again before quiescence: `CONTAINER_*`, `CONTAINERS_*`, `_CONTAINERS_*`,
`PODMAN_*`, `DOCKER_*`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `STORAGE_DRIVER` and
`STORAGE_OPTS`. This prevents the inherited fence from inspecting a different
engine or storage root from the allowlisted verifier process. A refusal requires
review of the target environment, not blind clearing or changing its settings.

The October 5 cancelled-cleanup consent is historical and does not authorize
this upgrade. The new invocation defaults to refusal. A separately approved
`--allow-cancelled-cleanup --expected-cancelled-job <approved-uuid>` requires
the caller-approved canonical lowercase UUID before the first database gate.
Both arguments require `--approve-service-maintenance`; the cleanup flag alone
is refused before connection. The exact singleton must be present at each gate.
Missing, different or multiple cancellations and all other active-resource checks
still refuse. This does not modify any job rows or artifacts. Never substitute
another UUID or reuse historical cleanup consent.

After the worker is proved stopped, both a genuine generic CLI/MCP/Blender
round trip and the new selective STANDARD round trip must pass in a fresh
credential-free stage. They retain the original validator, sandbox limits,
actual image transport, separate model-turn boundaries, honest terminal finish,
count/admission/settlement accounting and USD 1.75 fixture ceiling. Model and
input-count replies are inert fixtures: this proves the pipeline, not AI visual
quality. Both child environments use an explicit allowlist; provider config,
user job databases and saved models are absent. Process-local subreaping and
container cleanup must prove drainage before any live source write or restart.

All source/receipt bytes and modes are rechecked after verification and at the
final SQLite admission lock. The newly started worker must prove exact v2 health
while the marker still blocks admission. The possible-activation latch is set
before unlinking that marker. Before possible activation, any failure restores
original bytes/modes under the same fence when safe. After a possibly effective
unlink or uncertain latch, the installer never stops, retries activation or
blindly rolls back a worker that may already have accepted a job.

Unexpected cleanup, source drift or recovery uncertainty fails closed. Backups
and fixed result codes distinguish restored, committed, activation-unknown and
recovery-required states. The existing 600-second gate limits, 25-minute work
alarm and bounded recovery/transport envelope remain; these are not guarantees
under host failure.

## Publication and package isolation

Publish only the new `tools/model_context_upgrade/` package and its new report
on the current main branch after review. Do not publish the old PR214 tree over
current application or financial changes. `oracle_upgrade_launch.py` reads:

- New upgrade files only from the exact reviewed 40-hex `--source-commit`
- Every inherited dependency only from immutable PR214 commit
  `2380a7e2dad05a40b3753faf06c2635ed444be51`

Both groups require exact Git blob hashes, the fixed repository origin,
allowlisted paths and no redirects. The remote package is flattened privately;
no historical source file needs replacement on current main. Default launcher
and installer invocations are inert PLAN ONLY. No user-facing maintenance
command should be issued before exact package review, publication and fresh
maintenance approval.

The optional `--inspect-approved-candidate` launcher mode is mutually exclusive
with `--approve-service-maintenance`, and refuses cancelled-cleanup flags. It
downloads only the separately pinned new `inspect_candidate_readonly.py` at the
reviewed source commit and executes that module in memory through the existing
strict-host SSH connection. It does not create a remote package, stop services,
read the job database, write files or invoke maintenance. Only the exact named
existing job is inspected; the public result accepts fixed numeric/hash fields
and refusal codes. Nonblocking opens reject FIFO paths without waiting for a
writer; regular-file and symlink/drift checks still apply. It never exports, repairs, changes financial state or claims
completion/visual acceptance. Default invocation remains inert.

## Local evidence and remaining gates

Run synthetic/source/protocol tests with a separate clean PR214 checkout and the
reviewed original public Froge source:

```sh
MODEL_CONTEXT_ANCESTOR_REPOSITORY=/path/to/exact-pr214-checkout \
MODEL_COMPLETION_SOURCE=/path/to/pinned/oracle_connector \
  python3 -B -m unittest discover -s tools/model_context_upgrade -p 'test_*.py' -v
```

The test-only bootstrap requires the exact PR214 commit and unchanged historical
tool paths, verifies each mixed-source package blob, and imports the same
flattened package used by the remote launcher. Production does not accept an
environment-variable dependency override. The complete 78-test suite passed
both in the development checkout and in a new-directory-only fixture with a
deliberately invalid current-main historical helper.

Transaction fixtures preserve all synthetic original jobs, artifacts, modes,
USD 1.75 / 2 / 4 terms, seals, balances and outstanding ledger entries through
successful helper-only installation and safe rollback. Refusal tests cover
unknown/mixed sources, each receipt, current cancellations, active/unknown rows,
source/receipt/mode drift, cleanup failure, both write failures, activation latch
uncertainty and marker unlink succeeding before an exception. Protocol tests
prove the new discovery/build/render/finish sequence and require its new success
marker; the old verifier marker cannot attest this upgrade. The flat pinned
package is exercised only in inert default mode.

The initial package checks above were local synthetic/source tests. On October 7,
the owner ran the checksum-pinned, exact-cancelled-job-bound maintenance command.
The authenticated, GET-only [live health proof](https://github.com/teslaeco/WORLDIFACT/actions/runs/37645146226)
at 15:35:45 UTC returned `worldifact-standard-context-v2`, `maintenance:false`,
`ready:true`, and `upgradeVerified:true`. The live helper checks source-bound
receipts, including the required offline pipeline attestations, before exposing
that revision. No new paid AI generation or account-gallery acceptance test was
performed. Both app and package CI passed on the proof head. The later tools-only
main merge must skip Cloudflare publication and preserve the already deployed UI.
