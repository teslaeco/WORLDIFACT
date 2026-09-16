#!/usr/bin/env bash
set -euo pipefail

TARGET_GB=100
INSTANCE_NAME='froge-blender'
SSH_KEY="$HOME/ssh-key-2026-09-06.key"

echo '=== RESOLVE FROGE VM ==='
INSTANCE_ID=$(oci search resource structured-search \
  --query-text "query instance resources where displayName = '$INSTANCE_NAME'" \
  --query 'data.items[0].identifier' --raw-output)
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo 'STOP: instance not found'; exit 1; }

INSTANCE_JSON=$(oci compute instance get --instance-id "$INSTANCE_ID")
COMPARTMENT_ID=$(printf '%s' "$INSTANCE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["compartment-id"])')
AD=$(printf '%s' "$INSTANCE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["availability-domain"])')
BOOT_ID=$(oci compute boot-volume-attachment list \
  --availability-domain "$AD" --compartment-id "$COMPARTMENT_ID" \
  --instance-id "$INSTANCE_ID" --all \
  --query 'data[0]."boot-volume-id"' --raw-output)
PUBLIC_IP=$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" \
  --query 'data[0]."public-ip"' --raw-output)
[ -n "$BOOT_ID" ] && [ "$BOOT_ID" != "null" ] || { echo 'STOP: boot volume not found'; exit 1; }
[ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "null" ] || { echo 'STOP: public IP not found'; exit 1; }

CURRENT_GB=$(oci bv boot-volume get --boot-volume-id "$BOOT_ID" --query 'data."size-in-gbs"' --raw-output)
VPU=$(oci bv boot-volume get --boot-volume-id "$BOOT_ID" --query 'data."vpus-per-gb"' --raw-output)
printf 'VM=%s\nCurrent boot=%s GB\nTarget=%s GB\nVPU/GB=%s\n' "$INSTANCE_NAME" "$CURRENT_GB" "$TARGET_GB" "$VPU"

echo '=== READ-ONLY VOLUME INVENTORY (CURRENT COMPARTMENT) ==='
oci bv boot-volume list --compartment-id "$COMPARTMENT_ID" --availability-domain "$AD" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",state:"lifecycle-state"}' --output table
oci bv volume list --compartment-id "$COMPARTMENT_ID" --all \
  --query 'data[].{name:"display-name",sizeGB:"size-in-gbs",vpu:"vpus-per-gb",state:"lifecycle-state"}' --output table

if [ "$CURRENT_GB" -gt "$TARGET_GB" ]; then
  echo 'STOP: current boot volume is already larger than approved target.'
  exit 2
fi

if [ "$CURRENT_GB" -lt "$TARGET_GB" ]; then
  echo '=== CREATE TEMPORARY PRE-RESIZE BACKUP ==='
  BACKUP_NAME="worldifact-pre-100gb-$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_ID=$(oci bv boot-volume-backup create \
    --boot-volume-id "$BOOT_ID" --display-name "$BACKUP_NAME" --type INCREMENTAL \
    --wait-for-state AVAILABLE --query 'data.id' --raw-output)
  [ -n "$BACKUP_ID" ] && [ "$BACKUP_ID" != "null" ] || { echo 'STOP: backup was not created'; exit 3; }
  echo "Backup AVAILABLE: $BACKUP_NAME"

  echo '=== ONLINE RESIZE TO 100 GB ==='
  oci bv boot-volume update --boot-volume-id "$BOOT_ID" --size-in-gbs "$TARGET_GB" \
    --wait-for-state AVAILABLE >/dev/null
else
  echo 'Boot volume is already 100 GB; resize skipped.'
fi

echo '=== EXTEND ORACLE LINUX ROOT FS ==='
chmod 600 "$SSH_KEY"
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new opc@"$PUBLIC_IP" 'bash -s' <<'VM'
set -euo pipefail
echo BEFORE
lsblk
df -h /
if [ ! -x /usr/libexec/oci-growfs ]; then
  echo 'STOP: oci-growfs missing; no partition changes made.'
  exit 4
fi
sudo /usr/libexec/oci-growfs -y
echo AFTER
lsblk
df -h /
echo SERVICES
printf 'worker='; systemctl --user is-active froge-worker.service
printf 'tunnel='; systemctl --user is-active froge-tunnel.service
printf 'renderer='; podman images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep '^localhost/froge-blender:local ' || true
VM

echo '=== AUTHENTICATED HEALTH (NO SECRET OUTPUT) ==='
ENDPOINT=$(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes opc@"$PUBLIC_IP" \
  "{ grep -Eo 'https://[a-z0-9-]+\\.trycloudflare\\.com' ~/froge-connector/state/tunnel.log 2>/dev/null || true; journalctl --user -u froge-tunnel.service -n 100 --no-pager 2>/dev/null | grep -Eo 'https://[a-z0-9-]+\\.trycloudflare\\.com' || true; } | tail -1")
TOKEN=$(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes opc@"$PUBLIC_IP" \
  "python3 -c \"import json,pathlib; print(json.loads((pathlib.Path.home()/'froge-connector/state/config.json').read_text())['token'])\"")
[ -n "$ENDPOINT" ] || { echo 'STOP: tunnel endpoint missing'; exit 5; }
[ ${#TOKEN} -ge 40 ] || { echo 'STOP: Oracle token missing'; exit 5; }
curl -fsS --max-time 15 -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' \
  "$ENDPOINT/v1/health" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ready=",d.get("ready")); print("provider=",d.get("provider")); print("model=",d.get("model")); print("connectorVersion=",d.get("connectorVersion")); print("characterStandard=",d.get("characterStandard"))'
unset TOKEN ENDPOINT

echo '=== DONE ==='
