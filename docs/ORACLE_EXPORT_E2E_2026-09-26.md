# Oracle export P0 — v4 synchronous maintenance + resumable one-job E2E

The v2/v3 attempts proved that `froge-worker.service` and
`froge-tunnel.service` stayed active, while the transient maintenance unit
could enter `failed` before writing a useful installer result. v4 removes
that extra systemd-run layer.

The OCI Cloud Shell command now opens the existing SSH connection and runs the
reviewed rollback-safe installer directly. The exact installer JSON is returned
to Cloud Shell, including the current source hash/error if the worker is not one
of the reviewed v33 revisions.

The installer still:

- accepts only exact reviewed FAST v33 source revisions;
- refuses an active generation job or unknown `server.py` bytes;
- backs up the exact starting server;
- restarts only `froge-worker.service`;
- verifies `connectorVersion=33`, `posthocExportRevision=2` and
  `legacyGlbExportRecoveryRevision=1`;
- rolls back to the exact starting bytes if verification fails;
- performs no AI/model request itself.

After maintenance succeeds, the E2E verifier persists one UUID **before**
submission. If the phone, browser or SSH wait drops, running the same command
again resumes that same UUID. It does not create another model automatically.

The one explicitly approved test verifies real bytes for:

- GLB;
- PBR / texture ZIP;
- FBX;
- BLEND.

Run from the owner's OCI Cloud Shell:

```bash
cd ~ && \
rm -rf WORLDIFACT-export-fix && \
git clone --depth 1 --branch fix/oracle-export-v4-sync-resume-20260926 https://github.com/teslaeco/WORLDIFACT.git WORLDIFACT-export-fix && \
cd WORLDIFACT-export-fix && \
python3 -B tools/export_prepare/finish_and_verify.py --approve-one-live-test
```

If Cloud Shell disconnects during the model build, run the **same command**
again. The persisted job id is reused.

Final proof:

```text
WORLDIFACT_EXPORT_E2E_PASS
WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE
```
