"""Validate the ONE cancelled session-start attempt before manual recovery.
No generic retry permission. Unknown, successful, uploaded or billable jobs fail
closed. This command does not contact any service or modify the prior artifact.
"""
import argparse,hashlib,json,zipfile
from pathlib import Path
from core import SOURCE_SHA,validate_job
PREVIOUS_RUN=38735532844
PREVIOUS_ARTIFACT=11974132372
PREVIOUS_ARCHIVE_SHA='5c2c10aabc76f4267cf4c9dfe585a0c62e1146fdec247151f92cba26e02ad920'

def validate_previous(receipt):
    if receipt.get('revision')!='trellis2-official-free-research-v1' or receipt.get('sourceSha256')!=SOURCE_SHA:
        raise ValueError('UNRELATED_PREVIOUS_ATTEMPT')
    if receipt.get('status')!='BLOCKED_NO_RETRY' or receipt.get('reason')!='TimeoutError':
        raise ValueError('PREVIOUS_STATUS_NOT_SESSION_TIMEOUT')
    for name in ('generationRequestsAttempted','newOpenAIRequests','paidVendorRequests'):
        if type(receipt.get(name)) is not int or receipt[name]!=0:
            raise ValueError('PREVIOUS_SUBMISSION_NOT_PROVEN_ZERO')
    if receipt.get('glb') is not None or receipt.get('imageUploadedToOfficialSpace') not in (None,False):
        raise ValueError('PREVIOUS_IMAGE_OR_GEOMETRY_ALREADY_SUBMITTED')
    validate_job(receipt['job'])
    return {'previousRunId':PREVIOUS_RUN,'previousArtifactId':PREVIOUS_ARTIFACT,
      'previousGenerationSubmissions':0,'originalAstraJobUntouched':True,
      'decision':'ELIGIBLE_FOR_ONE_EXPLICIT_MANUAL_SESSION_RECOVERY_NOT_AUTO_RETRY'}

def recover(archive,marker,out):
    if archive.stat().st_size>2*1024*1024 or hashlib.sha256(archive.read_bytes()).hexdigest()!=PREVIOUS_ARCHIVE_SHA:
        raise ValueError('PREVIOUS_ARCHIVE_INTEGRITY_FAILURE')
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if 'attempt.json' not in names or any(n.endswith('.glb') for n in names):raise ValueError('PREVIOUS_ARTIFACT_NOT_A_SESSION_ONLY_FAILURE')
        if z.getinfo('attempt.json').file_size>128000:raise ValueError('PREVIOUS_RECEIPT_TOO_LARGE')
        prior=json.loads(z.read('attempt.json'))
    evidence=validate_previous(prior)
    activation=json.loads(marker.read_text())
    keys={'revision','previous_run_id','previous_artifact_id','previous_archive_sha256','contract_test_run_id','job','max_generation_submissions','paid_gpu_allowed'}
    if set(activation)!=keys or activation['revision']!='manual-unsubmitted-session-recovery-v1':raise ValueError('INVALID_RECOVERY_ACTIVATION')
    if activation['previous_run_id']!=PREVIOUS_RUN or activation['previous_artifact_id']!=PREVIOUS_ARTIFACT or activation['previous_archive_sha256']!=PREVIOUS_ARCHIVE_SHA:
        raise ValueError('WRONG_PREVIOUS_ATTEMPT')
    if activation['max_generation_submissions']!=1 or activation['paid_gpu_allowed'] is not False:raise ValueError('SCOPE_EXCEEDS_ONE_FREE_ATTEMPT')
    job=validate_job(activation['job'])
    if job!=prior['job']:raise ValueError('RECOVERY_MUST_KEEP_ORIGINAL_REFERENCE_AND_SETTINGS')
    out.mkdir(parents=True,exist_ok=False)
    (out/'job.json').write_text(json.dumps(job,indent=2)+'\n')
    (out/'reconciliation.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--marker',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();recover(a.archive,a.marker,a.out)
