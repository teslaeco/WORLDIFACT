"""Read-only forensics for an unconfirmed completion installation. Default PLAN ONLY.
No installation, restart, upload, generation or raw logs. Uses existing strict SSH.
"""
import argparse, ipaddress, json, os, re, subprocess, sys
from pathlib import Path
class LaunchError(RuntimeError): pass

def lookup(args):
    try:
        answer = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
    except Exception:
        raise LaunchError('OCI lookup unavailable. Use the original Cloud Shell; no worker change.') from None
    if answer.returncode or len(answer.stdout) > 65536:
        raise LaunchError('OCI lookup failed; no worker change.')
    try:
        values = json.loads(answer.stdout)
    except ValueError:
        raise LaunchError('Invalid OCI lookup response; no worker change.') from None
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], str):
        raise LaunchError('Expected exactly one existing VM/address; no worker change.')
    return values[0]


def connection(home=None):
    home = Path.home() if home is None else Path(home)
    key = home / 'ssh-key-2026-09-06.key'
    if any(p.is_symlink() for p in (key, *key.parents)) or not key.is_file() or not os.access(key, os.R_OK):
        raise LaunchError('Original Cloud Shell SSH key is unavailable. Do not share or replace it.')
    oci = ['oci', '--region', 'eu-amsterdam-1']
    instance = lookup(oci + ['search', 'resource', 'structured-search', '--query-text',
        "query instance resources where displayName = 'froge-blender' && lifeCycleState = 'RUNNING'",
        '--query', 'data.items[].identifier', '--output', 'json'])
    if not re.fullmatch(r'ocid1\.instance\.[A-Za-z0-9._-]+', instance):
        raise LaunchError('Invalid instance identifier; no worker change.')
    address = lookup(oci + ['compute', 'instance', 'list-vnics', '--instance-id', instance, '--all',
        '--query', 'data[?"is-primary" == `true`]."public-ip"', '--output', 'json'])
    try:
        public_ip = ipaddress.ip_address(address)
        if not public_ip.is_global or public_ip.is_multicast or '%' in address:
            raise ValueError()
    except ValueError:
        raise LaunchError('Invalid public VM address; no worker change.') from None
    return ['ssh', '-F', '/dev/null', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=3', 'opc@' + address, 'PYTHONDONTWRITEBYTECODE=1 python3 -B -']


REMOTE = "PACKAGE = {'install_completion.py': '8c8f53138bb7a8d711a48b2c74c3bbfe2356e69d', 'completion_policy.py': '7f318c7b61f7bf02416b149023dcd4734f2ce3fd', 'source_patch.py': '627f1803d03cda34df29f16507147b3ba8182e52', 'install_request_timeout900.py': 'e9555d728271704578f19708da87528f31ba67d8', 'install_cache_accounting.py': '270b8b080f33c595b5c487dec53d0ef147eaf2b5', 'install.py': '099e77e4e9bb89145d80603e8cfe0bf0dad1069d', 'install_tuning.py': '933f6a1597ebc5525c791495402fefcf6f260ed9', 'astra_spend.py': 'c94fb0266ff0337294e4d9f348c93e5830d287f3', 'astra_spend_v2.py': '410a58d3210b18810a1a5134cf847bc2e146504f', 'install_v33.py': '1f5437a437cd6909967e7a73e824e860c366f370', 'installed_v33.py': '00d99c4d89beae146aaece0d9940ddd55122e4ac', 'apply.py': '825f6877710169ae26f1a39ce3933232a1b3a574', 'completion.py': '7b026ef54dbe2719195d05349ca3927de039e287', 'fast_preview.py': 'b350089e795e18d4b2e105cbd18a0a8f976ffa5c'}\nimport hashlib, importlib.util, json, os, pathlib, stat, subprocess, sys, traceback\nsys.dont_write_bytecode=True\nhome=pathlib.Path.home(); source=home/'froge-connector'; parent=home/'.local/state/worldifact-astra-guard'\ndef read(path, limit=1048576):\n    if any(p.is_symlink() for p in (path,*path.parents)): raise ValueError('unsafe')\n    fd=os.open(str(path),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)\n    with os.fdopen(fd,'rb') as f:\n        info=os.fstat(f.fileno())\n        if not stat.S_ISREG(info.st_mode) or not 0<info.st_size<=limit: raise ValueError('size')\n        return f.read(limit+1)\ndef blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\\0'+b).hexdigest()\nreport={'diagnostic':'WORLDIFACT_INSTALL_FORENSICS_V1','read_only':True,'paid_requests':0,'source':{},'receipts':{},'backups':[]}\nfor name in ('server.py','codex_runner.py','blender_mcp.py','astra_spend_v2.py','completion_policy.py','fast_preview.py','fast_spend.py'):\n    try:\n        raw=read(source/name);report['source'][name]={'sha256':hashlib.sha256(raw).hexdigest(),'blob':blob(raw),'bytes':len(raw)}\n    except FileNotFoundError:report['source'][name]={'status':'MISSING'}\n    except Exception:report['source'][name]={'status':'UNAVAILABLE'}\nfor name in ('.worldifact-model-completion.json','.worldifact-astra-guard.json','tools/codex/verified.json'):\n    try:\n        raw=read(source/name,16384);v=json.loads(raw);report['receipts'][name]={'present':True,'sha256':hashlib.sha256(raw).hexdigest()}\n        if name.endswith('verified.json'):report['receipts'][name]['sourcesMatch']=v.get('sources')=={n:report['source'].get(n,{}).get('sha256') for n in ('codex_runner.py','blender_mcp.py')}\n        elif name=='.worldifact-model-completion.json':report['receipts'][name]['sourcesMatch']=v.get('sha256')=={n:report['source'].get(n,{}).get('sha256') for n in ('server.py','codex_runner.py','blender_mcp.py','astra_spend_v2.py','completion_policy.py')}\n    except FileNotFoundError:report['receipts'][name]={'present':False}\n    except Exception:report['receipts'][name]={'status':'UNAVAILABLE'}\nfor service in ('froge-worker.service','froge-tunnel.service'):\n    try:\n        r=subprocess.run(['systemctl','--user','show',service,'--property=ActiveState','--value'],capture_output=True,text=True,timeout=10)\n        report[service]=r.stdout.strip() if r.returncode==0 and r.stdout.strip() in ('active','inactive','failed','activating','deactivating') else 'UNKNOWN'\n    except Exception:report[service]='UNKNOWN'\nif parent.is_dir() and not parent.is_symlink():\n    folders=sorted((p for p in parent.glob('completion-*') if p.is_dir() and not p.is_symlink()),key=lambda p:p.stat().st_mtime,reverse=True)[:3]\n    for folder in folders:\n        entry={'age_seconds':max(0,int(__import__('time').time()-folder.stat().st_mtime))}\n        try:\n            phase=json.loads(read(folder/'INSTALL_STATUS.json',16384)).get('phase');entry['phase']=phase if phase in ('STAGED_COMPLETION_NOT_INSTALLED','WORLDIFACT_MODEL_COMPLETION_VERIFIED','ROLLED_BACK_MODEL_COMPLETION','RECOVERY_REQUIRED_MODEL_COMPLETION') else 'UNKNOWN'\n        except Exception:entry['phase']='NO_SUMMARY'\n        try:\n            raw=read(folder/'offline-verification.log',4000000);entry['offlineLogBytes']=len(raw);tail=raw[-100000:].decode(errors='replace');entry['offlineSignals']=[x for x in ('Traceback','TypeError','ValueError','KeyError','AttributeError','AssertionError','PermissionError','SyntaxError','ASTRA_GUARD_OFFLINE_ROUNDTRIP_OK','minimum_output','unexpected keyword','WORLDIFACT') if x in tail]\n        except FileNotFoundError:entry['offlineLogBytes']=0\n        except Exception:entry['offlineLogStatus']='UNAVAILABLE'\n        report['backups'].append(entry)\n    packages=sorted((p for p in parent.glob('model-completion-package-*') if p.is_dir() and not p.is_symlink()),key=lambda p:p.stat().st_mtime,reverse=True)[:8]\nelse:packages=[]\npackage=None\nfor candidate in packages:\n    try:\n        if all(blob(read(candidate/name,262144))==sha for name,sha in PACKAGE.items()):package=candidate;break\n    except Exception:pass\nreport['reviewedPackageFound']=package is not None\nif package:\n    class ReadOnlyViolation(RuntimeError):pass\n    def audit(event,args):\n        if event=='open':\n            mode=args[1];flags=args[2]\n            if (isinstance(mode,str) and any(c in mode for c in 'wax+')) or (isinstance(flags,int) and flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND)):raise ReadOnlyViolation()\n        if event in ('os.mkdir','os.remove','os.rename','os.rmdir','os.chmod','os.chown','os.truncate','os.symlink','os.link','socket.connect','os.system','os.posix_spawn'):raise ReadOnlyViolation()\n        if event=='sqlite3.connect':raise ReadOnlyViolation('SQLITE_CONNECT_NOT_PERFORMED')\n        if event=='subprocess.Popen':\n            cmd=args[1]\n            if not isinstance(cmd,(list,tuple)) or len(cmd)!=6 or cmd[:3]!=['systemctl','--user','show'] or cmd[3] not in ('froge-worker.service','froge-tunnel.service') or cmd[4] not in ('--property=ActiveState','--property=WorkingDirectory') or cmd[5]!='--value':raise ReadOnlyViolation()\n    sys.addaudithook(audit);sys.path.insert(0,str(package))\n    try:\n        import install_completion\n        install_completion.Operations(source,home).preflight()\n        report['preflight']={'status':'PASSED_READ_ONLY'}\n    except BaseException as error:\n        known=('SQLITE_CONNECT_NOT_PERFORMED','Unreviewed installed completion ancestor; no service stopped.','Reviewed completion patch context differs.','Unexpected reviewed ancestor variant.','Existing guard/runtime verification is invalid.','Existing original guard differs.','Existing FAST guard differs.','Offline verifier differs.','Unexpected service directory.','Unexpected service settings.','A model job is active. Nothing is cancelled automatically.')\n        report['preflight']={'status':'READ_ONLY_BOUNDARY' if isinstance(error,ReadOnlyViolation) else 'FAILED_READ_ONLY','error_type':type(error).__name__ if type(error).__name__ in ('ValueError','KeyError','TypeError','AttributeError','InstallError','ReadOnlyViolation','FileNotFoundError','PermissionError','BlockingIOError') else 'OTHER','known_reason':str(error) if str(error) in known else 'UNCLASSIFIED','frames':[{'file':pathlib.Path(f.filename).name if pathlib.Path(f.filename).name in PACKAGE else 'stdlib','line':f.lineno,'function':f.name if f.name in ('preflight','changes','once','patch_runner','patch_mcp','patch_spend','read_regular','safe_path','receipt_matches','verified_health') else 'other'} for f in traceback.extract_tb(error.__traceback__)[-5:]]}\nprint(json.dumps(report,indent=2))\n"

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--inspect',action='store_true');args=parser.parse_args(argv)
    if not args.inspect: print('PLAN ONLY. No SSH, file reads, restart or generation.');return
    result=subprocess.run(connection(),input=REMOTE,text=True)
    if result.returncode: raise LaunchError('Read-only forensics were not confirmed. Do not rerun installation.')
if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt): print('STOP: read-only forensic result unavailable. No install or paid retry.',file=sys.stderr);sys.exit(1)
