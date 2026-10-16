"""File-based startup for Runpod; no source code passed in container arguments."""
import os
import runpy

if __name__ == '__main__':
    qualifying = bool(os.environ.get('QUALIFICATION_ID'))
    print('WORLDIFACT_STARTUP mode=' + ('qualification' if qualifying else 'worker'), flush=True)
    runpy.run_path('/opt/worldifact/qualification/worker.py' if qualifying
                   else '/opt/worldifact/worker/handler.py', run_name='__main__')
