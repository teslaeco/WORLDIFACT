"""Finish Oracle direct exports and prove one real job end to end.

The maintenance phase makes no AI/model request. After exact export capability
verification, the separately approved E2E phase submits exactly one small model
job on the Oracle worker and checks GLB, PBR ZIP, FBX and BLEND. Both phases run
as remote user-systemd units so a phone/browser disconnect does not kill them.
"""
import argparse,json,os
from pathlib import Path
import sys,time

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import oracle_direct_export_fix as launcher

SUCCESS={"INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"}

def wait(key,mode,status_mode,value,phase,seconds):
    deadline=time.monotonic()+seconds
    while value.get("phase")==phase and time.monotonic()<deadline:
        print(phase+" — remote task continues safely on Oracle...",flush=True)
        time.sleep(8)
        value=launcher.call_remote(key,status_mode,{},timeout=55)
    return value

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approve-one-live-test",action="store_true")
    args=parser.parse_args()
    if not args.approve_one_live_test:
        print(json.dumps({"phase":"PLAN_ONLY","oracleMaintenance":"NO_AI","liveModelTest":False},indent=2));return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):raise RuntimeError("Missing existing OCI Cloud Shell SSH key: ~/ssh-key-2026-09-06.key")
    package=launcher.package()
    value=launcher.call_remote(key,"apply",package,timeout=80)
    value=wait(key,"apply","status",value,"INSTALLATION_RUNNING",420)
    print(json.dumps(value,indent=2))
    if value.get("phase") not in SUCCESS:
        raise RuntimeError("Oracle export maintenance failed safely: "+str(value.get("phase"))+" "+str(value.get("error",""))[:400])
    if value.get("posthocExportRevision")!=2 or value.get("legacyGlbExportRecoveryRevision")!=1:
        raise RuntimeError("Oracle did not report posthocExportRevision=2 and legacyGlbExportRecoveryRevision=1")
    if value.get("workerService")!="active" or value.get("tunnelService")!="active":raise RuntimeError("Oracle worker/tunnel not active after maintenance")
    print("Oracle export v2 verified. Starting exactly ONE disconnect-safe live model/export test.",flush=True)
    e2e=launcher.call_remote(key,"e2e",package,timeout=80)
    e2e=wait(key,"e2e","e2e-status",e2e,"E2E_RUNNING",1200)
    print(json.dumps(e2e,indent=2))
    if e2e.get("phase")!="E2E_PASS":
        raise RuntimeError("One-job export E2E failed. No automatic generation retry was sent: "+str(e2e.get("error","unknown"))[:500])
    if e2e.get("automaticGenerationRetries")!=0 or e2e.get("generationRequested") is not True:
        raise RuntimeError("Unexpected E2E generation accounting.")
    formats={item.get("format") for item in e2e.get("artifacts",[]) if isinstance(item,dict)}
    if formats!={"glb","pbr","fbx","blend"}:raise RuntimeError("E2E did not verify all four artifacts.")
    print("WORLDIFACT_EXPORT_E2E_PASS")
    print("WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("STOP: "+str(exc)[:800],file=sys.stderr);raise SystemExit(1)
