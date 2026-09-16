# Oracle storage runbook — WORLDIFACT P0

## Recommendation

For the contest P0, expand the **existing boot volume in place** instead of migrating jobs to a second filesystem tonight. It is the smallest operational change to the preserved v33 VM and can be expanded again later. Recommended first target: **100 GB**.

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

Official OCI documentation currently describes an Always Free combined boot + block volume allowance, while Oracle's current public global price list presents a different free-volume quantity. Treat free entitlement as **UNKNOWN until the tenancy's actual usage/eligibility is checked**. Do not assume the resize is free.

Published Netherlands PAYG list prices are approximately:

- block-volume storage: €0.023715 / GB-month;
- performance units: €0.001581 / VPU-GB-month;
- Balanced uses 10 VPUs/GB, so list price is about €0.039525 / GB-month before any free entitlement/discount.

If the current volume is 30 GB, expanding to 100 GB adds 70 GB. At the published Balanced list rate that is approximately **€2.77/month or €33.20/year incremental**, before any Always Free entitlement. This is an estimate, not an Oracle quote.

## 3. Cost-changing action — only after explicit approval

First create/confirm a recoverable boot-volume backup or another approved rollback point. Backup storage itself can affect billing.

Then online-resize the existing boot volume:

```bash
NEW_SIZE_GB=100
oci bv boot-volume update \
  --boot-volume-id "$BOOT_ID" \
  --size-in-gbs "$NEW_SIZE_GB" \
  --wait-for-state AVAILABLE
```

OCI volume resize is grow-only; do not choose a target larger than needed.

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

If `oci-growfs` is unavailable or the disk layout differs, stop and inspect the partition/LVM layout instead of improvising destructive partition commands.

## 5. WORLDIFACT verification after resize

```bash
df -h /
podman images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
systemctl --user is-active froge-worker.service
systemctl --user is-active froge-tunnel.service
```

Then repeat authenticated `/v1/health`. Only after storage and health are good should `ENABLE_ORACLE_JOBS` be considered for a single controlled prompt job.
