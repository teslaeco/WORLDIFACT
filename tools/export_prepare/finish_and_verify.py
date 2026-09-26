"""Install the reviewed Oracle export patch and run one explicit paid/live E2E export test.

Run from OCI Cloud Shell in a clean WORLDIFACT checkout:
  python3 -B tools/export_prepare/finish_and_verify.py --approve-one-live-test

The maintenance itself requests no AI. The final E2E step submits exactly one
small Studio model to verify GLB + texture ZIP + FBX + BLEND end to end.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
sys.path.insert(0,str(HERE))
import oracle_direct_export_fix as launcher

SUCCESS={"INSTALLED_AND_LOCALLY_VERIFIED","ALREADY_INSTALLED_AND_VERIFIED"}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approve-one-live-test",action="store_true")
    args=parser.parse_args()
    if not args.approve_one_live_test:
        print(json.dumps({"phase":"PLAN_ONLY","oracleMaintenance":"NO_AI","liveModelTest":False},indent=2))
        return
    key=Path.home()/"ssh-key-2026-09-06.key"
    if not key.is_file() or not os.access(key,os.R_OK):
        raise RuntimeError("Missing existing OCI Cloud Shell SSH key: ~/ssh-key-2026-09-06.key")
    package=launcher.package()
    value=launcher.call_remote(key,"apply",package,timeout=70)
    deadline=time.monotonic()+420
    while value.get("phase")=="INSTALLATION_RUNNING" and time.monotonic()<deadline:
        print("Oracle export maintenance still running safely on VM...",flush=True)
        time.sleep(8)
        value=launcher.call_remote(key,"status",{},timeout=50)
    print(json.dumps(value,indent=2))
    if value.get("phase") not in SUCCESS:
        raise RuntimeError("Oracle export maintenance did not finish successfully: "+str(value.get("phase")))
    if value.get("posthocExportRevision")!=2 or value.get("legacyGlbExportRecoveryRevision")!=1:
        raise RuntimeError("Oracle did not report posthocExportRevision=2 and legacyGlbExportRecoveryRevision=1")
    if value.get("workerService")!="active" or value.get("tunnelService")!="active":
        raise RuntimeError("Oracle worker/tunnel not active after maintenance")
    print("Oracle export patch verified. Starting exactly one live Studio export E2E test.",flush=True)
    completed=subprocess.run(["node",str(ROOT/"scripts/live-export-e2e.mjs")],cwd=ROOT)
    if completed.returncode:
        raise RuntimeError("Live export E2E test failed; do not retry generation automatically.")
    print("WORLDIFACT_ORACLE_EXPORT_FIX_AND_E2E_COMPLETE")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("STOP: "+str(exc)[:600],file=sys.stderr)
        raise SystemExit(1)
