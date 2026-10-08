# Restricted Oracle maintenance access

This owner-approved setup gives one dedicated SSH key exactly two commands:
`status` and `apply-b6dce84d`. The second command can only run the existing
reviewed response-envelope updater from commit
`b6dce84d1bd598ad88b0af934fa4384354271496`. It cannot choose another package,
run a shell, forward ports, allocate a terminal or start model generation.

The owner runs a checksum-pinned `bootstrap.py --source-commit <reviewed commit>
--approve-restricted-access` once in the original Oracle Cloud Shell. It reuses
the existing strict SSH connection to the existing `opc` account. It creates a
dedicated RSA key in the owner's Cloud Shell and installs the fixed dispatcher
and verified updater bundle in `~/.local/share/worldifact-maintenance` on the VM.
Existing authorized keys remain byte-for-byte intact; the restricted entry is
appended once. A repeated setup reuses the same key and identical files. Unknown,
changed or unsafe files cause refusal rather than replacement.

Before declaring setup ready, the bootstrap authenticates once with the new
restricted key and trusted host pin to run `status`. This checks the real SSH
restrictions and interpreter from Cloud Shell. It never runs the updater.

The setup does not invoke the updater. It does not change firewall rules,
create a VM account or runner, alter the provider cap or modify customer data.
The current runtime must be reconciled before a maintenance update is selected.

## One-time secure handoff

1. Read the setup's nonsecret result. It provides the VM's public IPv4 address,
   a host-key line obtained through the existing trusted SSH connection, and
   the private key's local download path. Setup success does not prove that
   GitHub-hosted runners can reach the VM's SSH port.
2. Set `ORACLE_MAINTENANCE_HOST` and `ORACLE_MAINTENANCE_KNOWN_HOSTS` in the
   repository's existing **Production** environment. Run the workflow's
   `reachability` action. It reads one SSH banner at the specified host on port
   22, without a private key. A blocked connection requires investigation;
   this package never opens a firewall port.
3. Only after that check, the owner uses Cloud Shell's **Download** menu for
   the printed private-key path and personally saves that key as
   `ORACLE_MAINTENANCE_SSH_KEY` in
   [WORLDIFACT Production secrets](https://github.com/teslaeco/WORLDIFACT/settings/environments/21955502130/edit).
   Never put the private key in chat, screenshots, source code, logs or artifacts.
   The assistant must not enter or transmit it for the owner.
4. Run `status` first and review its encrypted result. Run `apply-b6dce84d`
   only if the existing transaction is settled and the current verified state
   permits the same approved correction. There is no automatic apply or retry.

The manual workflow uses strict host-key checking and the dedicated identity.
Its evidence artifact is encrypted to the existing diagnostic recipient and
expires after one day. Only bounded, schema-validated state is collected; raw
logs, prompts, API keys and model data are excluded. An apply can take as long
as the existing offline verification gates. A lost connection or elapsed time
never establishes success; read `status` again before considering another apply.

## Revocation and verification limits

The owner can revoke this access by removing only the authorized-key entry
whose comment is `worldifact-maintenance-b6dce84d`, then deleting the three
dedicated GitHub environment secrets. Preserve every other key entry and the
original administrative key. Do not delete transaction locks or generator files.

Local and hosted tests use inert key fixtures and scripted subprocesses. They
verify restrictions and failure handling, not live SSH reachability or model
quality. A verified installation still requires a separately authorized paid
acceptance test before successful new-model generation can be claimed.
