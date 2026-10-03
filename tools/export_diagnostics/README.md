# Offline post-hoc export lifecycle diagnostic proposal

This is a local, default-inert diagnostic proposal. It is not installed, does not
add an endpoint, and has no repair, reset, cancellation, generation, budget,
payment, runtime import, Blender, SSH, restart or snapshot-acquisition path.

The preserved legacy post-hoc helper can call a finalizer that changes a
previously successful job to `building`. Its `finally` block removes only the
in-process export marker. Both successful and unsuccessful finalization can
therefore leave the row nonterminal. Existing model/export routes require
`succeeded`, and the generation admission guard treats nonterminal rows as busy.
This source-level lifecycle finding does not identify affected production rows.

## Supported input boundary

Only a **genuine, independently verified offline SQLite snapshot** is supported.
The operator must already have an authorized, consistent backup made while the
source was quiescent or by a separately reviewed SQLite backup process, together
with its independently recorded SHA-256. Acquisition is intentionally absent.
Do not copy a running database file and call it a snapshot. Do not run this
against a worker's state directory or its live database, even if sidecars are
absent. If a verified snapshot is unavailable, the diagnostic boundary is
**unsupported**; no live fallback is proposed.

The explicit `--inspect-verified-offline-snapshot` flag attests this precondition.
It cannot mechanically prove it. Stable bytes and a matching hash prove only
that the inspected image matches the nominated bytes. Finite filesystem race
checks cannot prove absence of writers. The report describes the snapshot, not
current queue activity, current availability or a safe maintenance window.

The snapshot must be the only entry in a private directory (mode 0700 or 0500),
with a private regular file (0600 or 0400), one hard link, an absolute path and no
symlink in any path component. No named pipes, devices, path traversal, other
files, hidden entries, WAL, SHM, rollback journals or super journals are accepted.
A SQLite WAL-format header is refused even without visible sidecars. Do not
delete sidecars or change the original database's journal mode to make it pass.

Linux, Python 3.11+, SQLite `deserialize` and `setlimit`, descriptor-relative
operations, `O_PATH`, `O_NOFOLLOW` and `O_NOATIME` are required. Missing support
or an `O_NOATIME` permission error fails closed; there is no weaker retry.
Ancestor paths use `O_PATH`; directory listing and file reads use `O_NOATIME`.
Read failures and detected file, directory or path replacement are refused.

The entire image is limited to 64 MiB, read twice through a no-follow descriptor,
compared with size/inode/mtime/ctime and path checks, hash verified, and parsed
only using `sqlite3.connect(':memory:')` plus `deserialize`. The tool **never**
calls SQLite on the snapshot or source file. `mode=ro` is not a strict no-write
guarantee for live SQLite because WAL/SHM sidecars may still be created or
modified. `immutable=1` against a live WAL database is not a safe substitute.

Parsing uses query-only mode, memory-only temporary storage, untrusted schema,
an SQL authorizer, zero attached databases, exact expected jobs schema, integrity
checking, 10,000-row and five-second SQLite instruction-progress budgets.
Transient memory use can be several times the image size. The progress budget
is not an OS sandbox or hard wall-clock/memory limit and cannot interrupt a
blocked filesystem read; use only a trusted local regular-file snapshot.

## Output and evidence limits

The report gives allowlisted state counts and nonterminal entries keyed by the
SHA-256 of each canonical job identifier. It emits no original job ID, prompt,
detail, image, token, raw log, source path or exception text. Snapshot bytes may
contain private information in memory; they are neither copied to disk nor
uploaded by this tool. Keep the operator's snapshot and report private.

Every nonterminal row is **unproven** as an export regression. The helper's
legacy revisions have no durable before-state receipt. GLB presence, a structurally
valid GLB, a finished-agent result, a `result.json`, file modification times or
the proposed new export manifest do not prove that the job row previously held
`succeeded`. Neither this tool nor the separate export-recovery proposal supplies
that missing historical proof.

Independent authoritative evidence would have to bind the exact job to an actual
prior terminal-success observation and its chronology, with provenance verified
outside this diagnostic. An authoritative earlier database snapshot or a trusted,
durable status-event record may support that review. A mere manually supplied
claim or artifact hash is insufficient. This version accepts no evidence file
and cannot upgrade any candidate to proven. Even proven historical success
would not by itself authorize a state reset or establish present worker idleness.

No automated recovery action is implemented. Do not infer that all nonterminal
rows are stranded or that zero nonterminal rows proves the worker is healthy.

## Local validation

Default invocation opens no input and prints an inert status:

```sh
python3 -B tools/export_diagnostics/inspect_snapshot.py
```

Future, separately authorized offline inspection uses the explicit flag,
`--snapshot` with an absolute private snapshot path, and `--expected-sha256`
with the independently recorded digest. There is deliberately no live VM
command or installer here. Exit 0 means inert or complete snapshot inspection;
exit 2 means refused, with a fixed code and no partial results.

All tests create synthetic databases only. They exercise strict file access,
WAL/journal/symlink/hardlink/FIFO rejection, concurrent changes, bounded input,
schema and integrity failures, SQL write/attach/private-column denial, output
redaction, inert behavior and unproven candidate classification:

```sh
python3 -B -m unittest discover -s tools/export_diagnostics -p 'test_*.py' -v
```

No operational identifiers, private records, runtime modules or live database
are used in these tests. Repository-wide checks remain a separate integration
requirement; focused tests do not establish a full application or deployment pass.

The suite includes no-atime preservation and simulated non-owner ancestor
`O_NOATIME` denial. The ancestor-traversal fixture verifies `O_PATH` without
requiring privilege changes; it does not identify a VM permission failure.
Application/deployment checks are outside this offline diagnostic's scope and
cannot substitute for its file-access and SQLite tests. Production snapshot
acquisition, current worker inspection and any maintenance remain separate.
