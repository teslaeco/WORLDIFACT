"""Run rollback-safe Oracle export maintenance, then one resumable E2E job."""
import argparse,json,os,sys,time
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import oracle_direct_export_fix as launcher
SUCCESS={"INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--approve-one-live-test",action="store_true");args=p.parse_args()
    if not args.approve_one_live_test:
        print(json.dumps({"phase":"PLAN_ONLY","oracleMaintenance":"NO_AI","liveModelTest":False},indent=2));return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise RuntimeError("Missing existing OCI Cloud Shell SSH key.")
    package=launcher.package()
    print("Checking Oracle queue. Existing customer/test jobs are never cancelled automatically.",flush=True)
    deadline=time.monotonic()+1500
    last=None
    while True:
        queue=launcher.call_remote(key,"queue-status",package,timeout=70)
        last=queue
        if queue.get("phase")=="IDLE":
            print("Oracle queue is IDLE. Continuing with export maintenance.",flush=True)
            break
        jobs=queue.get("activeJobs",[])
        summary=", ".join(str(j.get("id","?"))[:8]+":"+str(j.get("state","?"))+" age="+str(j.get("ageSeconds","?"))+"s" for j in jobs if isinstance(j,dict))
        print("Oracle queue ACTIVE: "+(summary or "unknown active job")+" — waiting 15 s",flush=True)
        if time.monotonic()>=deadline:
            raise RuntimeError("Oracle still has an active model job after 25 minutes. Nothing was cancelled or changed. "+summary)
        time.sleep(15)
    maintenance=launcher.call_remote(key,"apply",package,timeout=380)
    print(json.dumps(maintenance,indent=2))
    if maintenance.get("phase") not in SUCCESS or maintenance.get("posthocExportRevision")!=2 or maintenance.get("legacyGlbExportRecoveryRevision")!=1:
        raise RuntimeError("Oracle export maintenance failed safely: "+str(maintenance.get("phase"))+" "+str(maintenance.get("error",""))[:700])
    if maintenance.get("workerService")!="active" or maintenance.get("tunnelService")!="active":raise RuntimeError("Worker/tunnel not active after maintenance.")
    print("Oracle export capability verified. Starting/resuming the SAME one-job E2E test.",flush=True)
    try:e2e=launcher.call_remote(key,"e2e",package,timeout=1380)
    except launcher.LaunchError as exc:
        print("E2E transport ended before the bounded wait completed. Re-run this SAME command; the persisted job id will be resumed and no second model is created.",file=sys.stderr)
        raise RuntimeError(str(exc)) from None
    print(json.dumps(e2e,indent=2))
    if e2e.get("phase")!="E2E_PASS":
        raise RuntimeError("One-job E2E failed. No second generation will be started automatically: "+str(e2e.get("error","unknown"))[:700])
    formats={x.get("format") for x in e2e.get("artifacts",[]) if isinstance(x,dict)}
    if formats!={"glb","pbr","fbx","blend"}:raise RuntimeError("E2E did not verify all four artifacts.")
    print("WORLDIFACT_EXPORT_E2E_PASS")
    print("WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE")
if __name__=="__main__":
    try:main()
    except Exception as exc:print("STOP: "+str(exc)[:1000],file=sys.stderr);raise SystemExit(1)