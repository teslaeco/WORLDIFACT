# Oracle export P0 — corrected v3 one-command finish + live E2E

The earlier v2 launcher can remain stuck on a recorded `LAUNCH_FAILED` result.
The v3 launcher uses a new maintenance namespace and accepts only the exact
reviewed Oracle v33 production revisions:

- FAST v33 base;
- FAST v33 + project files;
- FAST v33 + project files + export preparation v1.

Unknown `server.py` bytes are refused and never modified. The maintenance
backs up the exact starting server and rolls back to those exact bytes if
health verification fails.

After `posthocExportRevision=2` and
`legacyGlbExportRecoveryRevision=1` are verified, a separate remote systemd
task submits **exactly one** small live Oracle model. It performs no automatic
generation retry and verifies real downloads of:

- GLB;
- PBR / texture ZIP;
- FBX;
- BLEND.

Both maintenance and the one-job E2E test continue on the VM if the phone or
Cloud Shell browser disconnects.

Run from the owner's OCI Cloud Shell:

```bash
cd ~ && \
rm -rf WORLDIFACT-export-fix && \
git clone --depth 1 https://github.com/teslaeco/WORLDIFACT.git WORLDIFACT-export-fix && \
cd WORLDIFACT-export-fix && \
python3 -B tools/export_prepare/finish_and_verify.py --approve-one-live-test
```

Expected terminal proof:

```text
WORLDIFACT_EXPORT_E2E_PASS
WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE
```

The one live model is an explicit owner-approved technical verification. Export
preparation itself sends no new AI request and always operates on that same
saved model.
