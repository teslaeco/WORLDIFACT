# Oracle storage runbook — WORLDIFACT P0

## Recommendation

For the contest P0, expand the **existing boot volume in place** instead of migrating jobs to a second filesystem tonight. It is the smallest operational change to the preserved v33 VM and can be expanded again later. Approved target: **100 GB**.

Do not run Blender jobs when the connector is near its 2 GB free-space guard. Back up before resizing.

## 1. Read-only inventory from OCI Cloud Shell

```bash
INSTANCE_ID=$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'froge-blender'" \
  --query 'data.items[0].identifier' --raw-output)

BOOT_ID=$(oci compute boot-volume-attachment list \
  --instance-id "$INSTANCE_ID" --all \
  --query 'data[0]."boot-volume-id"' --raw-output)

echo "INSTANCE_ID=$INSTANCE_ID"
echo "BOOT_ID=$BOOT_ID"

oci bv boot-volume get --boot-volume-id "$BOOT_ID" \
  --query 'data.{name:"display-name",sizeGB:"size-in-gbs",vpusPerGB:"vpus-per-gb",state:"lifecycle-state",AD:"availability-domain"}' \
  --output table

COMPARTMENT_ID=$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)
echo "=== ALL BOOT VOLUMES IN COMPARTMENT ==="
oci bv boot-volume list --compartment-id "$COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",state:"lifecycle-state",AD:"availability-domain"}' --output table

echo "=== ALL BLOCK VOLUMES IN COMPARTMENT ==="
oci bv volume list --compartment-id "$COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",vpusPerGB:"vpus-per-gb",state:"lifecycle-state"}' --output table
```

This inventory does not resize or create storage.

## 2. Cost/entitlement gate

Oracle's current Always Free documentation states that eligible tenancies receive **200 GB total combined boot + block volume storage in the home region**, plus five volume backups. WORLDIFACT's Oracle Cloud Shell showed the tenancy home region as Netherlands Northwest (Amsterdam), but actual tenancy-wide storage usage still needs to be checked before relying on the free allowance.

Oracle's current global price list publishes standard Block Volume storage at **USD 0.0255/GB-month** and Balanced performance at **USD 0.017/GB-month** (10 VPUs/GB). If the current boot volume is 30 GB and all added 70 GB were billed at those list rates, the incremental list-price estimate is about **USD 2.975/month or USD 35.70/year**, before tax/discount/free entitlement. This remains an estimate, not an Oracle quote.

Owner-approved ceiling: **EUR 40/year incremental**. If the OCI console/CLI indicates a higher charge or a configuration outside this envelope, stop before resize.

## 3. Cost-changing action — approved up to the stated ceiling

First create/confirm a recoverable boot-volume backup or another approved rollback point. Oracle documents five Always Free volume backups in the home region for eligible tenancies, but actual usage must be checked before assuming another backup is free.

Then online-resize the existing boot volume:

```bash
NEW_SIZE_GB=100
oci bv boot-volume update \
  --boot-volume-id "$BOOT_ID" \
  --size-in-gbs "$NEW_SIZE_GB" \
  --wait-for-state AVAILABLE
```

OCI documents online boot-volume expansion without detaching the instance. Resize is grow-only: do not choose a target larger than needed.

## 4. Extend Oracle Linux root filesystem

SSH into the VM and verify the larger device first:

```bash
lsblk
findmnt /
df -h /
```

On an Oracle Linux image with OCI Utilities:

```bash
sudo /usr/libexec/oci-growfs -y
lsblk
df -h /
```

Oracle documents `oci-growfs` for extending an XFS/ext4 root filesystem after boot-volume expansion. If `oci-growfs` is unavailable or the disk layout differs, stop and inspect the partition/LVM layout instead of improvising destructive partition commands.

## 5. WORLDIFACT verification after resize

```bash
df -h /
podman images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
systemctl --user is-active froge-worker.service
systemctl --user is-active froge-tunnel.service
```

Then repeat authenticated `/v1/health`. Only after storage and health are good should `ENABLE_ORACLE_JOBS` be considered for the single controlled prompt job inside the approved 4-attempt / 3-hour pilot.

## Official references re-checked 2026-09-16

- Oracle Always Free resources: combined 200 GB boot/block volume allowance in the tenancy home region.
- Oracle Block Volume online resize: boot/block volumes can be expanded online; they cannot be reduced.
- Oracle OCI Utilities: `oci-growfs` expands the root partition/filesystem after boot-volume growth.
- Oracle Cloud price list: Block Volume storage and performance units are billed per GB-month when not covered by entitlement/discount.
