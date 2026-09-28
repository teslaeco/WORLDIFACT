# WORLDIFACT — Oracle source mismatch checkpoint

Updated 28 September 2026 after the owner's Oracle Cloud Shell screenshot.

## VERIFIED from the screenshot and installer source

The owner ran the opt-in installer pinned to `8543665818bc4e3ae03168e11b8306282007f363`. OCI lookup and verified SSH reached the VM. The installer then returned:

`STOP: Unreviewed installed source: codex_runner.py. No service stopped.`

The current installer checks the runner's exact SHA-256 before restarting the worker or writing generator source. The screenshot shows a preflight stop, not successful installation or a completed rollback. Public installer staging may have occurred, but no generator-source update or worker restart was performed by this failed attempt. The printed backup-workspace name alone does not establish that a backup was created.

The actual installed runner fingerprint and the cause of the difference remain UNKNOWN. No allowed hash was changed, and no unreviewed runner was forced through installation.

## Prepared read-only next step — branch only

`tools/profit_guard/inspect_oracle.py` reuses the existing OCI lookup and strict SSH helper. It reads bounded regular source files, calculates SHA-256 and Git blob fingerprints, checks import markers with AST without executing the source, and reads worker/tunnel ActiveState. It does not read provider configuration, print file contents or keys, upload files to the VM, restart services or call an AI model. The compact output is restricted to fixed labels, booleans, hashes and service states.

Five local fixture tests passed: source fingerprinting without execution/modification, symlink refusal, newline-only diagnostic, output allow-list validation, and strict SSH/OCI routing. These are not tests on the owner's actual VM. Run the pinned diagnostic once from the original OCI Cloud Shell and return only its sanitized report. Its outcome identifies the source to audit; it does not authorize installing a patch or changing the expected hash.

## Deployment and billing unchanged

This diagnostic branch changes no production app, billing configuration, model allow-list, job records or installed Oracle guard. PR #137's previous successful model-chooser deployment remains the last verified application release. Astra commercial activation remains blocked until its actual installed-source guard and bounded generation are verified. Do not advertise new Stripe catalogue objects or completed Oracle installation.

The complete preceding status is preserved unchanged in [the previous checkpoint](history/CONTEST_STATUS_before_SOURCE_INSPECTION_20260928.md), including production release and earlier history links.
