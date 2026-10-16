"""One durable, exact-envelope dispatch claim; never emits credentials or image bytes."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runpod_worker'))
from contracts import validate_job,fingerprint
from storage import S3Store

if __name__=='__main__':
    try:
        job=validate_job(json.loads(sys.stdin.read(262145)))
        cfg=json.loads(Path('ops/RUNPOD_OWNER_MODEL_JOBS_20261016.json').read_text())
        assert any(job['jobId']==item['jobId'] and job['scope']==item['scope'] for item in cfg['jobs'])
        prefix=f"jobs/{job['scope']}/{job['jobId']}/"
        assert S3Store.from_env().create_json(prefix+'operator-dispatch-claim.json',{
            'fingerprint':fingerprint(job),'job':job}), 'DISPATCH_ALREADY_CLAIMED_NO_RETRY'
        print('DISPATCH_CLAIMED')
    except Exception:
        print('DISPATCH_REFUSED_RECONCILE',file=sys.stderr);sys.exit(1)
