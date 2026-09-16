# Oracle storage runbook — WORLDIFACT P0

## Recommendation

For the contest P0, expand the **existing boot volume in place** instead of migrating jobs to a second filesystem tonight. It is the smallest operational change to the preserved v33 VM and can be expanded again later. Approved target: **100 GB**.

Do not run Blender jobs when the connector is near its 2 GB free-space guard. Back up before resizing.

## 1. Read-only inventory from OCI Cloud Shell

```bash
INSTANCE_ID=$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'froge-blender'" \
  --query 'data.items[0].identifier' --raw-output)

COMPARTMENT_ID=$(oci compute instance get \
  --instance-id "$INSTANCE_ID" \
  --query 'data."compartment-id"' --raw-output)

AD=$(oci compute instance get \
  --instance-id "$INSTANCE_ID" \
  --query 'data."availability-domain"' --raw-output)

BOOT_ID=$(oci compute boot-volume-attachment list \
  --availability-domain "$AD" \
  --compartment-id "$COMPARTMENT_ID" \
  --instance-id "$INSTANCE_ID" --all \
  --query 'data[0]."boot-volume-id"' --raw-output)

PUBLIC_IP=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --query 'data[0]."public-ip"' --raw-output)

printf 'INSTANCE_ID=%s\nCOMPARTMENT_ID=%s\nAD=%s\nBOOT_ID=%s\nPUBLIC_IP=%s\n' \
  "$INSTANCE_ID" "$COMPARTMENT_ID" "$AD" "$BOOT_ID" "$PUBLIC_IP"

oci bv boot-volume get --boot-volume-id "$BOOT_ID" \
  --query 'data.{name:"display-name",sizeGB:"size-in-gbs",vpusPerGB:"vpus-per-gb",state:"lifecycle-state",AD:"availability-domain"}' \
  --output table

echo "=== ALL BOOT VOLUMES IN INSTANCE COMPARTMENT ==="
oci bv boot-volume list \
  --compartment-id "$COMPARTMENT_ID" \
  --availability-domain "$AD" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",state:"lifecycle-state",AD:"availability-domain"}' --output table

echo "=== ALL BLOCK VOLUMES IN INSTANCE COMPARTMENT ==="
oci bv volume list --compartment-id "$COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",vpusPerGB:"vpus-per-gb",state:"lifecycle-state"}' --output table
```

`boot-volume-attachment list` requires both availability domain and compartment ID; the runbook resolves them from the live instance before reading its attachment. This inventory does not resize or create storage.

## 2. Cost/entitlement gate

Oracle's current Always Free documentation states that eligible tenancies receive **200 GB total combined boot + block volume storage in the home region**, plus five volume backups. WORLDIFACT's Oracle Cloud Shell showed the tenancy home region as Netherlands Northwest (Amsterdam), but actual tenancy-wide storage usage still needs to be checked before relying on the free allowance.

Oracle's current global price list publishes standard Block Volume storage at **USD 0.0255/GB-month** and Balanced performance at **USD 0.017/GB-month** (10 VPUs/GB). If the current boot volume is 30 GB and all added 70 GB were billed at those list rates, the incremental list-price estimate is about **USD 2.975/month or USD 35.70/year**, before tax/discount/free entitlement. This remains an estimate, not an Oracle quote.

Owner-approved ceiling: **EUR 40/year incremental**. If the OCI console/CLI indicates a higher charge or a configuration outside this envelope, stop before resize.

## 3. Backup/rollback gate

Before resize, create or confirm a recoverable boot-volume backup. Backup creation is a separate storage action and can affect billing when outside entitlement. Oracle documents five Always Free volume backups in the home region for eligible tenancies.

Example manual backup after confirming entitlement/cost:

```bash
oci bv boot-volume-backup create \
  --boot-volume-id "$BOOT_ID" \
  --display-name "worldifact-pre-100gb-$(date -u +%Y%m%dT%H%M%SZ)" \
  --type INCREMENTAL \
  --wait-for-state AVAILABLE
```

If the backup command reports a cost/permission problem or does not reach `AVAILABLE`, stop before resize.

## 4. Cost-changing action — approved up to the stated ceiling

```bash
NEW_SIZE_GB=100
oci bv boot-volume update \
  --boot-volume-id "$BOOT_ID" \
  --size-in-gbs "$NEW_SIZE_GB" \
  --wait-for-state AVAILABLE
```

OCI documents online boot-volume expansion without detaching the instance. Resize is grow-only: do not choose a target larger than needed.

## 5. Extend Oracle Linux root filesystem

From Cloud Shell, use the existing SSH key and the live public IP resolved above:

```bash
ssh -i "$HOME/ssh-key-2026-09-06.key" -o IdentitiesOnly=yes opc@"$PUBLIC_IP" 'bash -s' <<'EOF'
set -e

echo "=== BEFORE GROW ==="
lsblk
findmnt /
df -h /

if [ -x /usr/libexec/oci-growfs ]; then
  sudo /usr/libexec/oci-growfs -y
else
  echo "STOP: /usr/libexec/oci-growfs is unavailable; inspect disk layout manually."
  exit 2
fi

echo "=== AFTER GROW ==="
lsblk
df -h /

echo "=== FROGE SERVICES ==="
systemctl --user is-active froge-worker.service
systemctl --user is-active froge-tunnel.service

podman images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | head -20
EOF
```

Oracle documents `oci-growfs` for extending an XFS/ext4 root filesystem after boot-volume expansion. If `oci-growfs` is unavailable or the disk layout differs, stop instead of improvising destructive partition commands.

## 6. WORLDIFACT verification after resize

Repeat the authenticated `/v1/health` check and require:

- `ready = true`
- `provider = openai`
- `model = gpt-6-astra`
- connector version >= 33
- free root space comfortably above the connector's 2 GB guard

Only after storage and health are good should `ENABLE_ORACLE_JOBS` be considered for the single controlled prompt job inside the approved 4-attempt / 3-hour pilot.

## Official references re-checked 2026-09-16

- Oracle Always Free resources: combined 200 GB boot/block volume allowance in the tenancy home region.
- Oracle CLI: `boot-volume-attachment list` requires availability domain and compartment ID.
- Oracle Block Volume online resize: boot/block volumes can be expanded online; they cannot be reduced.
- Oracle OCI Utilities: `oci-growfs` expands the root partition/filesystem after boot-volume growth.
- Oracle Cloud price list: Block Volume storage and performance units are billed per GB-month when not covered by entitlement/discount.
