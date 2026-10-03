# Offline optional-export recovery proposal

Status: **DRAFT; NOT INSTALLED OR ENABLED**. This directory contains one runtime
component, one exact-source offline transform, and inert regression tests. It
has no SSH, Oracle, provider, restart, service-installation or web-bridge path.
Running `patch_recovery.py` without arguments prints a plan and performs no
source reads or writes. Explicit offline staging writes a new separate output
folder; it never changes its source snapshot or creates a runtime receipt.

## Confirmed problem and source identity

The preserved direct-export v2 helper called `run_blender_finalize` inside the
completed job directory. The existing `run_blender` writes `building` progress
for finalization as well as generation, and the helper never restores the
completed row. Optional finalization could therefore block model downloads and
subsequent job admission, on success or failure.

The pinned finalizer also replaces `result.json` and `model-ready.json`.
`scene_exports.py` deletes/replaces prior FBX/OBJ/MTL outputs and removes failed
outputs. Restoring the database state alone cannot preserve these artifacts.

Reviewed public source is
[Froge-MPC-2-test at d3f61b842dcfeda2ed794210caafc391919a75be](https://github.com/teslaeco/Froge-MPC-2-test/tree/d3f61b842dcfeda2ed794210caafc391919a75be/oracle_connector).
The inspected Git blobs are:

- `runtime/finalize.py`: `18a298c53de6c367797b9dad09ae5f078cf202d8`
- `runtime/scene_exports.py`: `14cce46bf6031532ea9627d519290609df134ca9`
- `runtime/model_checkpoint.py`: `bceb765aca8227a326cddd393879812d99c1fb46`
- `runtime_check.py`: `d55115d74925b10661c8407f4db87ec52a9f0d79`

`patch_recovery.py` accepts only the exact completion/direct-export server
SHA-256 `c6f9432b8dd1e756c65fad18e5bd8346e51590b8feade09c7b1324b616a74cb2`,
or that server with the exact reviewed prebuild-health addition. It removes the
completion additions in memory and calls the existing reviewed reverse-ancestry
proof before transforming any source. The old direct-export helper, completion
source transform, installer, launcher and package hashes stay unchanged.

## Preservation and admission contract

- Re-read the row while holding the existing admission lock. Require its current
  state to be `succeeded`, the standard generation profile, and the explicit
  WORLDIFACT detailed completion contract. Never write a job row, progress,
  detail, timestamp, cancellation flag or completion report.
- Import a private copy of the saved, self-contained GLB. Reject symlinks,
  hardlinks, unsafe paths, external resource URIs and unreviewed glTF extensions.
  Do not open the existing BLEND or copy user scripts/photos into the exporter.
- Use the existing Podman image and sandbox options with the conservative 4 GiB
  memory profile, two CPUs, network disabled, read-only root, dropped
  capabilities and existing PID/tmpfs limits. Explicitly disable Blender
  auto-execution. Mount only reviewed runtime source read-only and the private
  staging work directory read-write. No finalizer or provider is invoked.
- Verify the private GLB still has its original identity. Validate exporter
  records, hashes, size limits and FBX reimport evidence. Missing textures remain
  missing; `prepared: true` does not imply every format is ready.
- Atomically publish only missing, verified optional formats in a separate
  immutable job sidecar. Original paths remain preferred for downloads. Original
  GLB, BLEND, all reports/checkpoints and already-ready formats are never opened
  for writing. ZIPs expose normal `textures/...` names. The sidecar records the
  source GLB hash and `reimported-preserved-glb` provenance; a recovered BLEND is
  a GLB conversion and does not recover native authoring history or prove visual
  fidelity. Repeated responses retain this provenance.
- Reserve one durable global admission marker under the same lock as new job
  admission. Same-job exports, different-job exports, queued worker execution,
  new job admission and residual `RUNNING` work cannot overlap. The marker is
  independent of the completed job's state and survives process/server restart.
- Before release, prove the Podman client is reaped and the container is absent,
  then remove private staging. Ambiguous startup, failed cleanup or an uncertain
  container check retains the reservation. Startup does not clear it. An
  operator must establish cleanup before any later maintenance can remove it.

A partial successful bundle is immutable. A repeated request can read its ready
formats but cannot automatically rerun or replace missing formats. This narrow
proposal favors preserving downloads over repeated resource-heavy retries.

## Future installation and web compatibility gates

No installation is performed or provided by this proposal. Reuse the existing
idle-only backup, quiescence, exact-source verification and rollback framework
when a separately reviewed installation is authorized. Required future work:

1. Verify the actual installed server, exporter, sandbox and existing completion
   and prebuild receipts; an offline public source snapshot is not evidence of
   the current Oracle filesystem. Refuse unknown source variants before stopping
   any service. Refuse any existing recovery marker or heavy process.
2. Stage only `server.py` and `export_recovery.py`; preserve all other runtime,
   job, configuration, credential, payment and entitlement files. Retain originals
   and mode bits for rollback. Update the server hash in existing completion and
   prebuild receipts through the same verified transaction, preserving every
   other field. Do not teach old launchers to accept new source merely by adding
   a digest; pin/review the complete future package and its ancestry.
3. Run an actual offline Podman/Blender export on a synthetic GLB on the target
   VM. Prove source/report preservation, success, partial export, failure,
   timeout/cleanup, same/different-job exclusion and generation admission. Reuse
   the existing genuine runtime verification where applicable. Tests with inert
   processes are not this installation verification.
4. Only after verification, create the new local receipt
   `.worldifact-export-recovery.json` with the exact revision, current SHA-256
   hashes of `server.py`, `export_recovery.py`, `runtime/scene_exports.py` and
   `runtime_check.py`, and all of `offline_export_roundtrip`, `cleanup_verified`
   and `admission_verified` true. A staging manifest is not a receipt. The server
   withholds the new capability and refuses prepare until this proof matches.
5. Verify exact post-install health and unchanged existing guards before any
   later web integration. On any failed/uncertain verification, use the existing
   rollback transaction and preserve private evidence; do not retry generation.

The proposed health contract is
`posthocExportSafetyRevision: "worldifact-staged-export-v1"` plus the boolean
`posthocExportBusy`. The old `posthocExportRevision: 2` and
`legacyGlbExportRecoveryRevision: 1` are presence-only observations and do not
satisfy this contract. The proposal stops advertising those old labels.

Any future export-preparation request must first verify authenticated ownership,
an existing completed detailed job, and the exact new runtime revision. Export
preparation must never reserve customer points, provider funding or generation
allowance. A separate **new generation** request can check `posthocExportBusy`
before its unchanged reservation flow, avoiding a known busy export. The race
between that check and generation admission still needs a defined adapter
policy before release. This proposal does not change accounting, finance,
entitlements or website behavior.

## Verification and limits

Run the offline suite with the same `MODEL_COMPLETION_SOURCE` pinned checkout
used by the existing model-completion CI. The suite compiles the entire patched
server and executes extracted exact source readers, admission handler, worker
and download handler against synthetic files and an inert SQLite fixture.
It covers unchanged job rows and original bytes, unknown source rejection,
failed/private-rewriting exporters, absent textures, partial immutable output,
provenance, real ZIP structure, path/link refusal, global concurrency,
persistent cleanup holds, and health proof/tampering. All process calls in this
suite are stubs; it cannot claim a deployed or visually correct model.

This proposal supplies no installation or target-container attestation.
Installation, target-container verification and live optional export remain
unverified release gates. Existing stranded rows
must not be reset from GLB existence or a finished-agent file: the legacy helper
recorded no authoritative pre-export success attestation. Historical
reconciliation is a separate reviewed maintenance decision and is not part of
this transform.

Local evidence on 2026-10-03: 20 recovery regressions, 27 separate offline
snapshot-diagnostic tests and 8 existing source/rollback compatibility tests
passed. A separate bounded native Blender smoke imported a tiny synthetic
textured cube, recovered FBX and textures, retained the original native BLEND,
and preserved every original file hash and the complete succeeded row. It used
4 GiB memory and 60-second process bounds in a temporary workspace. This smoke
used native Blender with the pinned exporter; it did **not** verify the target
Podman sandbox, Oracle installation, a user model or visual fidelity.
