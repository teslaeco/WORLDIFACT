"""Run the opt-in Astra guard installer from the existing OCI Cloud Shell.
Only public, hash-checked source files are sent over verified SSH. No AI request.
"""
import argparse
import base64
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/fast_preview'))
from oracle_preflight import CheckError, invoke, one

NAMES = ('install.py', 'astra_spend.py', 'install_v33.py', 'installed_v33.py', 'apply.py', 'completion.py', 'fast_preview.py')
REMOTE = r'''
import base64, hashlib, json, os, pathlib, subprocess, sys
payload = json.loads(base64.b64decode(PAYLOAD))
names = {'install.py','astra_spend.py','install_v33.py','installed_v33.py','apply.py','completion.py','fast_preview.py'}
if set(payload) != names: raise SystemExit('STOP: invalid public package.')
files = {name: base64.b64decode(value, validate=True) for name, value in payload.items()}
if any(len(raw) > 262144 for raw in files.values()): raise SystemExit('STOP: oversized public package.')
digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
folder = pathlib.Path.home()/'.local/state/worldifact-astra-guard'/('package-'+digest[:16])
if any(p.is_symlink() for p in (folder,*folder.parents)): raise SystemExit('STOP: unsafe staging path.')
folder.mkdir(parents=True,exist_ok=True,mode=0o700)
for name, raw in files.items():
    path = folder/name
    if path.is_symlink(): raise SystemExit('STOP: unsafe package file.')
    if path.exists():
        if path.read_bytes() != raw: raise SystemExit('STOP: package contents changed.')
    else:
        fd = os.open(str(path), os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd,'wb') as out: out.write(raw); out.flush(); os.fsync(out.fileno())
print('Verified public package. Checking existing source and idle jobs before any service restart.',flush=True)
result = subprocess.run([sys.executable,'-B',str(folder/'install.py'),'--approve-service-restart'],cwd=folder)
sys.exit(result.returncode)
'''


def package():
    files = {}
    for name in NAMES:
        folder = Path(__file__).parent if name in ('install.py', 'astra_spend.py') else ROOT / 'tools/fast_preview'
        path = folder / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 262144:
            raise CheckError('Missing or invalid public installer file: ' + name)
        files[name] = base64.b64encode(path.read_bytes()).decode()
    return base64.b64encode(json.dumps(files, sort_keys=True).encode()).decode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approve-service-restart', action='store_true')
    args = parser.parse_args()
    if not args.approve_service_restart:
        print('PLAN ONLY. No SSH, upload, restart or generation. Use --approve-service-restart only for this reviewed maintenance.')
        return
    key = Path.home() / 'ssh-key-2026-09-06.key'
    if key.is_symlink() or not key.is_file() or not os.access(key, os.R_OK):
        raise CheckError('Use the original OCI Cloud Shell account with its existing SSH key. Do not share the key.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = one(invoke(oci + ['search','resource','structured-search','--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query','data.items[].identifier','--output','json']), 'running Froge VM')
    if not instance.startswith('ocid1.instance.') or any(c.isspace() for c in instance):
        raise CheckError('Unexpected instance identifier.')
    address = one(invoke(oci + ['compute','instance','list-vnics','--instance-id',instance,'--all',
        '--query','data[?"is-primary" == `true`]."public-ip"','--output','json']), 'primary public IP')
    ipaddress.ip_address(address)
    script = 'PAYLOAD = ' + repr(package()) + '\n' + REMOTE
    print('Connecting to your existing Oracle VM. Active jobs will not be cancelled; no paid AI test or Stripe activation.',flush=True)
    result = subprocess.run(['ssh','-T','-i',str(key),'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','BatchMode=yes','-o','ConnectTimeout=20','opc@'+address,'PYTHONDONTWRITEBYTECODE=1 python3 -'],input=script,text=True)
    if result.returncode:
        raise CheckError('Oracle maintenance did not confirm success. Preserve backups. Do not disable SSH host verification or rerun a generation.')


if __name__ == '__main__':
    try:
        main()
    except CheckError as error:
        print('STOP: ' + str(error),file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('STOP: Oracle maintenance failed. No API keys or configuration should be shared.',file=sys.stderr)
        sys.exit(1)
