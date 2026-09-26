# Oracle export P0 — one-command finish + live E2E

Use only from the owner's OCI Cloud Shell. This finishes the already-reviewed
Oracle direct-v33 export patch, verifies `posthocExportRevision=2` and
`legacyGlbExportRecoveryRevision=1`, then submits exactly one small live Studio
model and verifies downloads of GLB, PBR/texture ZIP, FBX and BLEND.

```bash
rm -rf ~/WORLDIFACT-export-fix && \
git clone --depth 1 --branch fix/oracle-export-live-e2e-20260926 https://github.com/teslaeco/WORLDIFACT.git ~/WORLDIFACT-export-fix && \
cd ~/WORLDIFACT-export-fix && \
python3 -B tools/export_prepare/finish_and_verify.py --approve-one-live-test
```

The Oracle maintenance step itself makes no AI/model request. The final E2E
step is intentionally one live generation because the owner explicitly asked
for a real generate-and-download verification. It never retries generation
automatically. Successful artifacts are written into
`worldifact-export-e2e-<job-id>/` in Cloud Shell.
