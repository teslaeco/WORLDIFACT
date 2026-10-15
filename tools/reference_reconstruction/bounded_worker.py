"""Bounded subprocess lifecycle; no networking or automatic retries.
Only the subprocess group created here is signalled. Durable job receipts are
never overwritten by the supervisor, and a timeout is not a remote cancellation
confirmation. Unit tests use harmless child fixtures, never GPU tasks.
"""
from __future__ import annotations
import json,os,signal,subprocess,time
from pathlib import Path
SUCCESS='ORIGINAL_GLB_RECEIVED_REQUIRES_INDEPENDENT_REVIEW'
TERMINAL={SUCCESS,'BLOCKED_NO_RETRY'}

def read_receipt(path):
    try:
        if path.stat().st_size>256000:return None
        value=json.loads(path.read_text())
        return value if isinstance(value,dict) else None
    except (OSError,ValueError):return None

def stop_owned_process(process,grace):
    if process.poll() is not None:return False
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=3)
    return True

def supervise(command,receipt:Path,supervisor_report:Path,total_seconds=570,terminal_grace=2,kill_grace=1):
    if not 0<total_seconds<=600 or not 0<=terminal_grace<=10 or not 0<kill_grace<=3:
        raise ValueError('INVALID_SUPERVISION_LIMIT')
    if receipt.exists() or supervisor_report.exists():raise FileExistsError('EXISTING_ATTEMPT_MUST_NOT_BE_OVERWRITTEN_OR_RETRIED')
    supervisor_report.parent.mkdir(parents=True,exist_ok=True)
    started=time.monotonic();terminal_at=None;last_log=0;forced=False;reason='NORMAL_EXIT'
    process=subprocess.Popen(command,start_new_session=True,stdin=subprocess.DEVNULL)
    try:
        while process.poll() is None:
            now=time.monotonic();state=read_receipt(receipt)
            if state and state.get('status') in TERMINAL:
                terminal_at=terminal_at or now
                if now-terminal_at>=terminal_grace:
                    forced=stop_owned_process(process,kill_grace);reason='TERMINAL_RECEIPT_THREAD_CLEANUP';break
            if now-started>=total_seconds:
                forced=stop_owned_process(process,kill_grace);reason='HARD_WALL_CLOCK_LIMIT';break
            if now-last_log>=15:
                print(json.dumps({'supervisor':'RUNNING','elapsedSeconds':round(now-started,1),
                  'phase':state.get('phase') if state else 'WORKER_INITIALIZING'}),flush=True)
                last_log=now
            time.sleep(.1)
    except BaseException:
        forced=stop_owned_process(process,kill_grace);reason='SUPERVISOR_INTERRUPTED'
        raise
    finally:
        state=read_receipt(receipt)
        record={'revision':'reconstruction-process-supervisor-v1','reason':reason,
          'childExitCode':process.poll(),'processTerminatedBySupervisor':forced,
          'elapsedSeconds':round(time.monotonic()-started,3),
          'terminalReceiptObserved':bool(state and state.get('status') in TERMINAL),
          'jobStatus':state.get('status') if state else 'NO_RECEIPT',
          'generationRequestsAttempted':state.get('generationRequestsAttempted') if state else None,
          'remoteCompletionConfirmedBySupervisor':False,'automaticRetry':False}
        with supervisor_report.open('x',encoding='utf-8') as f:
            json.dump(record,f,indent=2);f.write('\n')
        print('RECONSTRUCTION_SUPERVISOR_END',json.dumps(record),flush=True)
    return 0 if state and state.get('status')==SUCCESS else 2
