# Restricted Oracle maintenance access

## Initial-edit grant refresh: prepared, not installed

The grant files are prepared for publication and reference the verified immutable
runtime package `5e375f0f7d6f42d8c4d8944fa024bfb474143c04`. Their dependency hashes
are frozen; the grant publication and VM refresh remain separate steps. These
source checks do not establish VM installation. No bootstrap, refresh or apply
is run by a test or by an automatic workflow trigger.

The existing dedicated key currently grants `status` and `apply-b6dce84d`.
Its old immutable `update/` directory cannot execute the new three-helper
initial-edit repair. One explicitly approved owner-run refresh can replace the
allowed operation with exactly `status` and `apply-initial-edit-v1`.
`apply-b6dce84d` is then refused; it is never redirected to another updater.

The new literal operation has one fixed package commit, one launcher SHA-256,
42 pinned package files and these fixed installer options:

- `--update-initial-edit --approve-service-maintenance`
- `--allow-cancelled-cleanup --expected-cancelled-job f91612e5-eb5a-4fec-9585-1ce08c9f38ad`

The latter scope permits only the installer's existing conditional cleanup of
the exact recorded cancellation. It is not blanket cancellation, job deletion,
paid generation or permission to interrupt other work. Both the grant refresh
and that bounded cleanup capability must be disclosed and approved before the
owner executes the refresh. The maintenance workflow itself never refreshes
its grant and cannot choose an arbitrary installer, path, commit or option.

### Preserve the existing identities and trust

`refresh.py` reuses the original administrative SSH identity and existing
trusted host record on the owner's original Cloud Shell. The target must match
the approved fixed production host. The server RSA public-key canonical bytes
are pinned separately by SHA-256; this is not the dedicated authentication key's
fingerprint.

The script reads only the public half of the existing dedicated maintenance key
and matches it to the exact existing forced-command entry. It neither reads the private key contents nor
creates, replaces, copies, prints or asks for a private key. SSH uses the
existing identity for transport and one final read-only `status` check. Every
`authorized_keys` byte, existing host pin, other key, GitHub secret and diagnostic
encryption recipient remains intact. No firewall, account, sudoers or login
setting changes. Do not run the historical bootstrap again for this upgrade.

### Finite transaction and recovery

The receiver verifies the complete old pinned package, two old entrypoints,
current source map, bound health receipt, existing public grant, ownership and
symlink-free paths. It holds the existing setup and installer locks and a short
SQLite admission transaction. The only SQL query reads an aggregate count of
nonterminal/unknown jobs; no prompt, job body, row write or provider call occurs.
Active work, an unknown grant, a partial package or a changed file refuses.

The complete new bundle is staged and verified in a private directory. Atomic
no-replace publication installs `update-initial-edit-v1/` while preserving the
old immutable `update/` directory. A private backup contains only the two known
old entrypoints. `status.py` is replaced first and `dispatcher.py` last. The
runtime and receipts are checked again before and after replacement. No runtime
updater runs during this refresh.

Rollback stays under the same locks and restores only bytes that still equal
the known old/new entrypoint versions. Unknown concurrent changes are preserved
and reported as unconfirmed. Complete package/backup bytes remain for review;
only recognized temporary staging bytes are removed. A repeated completed
refresh is idempotent. Exclusive owner maintenance is required; an unknown or
interrupted state is never assumed successful or silently repaired.

### Freeze and run order

1. Runtime package A is published and verified at
   `5e375f0f7d6f42d8c4d8944fa024bfb474143c04`.
2. Set the dispatcher and refresh package commit to A. Freeze helper hashes,
   launcher hash, dispatcher/status hashes, then receiver hash in dependency
   order. Publish those grant files as commit B. This avoids a self-referential
   commit/hash cycle.
3. After explicit action-time approval of the narrow grant and exact cleanup
   scope, the owner obtains checksum-verified `refresh.py` from B and runs it
   once with `--source-commit <B> --approve-grant-refresh
   --approve-exact-cancelled-cleanup`. Without both flags its default is plan
   only. Invalid or incomplete release pins fail before SSH. No key entry or download is
   required again.
4. Reconcile encrypted `status` evidence. Only then select the manually invoked
   `apply-initial-edit-v1` action within the approved transaction scope. A lost
   connection or elapsed time never proves completion; read `status` again.

Status remains read-only. Its finite report binds all three helper hashes to the
current receipt and the `typed-plan-initial-edit-v1` marker. It includes no API
keys, raw logs, prompts or model data. The GitHub runner preserves strict host
checking, one dedicated identity, fixed commands and authenticated encrypted
artifacts that expire after one day. There is no automatic apply or retry.

## Historical initial setup

The original checksum-pinned `bootstrap.py` created the dedicated RSA identity
and appended exactly one restricted key entry with comment
`worldifact-maintenance-b6dce84d`. Its immutable response-envelope package came
from `b6dce84d1bd598ad88b0af934fa4384354271496`. Historical bootstrap/receiver
hashes remain unchanged; those programs must be obtained from their original
reviewed release, not repurposed as an upgrade mechanism.

The existing GitHub **Production** environment uses
`ORACLE_MAINTENANCE_HOST`, `ORACLE_MAINTENANCE_KNOWN_HOSTS` and
`ORACLE_MAINTENANCE_SSH_KEY`. The manual `reachability` action opens one SSH
listener on port 22 without authentication. It does not change a firewall or
establish host trust from `ssh-keyscan`.

## Revocation and verification limits

The owner can revoke access by removing only the authorized-key entry whose
comment is `worldifact-maintenance-b6dce84d`, then deleting the three dedicated
GitHub secrets. Preserve other key entries, the original administrative key,
transaction locks and generator files.

Offline tests use inert fixtures and scripted subprocesses. They prove bounded
state handling, refusal, idempotence and rollback behavior, not live reachability,
VM activation or generated-model quality. Genuine isolated staged gates and a
separately authorized paid acceptance test remain separate evidence.
