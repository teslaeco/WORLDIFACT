"""New-release admission to the existing immutable pidfd maintenance machinery.

The historical fence file is unchanged. Only the finite source authority at the
entry point is extended for this reviewed release. Every kernel, service, tunnel,
resource, journal, cancellation-consent and guardian check is retained.
"""
from contextlib import closing, contextmanager
import hashlib
import os
from pathlib import Path
import signal
import sqlite3
import sys

folder=Path(__file__).resolve().parent.parent/'model_construction'
if folder.is_dir(): sys.path.append(str(folder))
import construction_fence as old
import activation_manifest as manifest

ORIGINAL_FENCE_SHA256='9a433b1618e00219729bccd59393d599012644756e58111662dd0d113748df51'


def pending_admissions(source):
    path=Path(source)/'state/admissions.sqlite'
    if not os.path.lexists(path): return
    old._regular(path,128*1024**2)
    if path.stat().st_mode & 0o077:
        old.refuse('unsafe_admission_store','Admission journal must remain private.')
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=.25)) as db:
        db.execute('PRAGMA query_only=ON')
        rows=db.execute('SELECT id,phase FROM admissions LIMIT 10001').fetchall()
    if len(rows)>10000:
        old.refuse('admission_history_limit','Admission history needs explicit review.')
    with closing(sqlite3.connect((Path(source)/'state/jobs.sqlite').as_uri()+'?mode=ro',uri=True,timeout=.25)) as jobs:
        jobs.execute('PRAGMA query_only=ON')
        for job_id,phase in rows:
            if phase=='blocked':continue
            prior=jobs.execute('SELECT state FROM jobs WHERE id=?',(job_id,)).fetchone()
            if phase!='queued' or prior is None or prior[0] not in ('succeeded','failed','cancelled'):
                old.refuse('pending_admission','An unresolved durable admission prevents maintenance.')


@contextmanager
def quiesce(operations):
    if hashlib.sha256(Path(old.__file__).read_bytes()).hexdigest()!=ORIGINAL_FENCE_SHA256:
        old.refuse('historical_fence_changed','The original reviewed fence is required.')
    source=Path(operations.source)
    guard=pidfd=lease=None
    stop_attempted=False
    try:
        if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
            old.refuse('pidfd_unavailable','Exact-process pidfd signals are required.')
        if source!=Path(operations.home)/'froge-connector' or not source.is_absolute():
            old.refuse('wrong_source_path','Unexpected worker source path.')
        expected=dict(operations.expected_source_sha256)
        if not manifest.reviewed_manifest(expected):
            old.refuse('incomplete_reviewed_manifest','Only exact before/after release sources are allowed.')
        old._source(source,expected_sources=expected)
        pending_admissions(source)
        allow=getattr(operations,'allow_cancelled_cleanup',False)
        with old.database_gate(source,allow_cancelled_cleanup=allow,
                               expected_cancelled=getattr(operations,'cancelled_job_ids',None)) as identities:
            operations.cancelled_job_ids=identities
        worker,tunnel=old._unit(operations,old.WORKER),old._unit(operations,old.TUNNEL)
        old._unit_policy(worker,source)
        old._unit_policy(tunnel,source,worker=False)
        files={**old._unit_files(worker),**old._unit_files(tunnel)}
        pid=int(worker['MainPID'])
        ticks,started=old._running_identity(source,pid,expected)
        pidfd=os.pidfd_open(pid)
        old._same_worker(operations,worker,pid,ticks,pidfd)
        journal=old._journal_snapshot(pid,worker)
        config={'source':str(source),'pid':pid,'ticks':ticks,'worker':worker,'tunnel':tunnel,
                'files':files,'expected_sources':expected,'allow_cancelled_cleanup':allow,
                'cancelled_job_ids':list(identities),'journal':journal}
        guard=old._Guard(pidfd,config)
        guard.freeze(pid,ticks)
        old._same_worker(operations,worker,pid,ticks,pidfd)
        old._same_files(files)
        old._source(source,started,expected)
        old._resources(pid,operations,worker,journal)
        pending_admissions(source)
        with old.database_gate(source,frozen=True,allow_cancelled_cleanup=allow,expected_cancelled=identities):
            old._same_worker(operations,worker,pid,ticks,pidfd)
            stop_attempted=True
            guard.stop()
            stopped=old._unit(operations,old.WORKER)
            if stopped['ActiveState']!='inactive' or stopped['MainPID']!='0' or not old._dead(pidfd):
                raise old.RecoveryRequired('stop_unproven','Exact worker stop could not be verified.')
        guard.close();guard=None
        lease=old.Lease(operations,tunnel,files,worker)
    except BaseException as error:
        if guard is not None:
            try:guard.close()
            except BaseException as recovery:
                raise old.RecoveryRequired('resume_unproven','Exact worker recovery needs review.') from recovery
        if stop_attempted:
            raise old.RecoveryRequired(getattr(error,'code','stop_failed'),'Worker exit is uncertain; do not write or restart automatically.') from error
        if isinstance(error,old.FenceError):raise
        raise old.FenceRefused('preflight_unproven','Maintenance evidence is unavailable; no lease admitted.') from error
    finally:
        if pidfd is not None:os.close(pidfd)
    try:yield lease
    finally:
        if not lease.healthy and not lease.activation_committed:
            raise old.RecoveryRequired('health_not_confirmed','Worker health is unconfirmed; do not blindly roll back.')
