"""Read-only pre-install check, run in the owner's OCI Cloud Shell.

Uses the existing SSH key without reading its contents. Resolves the existing
running VM through OCI; SSH host verification remains mandatory. Does not write
worker files, copy archives, restart services, change counters, or call AI.
"""
from pathlib import Path
import ipaddress
import json
import os
import subprocess
import sys

REMOTE = r'''
from pathlib import Path
import hashlib, importlib.util, json, platform, sqlite3, subprocess, sys
root = Path.home() / 'froge-connector'
expected = {
 'server.py': '4e40ac5e30b1dadd3c2b97c18d746a630122ccf3',
 'codex_runner.py': '55a4442f411a7e2c6060cca298a056004d30d9d4',
 'blender_mcp.py': '1fe58476bd1366c8c8106dc76439db1974fa51a4',
 'runtime/run.py': '48e4e456084b5bbd7e6b399f4210992d41bfdfe7',
}
def code_bytes(name):
 p = root / name
 if p.is_symlink() or p.parent.is_symlink() or not p.is_file() or p.stat().st_size > 1048576:
  return None
 return p.read_bytes()
def blob(data):
 return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
result = {'read_only': True, 'worker_found': root.is_dir() and not root.is_symlink(),
 'architecture': platform.machine(), 'python': platform.python_version(),
 'source_matches': False, 'installer_source': None, 'runtime_check_source': None,
 'codex_binaries_verified': None, 'mcp_receipt_matches_current_sources': None,
 'active_jobs': None, 'worker_service': 'UNKNOWN', 'tunnel_service': 'UNKNOWN',
 'fast_helper_present': (root/'fast_preview.py').exists(), 'generation_requested': False}
if result['worker_found']:
 sources = {name: code_bytes(name) for name in expected}
 result['source_matches'] = all(raw is not None and blob(raw)==expected[name] for name,raw in sources.items())
 installer = code_bytes('install_codex.py')
 runtime = code_bytes('runtime_check.py')
 result['installer_source'] = blob(installer) if installer is not None else None
 result['runtime_check_source'] = blob(runtime) if runtime is not None else None
 for service, field in [('froge-worker.service','worker_service'),('froge-tunnel.service','tunnel_service')]:
  try:
   answer = subprocess.run(['systemctl','--user','is-active',service],capture_output=True,text=True,timeout=10)
   state=answer.stdout.strip()
   result[field]=state if state in ('active','inactive','failed','activating','deactivating','unknown') else 'UNKNOWN'
  except Exception: pass
 database = root/'state/jobs.sqlite'
 if database.is_file() and not database.is_symlink() and not database.parent.is_symlink():
  try:
   connection=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=5)
   try:
    connection.execute('PRAGMA query_only=ON')
    result['active_jobs']=connection.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]
   finally: connection.close()
  except Exception: pass
 if result['source_matches'] and result['installer_source']=='ee6e3471d947a69196d1d554a6f22acf080b53e9' and sys.version_info >= (3,9):
  try:
   spec=importlib.util.spec_from_file_location('_verified_froge_installer',root/'install_codex.py')
   module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
   result['codex_binaries_verified']=module.verified_runtime(root/'tools/codex') is not None
   receipt_path=root/'tools/codex/verified.json'
   if receipt_path.is_file() and not receipt_path.is_symlink() and receipt_path.stat().st_size <= 16384:
    receipt=json.loads(receipt_path.read_text())
    hashes={name:hashlib.sha256(sources[name]).hexdigest() for name in ('codex_runner.py','blender_mcp.py')}
    result['mcp_receipt_matches_current_sources']=receipt.get('sources')==hashes and receipt.get('blender_build_roundtrip') is True
  except Exception:
   result['verification_read']='UNAVAILABLE'
print(json.dumps(result,indent=2))
'''

class CheckError(Exception):
    pass


def invoke(args, timeout=60, data=None):
    try:
        result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise CheckError('Required command is missing. Run this file in OCI Cloud Shell.') from None
    except subprocess.TimeoutExpired:
        raise CheckError('Read-only check timed out. No worker update was attempted.') from None
    if result.returncode:
        err = result.stderr or ''
        if 'Host key verification failed' in err or 'REMOTE HOST IDENTIFICATION HAS CHANGED' in err:
            raise CheckError('SSH host verification failed. Do not delete known_hosts or disable verification; send this result.')
        if 'Permission denied' in err:
            raise CheckError('SSH access was denied. No update attempted; do not share your private key.')
        raise CheckError('Read-only command failed (exit %s). No update was attempted.' % result.returncode)
    if len(result.stdout) > 65536:
        raise CheckError('Unexpectedly large diagnostic response; nothing installed.')
    return result.stdout


def one(text, label):
    try:
        values = json.loads(text)
    except ValueError:
        raise CheckError('OCI did not return JSON for ' + label) from None
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], str) or not values[0]:
        raise CheckError('Expected exactly one ' + label + '; nothing installed.')
    return values[0]


def main():
    key = Path.home() / 'ssh-key-2026-09-06.key'
    if not key.is_file() or not os.access(key, os.R_OK):
        raise CheckError('The existing SSH key was not found. Run from the original Cloud Shell account; do not send key contents.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = one(invoke(oci + ['search','resource','structured-search','--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query','data.items[].identifier','--output','json']), 'running Froge VM')
    if not instance.startswith('ocid1.instance.') or any(c.isspace() for c in instance):
        raise CheckError('Unexpected instance identifier.')
    address = one(invoke(oci + ['compute','instance','list-vnics','--instance-id',instance,'--all',
        '--query','data[?"is-primary" == `true`]."public-ip"','--output','json']), 'primary public IP')
    try:
        ipaddress.ip_address(address)
    except ValueError:
        raise CheckError('Invalid server IP returned by OCI.') from None
    print('Reading the installed VM status. No install, restart, file upload or model request.', flush=True)
    output = invoke(['ssh','-T','-i',str(key),'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','BatchMode=yes','-o','ConnectTimeout=20','opc@'+address,'PYTHONDONTWRITEBYTECODE=1 python3 -'],
        timeout=180, data=REMOTE)
    try:
        value = json.loads(output)
    except ValueError:
        raise CheckError('VM did not return the expected JSON. No update was attempted.') from None
    if not isinstance(value, dict) or value.get('read_only') is not True or value.get('generation_requested') is not False:
        raise CheckError('Unexpected diagnostic result.')
    print(json.dumps(value, indent=2))
    print('CHECK COMPLETE. FAST has NOT been installed or enabled. Send this summary, not keys or config files.')


if __name__ == '__main__':
    try:
        main()
    except CheckError as exc:
        print('STOP: ' + str(exc), file=sys.stderr)
        sys.exit(1)
