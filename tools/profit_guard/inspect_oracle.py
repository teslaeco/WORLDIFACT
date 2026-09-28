"""Read-only diagnosis after the Astra installer reports an unknown runner.

Run in the original OCI Cloud Shell. No VM uploads, source execution, service
restart, configuration reads, model requests, or changes to allowed hashes.
"""
import ipaddress
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/fast_preview'))
from oracle_preflight import CheckError, invoke, one

FILES = ('codex_runner.py', 'fast_preview.py', 'server.py', 'blender_mcp.py',
         'fast_spend.py', 'astra_spend.py', 'runtime_check.py', 'codex_smoke.py', 'install_codex.py')
EXPECTED_RUNNER = 'd953522872c2ff0c811b03962c790e63966f49e6b454d0b57ed60ca3c5b3afd0'
REMOTE = r'''
import ast, hashlib, json, os, stat, subprocess
from pathlib import Path
FILES = ('codex_runner.py','fast_preview.py','server.py','blender_mcp.py',
         'fast_spend.py','astra_spend.py','runtime_check.py','codex_smoke.py','install_codex.py')
EXPECTED = 'd953522872c2ff0c811b03962c790e63966f49e6b454d0b57ed60ca3c5b3afd0'
def read_source(path):
    if any(p.is_symlink() for p in (path,*path.parents)): raise ValueError('Unsafe path')
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 1048576: raise ValueError('Invalid source')
        value = stream.read(1048577)
        if len(value) > 1048576: raise ValueError('Invalid source')
        return value

def inspect(root):
    report = {'diagnostic':'WORLDIFACT_SOURCE_V1','read_only':True,'files':{},'runner_exact_match':False,
              'runner_lf_match':False,'runner_syntax_ok':False,'fast_guard_import':False,
              'astra_guard_import':False,'responses_url_literals':0,'worker':'UNKNOWN','tunnel':'UNKNOWN'}
    for name in FILES:
        try:
            raw = read_source(root/name)
            report['files'][name] = {'status':'OK','sha256':hashlib.sha256(raw).hexdigest(),
                'git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()}
            if name == 'codex_runner.py':
                report['runner_exact_match'] = hashlib.sha256(raw).hexdigest() == EXPECTED
                report['runner_lf_match'] = hashlib.sha256(raw.replace(b'\r\n',b'\n')).hexdigest() == EXPECTED
                try:
                    tree = ast.parse(raw)
                    report['runner_syntax_ok'] = True
                    nodes = list(ast.walk(tree))
                    imports = {alias.name for node in nodes if isinstance(node,ast.Import) for alias in node.names}
                    imports |= {node.module for node in nodes if isinstance(node,ast.ImportFrom)}
                    report['fast_guard_import'] = 'fast_spend' in imports
                    report['astra_guard_import'] = 'astra_spend' in imports
                    report['responses_url_literals'] = min(100, sum(isinstance(node,ast.Constant) and node.value == 'https://api.openai.com/v1/responses' for node in nodes))
                except Exception: pass
        except FileNotFoundError: report['files'][name] = {'status':'MISSING'}
        except Exception: report['files'][name] = {'status':'UNAVAILABLE'}
    for service, field in (('froge-worker.service','worker'),('froge-tunnel.service','tunnel')):
        try:
            result = subprocess.run(['systemctl','--user','show',service,'--property=ActiveState','--value'],
                stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=8)
            value = result.stdout.strip()
            if result.returncode == 0 and value in ('active','inactive','failed','activating','deactivating'): report[field] = value
        except Exception: pass
    return report

if __name__ == '__main__':
    print(json.dumps(inspect(Path.home()/'froge-connector'),sort_keys=True))
'''


def validate(value):
    flags = ('runner_exact_match','runner_lf_match','runner_syntax_ok','fast_guard_import','astra_guard_import')
    expected = {'diagnostic','read_only','files','responses_url_literals','worker','tunnel',*flags}
    if (not isinstance(value, dict) or set(value) != expected
            or value['diagnostic'] != 'WORLDIFACT_SOURCE_V1' or value['read_only'] is not True
            or any(type(value[k]) is not bool for k in flags)
            or type(value['responses_url_literals']) is not int or not 0 <= value['responses_url_literals'] <= 100):
        raise CheckError('Unexpected diagnostic response; no source or service was changed.')
    if any(value[k] not in ('UNKNOWN','active','inactive','failed','activating','deactivating') for k in ('worker','tunnel')):
        raise CheckError('Unexpected service status.')
    files = value['files']
    if not isinstance(files, dict) or set(files) != set(FILES): raise CheckError('Invalid source report.')
    for item in files.values():
        if not isinstance(item, dict): raise CheckError('Invalid source report.')
        if item.get('status') in ('MISSING','UNAVAILABLE') and set(item) == {'status'}: continue
        if (set(item) != {'status','sha256','git_blob'} or item['status'] != 'OK'
                or not isinstance(item['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', item['sha256'])
                or not isinstance(item['git_blob'], str) or not re.fullmatch('[0-9a-f]{40}', item['git_blob'])):
            raise CheckError('Invalid source fingerprint.')
    return value


def main():
    if len(sys.argv) != 1: raise CheckError('Read-only tool takes no installation or override flags.')
    key = Path.home()/'ssh-key-2026-09-06.key'
    if key.is_symlink() or not key.is_file() or not os.access(key, os.R_OK):
        raise CheckError('Use the original OCI Cloud Shell account with its existing SSH key. Do not share the key.')
    oci = ['oci','--region','eu-amsterdam-1']
    instance = one(invoke(oci + ['search','resource','structured-search','--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query','data.items[].identifier','--output','json']), 'running Froge VM')
    if not instance.startswith('ocid1.instance.') or any(c.isspace() for c in instance): raise CheckError('Unexpected instance identifier.')
    address = one(invoke(oci + ['compute','instance','list-vnics','--instance-id',instance,'--all',
        '--query','data[?"is-primary" == `true`]."public-ip"','--output','json']), 'primary public IP')
    if not ipaddress.ip_address(address).is_global: raise CheckError('Expected the existing public VM address.')
    print('READ ONLY: inspecting source fingerprints and service state. No install or AI request.',flush=True)
    raw = invoke(['ssh','-T','-i',str(key),'-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
        '-o','BatchMode=yes','-o','ConnectTimeout=20','opc@'+address,'PYTHONDONTWRITEBYTECODE=1 python3 -B -'],
        timeout=60, data=REMOTE)
    report = validate(json.loads(raw))
    print('WORLDIFACT_ORACLE_DIAGNOSTIC_BEGIN')
    print('Worker='+report['worker']+' | Tunnel='+report['tunnel'])
    for name in FILES:
        item = report['files'][name]
        print(name+' SHA256='+item['sha256'] if item['status']=='OK' else name+' '+item['status'])
    runner = report['files']['codex_runner.py']
    if runner['status']=='OK': print('Runner git_blob='+runner['git_blob'])
    print('Exact='+str(report['runner_exact_match'])+' | LF='+str(report['runner_lf_match'])+' | Syntax='+str(report['runner_syntax_ok']))
    print('FastGuardImport='+str(report['fast_guard_import'])+' | AstraGuardImport='+str(report['astra_guard_import']))
    print('Responses URL literals='+str(report['responses_url_literals']))
    print('WORLDIFACT_ORACLE_DIAGNOSTIC_END — no install, restart or paid generation')


if __name__ == '__main__':
    try: main()
    except CheckError as error:
        print('STOP: '+str(error),file=sys.stderr); sys.exit(1)
    except Exception:
        print('STOP: read-only diagnosis unavailable; no installation attempted. Do not share keys or config.',file=sys.stderr); sys.exit(1)
