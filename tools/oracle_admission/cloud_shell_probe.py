"""Owner-operated Cloud Shell probe; never installs or restarts production.

The public files are pinned independently of the supplied immutable commit.
Existing SSH trust/key are required. Only disposable SQLite tests write files.
"""
import argparse
import base64
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

FILES = {
    "durable_inbox.py": "b2c378c139b8278ce16ec602079136b8ce133fb7e8ba93fc892533c0cee0a6ce",
    "read_only_probe.py": "0331beb93ad58cdd9cbeedee35bef89bacbef2dd002339bdbf3b114f7e4acf1e",
    "test_durable_inbox.py": "812566e7482d6f4abd82624ec70c79c8e07a4a36fafca92ed6a744c0c66e8f9f"
}
BASE = 'https://raw.githubusercontent.com/teslaeco/WORLDIFACT/'
REMOTE = r"""
import base64, hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path
package = json.loads(base64.b64decode(PACKAGE))
with tempfile.TemporaryDirectory(prefix='worldifact-p0-inert-') as temporary:
    directory = Path(temporary)
    for name, item in package.items():
        if name not in ('durable_inbox.py','test_durable_inbox.py','read_only_probe.py'):
            raise ValueError('Unexpected probe file')
        raw = base64.b64decode(item['bytes'], validate=True)
        if hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError('Probe integrity failed')
        path = directory/name
        path.write_bytes(raw)
        path.chmod(0o600)
    result = subprocess.run([sys.executable, '-I', '-B', '-m', 'unittest', 'discover',
                             '-s', temporary, '-p', 'test_durable_inbox.py'],
                            cwd=temporary, env={'PATH':os.defpath, 'PYTHONDONTWRITEBYTECODE':'1'},
                            capture_output=True, text=True, timeout=45)
    namespace = {'__name__':'worldifact_read_only_probe'}
    exec(compile((directory/'read_only_probe.py').read_bytes(), 'verified-probe.py', 'exec'), namespace)
    report = namespace['snapshot']('/home/opc/froge-connector')
    counts = re.search(r'Ran (\d+) tests?', result.stderr)
    report['isolated_vm_inbox_tests'] = {
        'passed':result.returncode == 0 and bool(counts) and int(counts[1]) == 12,
        'executed':int(counts[1]) if counts else 0,
        'production_acceptance_verified':False}
    print(json.dumps(report, indent=2, sort_keys=True))
"""


def public_file(commit, name):
    if not re.fullmatch('[a-f0-9]{40}', commit) or name not in FILES:
        raise ValueError('Exact commit and approved probe file required')
    with urllib.request.urlopen(BASE+commit+'/tools/oracle_admission/'+name, timeout=30) as response:
        raw = response.read(1024*1024+1)
    if len(raw)>1024*1024 or hashlib.sha256(raw).hexdigest()!=FILES[name]:
        raise ValueError('Public probe integrity mismatch')
    return raw


def remote_program(values):
    if set(values)!=set(FILES) or any(hashlib.sha256(values[n]).hexdigest()!=FILES[n] for n in FILES):
        raise ValueError('Complete checksum-verified probe required')
    package = {n:{'bytes':base64.b64encode(values[n]).decode(), 'sha256':FILES[n]} for n in FILES}
    encoded = base64.b64encode(json.dumps(package).encode()).decode()
    return 'PACKAGE = '+repr(encoded)+'\n'+REMOTE


def oci_one(args):
    result = subprocess.run(['oci','--region','eu-amsterdam-1']+args, capture_output=True, text=True, timeout=60)
    if result.returncode: raise ValueError('OCI lookup failed')
    value = json.loads(result.stdout)
    if not isinstance(value,list) or len(value)!=1 or not isinstance(value[0],str):
        raise ValueError('Expected exactly one VM/address')
    return value[0]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args(argv)
    # Public checksums are verified before any VM connection.
    program = remote_program({name:public_file(args.commit,name) for name in FILES})
    key = Path.home()/'ssh-key-2026-09-06.key'
    if not key.is_file() or any(p.is_symlink() for p in (key,*key.parents)):
        raise ValueError('Original Cloud Shell key unavailable; do not share it')
    instance = oci_one(['search','resource','structured-search','--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query','data.items[].identifier','--output','json'])
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+',instance): raise ValueError('Invalid VM identifier')
    address = oci_one(['compute','instance','list-vnics','--instance-id',instance,'--all',
                       '--query','data[?"is-primary" == `true`]."public-ip"','--output','json'])
    ip = ipaddress.ip_address(address)
    if not ip.is_global or ip.is_multicast: raise ValueError('Invalid VM address')
    result = subprocess.run(['ssh','-F','/dev/null','-T','-i',str(key),
        '-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','BatchMode=yes',
        '-o','ConnectTimeout=20','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2',
        'opc@'+address,'python3 -I -B -'], input=program, capture_output=True, text=True, timeout=90)
    if result.returncode: raise ValueError('SSH probe failed; existing host trust/key required')
    if len(result.stdout)>32768: raise ValueError('Unexpected probe output')
    report = json.loads(result.stdout)
    if not isinstance(report,dict) or report.get('generation_requested') is not False or report.get('production_changed') is not False:
        raise ValueError('Unverified probe result')
    print(json.dumps(report,indent=2,sort_keys=True))


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, subprocess.SubprocessError):
        sys.exit('STOP: probe not completed. No production repair is claimed; no automatic retry.')
