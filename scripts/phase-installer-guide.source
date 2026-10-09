# Install the response decoder correction on the existing Oracle worker

This is a narrow update of the existing generator, not a new engine, a frontend
redesign, a financial migration or a historical-tree rollback.

## Scope

Use the original Cloud Shell account and its existing trusted SSH identity.
The launcher resolves exactly one running `froge-blender` in `eu-amsterdam-1`,
checks all downloaded package files, and runs one explicit transaction:

```sh
python3 oracle_construction_launch.py --source-commit EXACT_REVIEWED_COMMIT \
  --update-response-phase --approve-service-maintenance
```

Without the approval flag the launcher is inert. The release handoff must supply
the actual immutable 40-character commit and SHA-256 of this launcher. Do not use
`main`, an old updater, an unverified downloaded script or the placeholder above.

The update requires all fourteen installed source hashes to match the compiled
initial-edit predecessor and the original bound receipt chain to be valid. The
persistent live write set is exactly `construction_payload.py` and the top
`.worldifact-standard-construction.json` receipt. Historical receipts, source
models, saved jobs, prices, funding and accounting state are preserved. The
existing temporary maintenance marker is created/removed inside the transaction.

It keeps the existing exclusive locks, idle-queue fence, private rollback backup,
four isolated offline gates, process identity checks and activation latch. It
briefly stops/restarts only the worker, not the tunnel or the VM. It does not
contact a model provider, create a new job, charge points, change limits or delete
cancelled jobs. Busy, cancelled-cleanup, unexpected-source and uncertain states
stop safely rather than silently widening the operation. No cleanup consent is
included in the handoff command; old consent is not reused.

On a pre-activation error the transaction attempts to restore its known original
bytes and permissions. An uncertain or committed activation must be inspected,
not automatically rolled back or retried. A repeated invocation against the
already updated source refuses before service maintenance rather than replaying.

## Existing GitHub access

The configured restricted-maintenance workflow can use stored credentials, but
its forced-command grant names the old literal operations `status` and
`apply-initial-edit-v1` (or the earlier `apply-b6dce84d`). It is not an arbitrary
SSH shell and cannot install new parser bytes just because the secret exists.
This change does not replace or broaden that grant, export secrets, alter
`authorized_keys`, bypass host verification or replay its historical operation.
The original-owner launcher is the supported route for this new exact update.

## Acceptance

`WORLDIFACT_STANDARD_CONSTRUCTION_VERIFIED` establishes the installed source and
its offline gates and health, not live model quality. A failure prints only a
fixed refusal category, never a secret or raw private provider message. Preserve
its backup/evidence and do not run the old installers over an uncertain state.

After installation, verify one real prompt-to-GLB outcome, preview, download and
library persistence. A paid test needs its own explicitly approved spending
limit. This package does not contain permission or an automatic trigger for one.
Cloudflare and production account settings need no redeployment for this Python
update; do not merge this PR as a shortcut to installing it on the Oracle host.
