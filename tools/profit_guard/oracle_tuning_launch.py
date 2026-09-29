"""Launch only the reviewed output-policy updater; no paid generation.

Reuses the original Oracle lookup and strict SSH implementation. It does not
read, print or transfer credentials. Without the explicit restart flag it is
plan-only. The receiver validates the exact public package names and bytes.
"""
import base64
import json
from pathlib import Path
import sys
import oracle_launch as launch

ORIGINAL_NAMES = "names = {'install.py','astra_spend.py','install_v33.py','installed_v33.py','apply.py','completion.py','fast_preview.py'}"
NEW_FILES = {'install_tuning.py','astra_spend_v2.py'}


def package():
    # Original package contains reviewed installer dependencies, not VM secrets.
    payload = json.loads(base64.b64decode(launch.original_package()))
    for name in sorted(NEW_FILES):
        path = Path(__file__).parent/name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 262144:
            raise launch.CheckError('Invalid public tuning package: '+name)
        payload[name] = base64.b64encode(path.read_bytes()).decode()
    return base64.b64encode(json.dumps(payload,sort_keys=True).encode()).decode()


def main():
    original_remote, original_package = launch.REMOTE, launch.package
    if original_remote.count(ORIGINAL_NAMES) != 1 or original_remote.count("str(folder/'install.py')") != 1:
        raise launch.CheckError('Reviewed launcher source changed. No connection made.')
    names = "names = {'install.py','astra_spend.py','install_v33.py','installed_v33.py','apply.py','completion.py','fast_preview.py','install_tuning.py','astra_spend_v2.py'}"
    launch.original_package = original_package
    launch.REMOTE = original_remote.replace(ORIGINAL_NAMES,names).replace("str(folder/'install.py')","str(folder/'install_tuning.py')")
    launch.package = package
    try:
        launch.main()
    finally:
        launch.REMOTE, launch.package = original_remote, original_package
        del launch.original_package


if __name__ == '__main__':
    try: main()
    except launch.CheckError as error:
        print('STOP: '+str(error),file=sys.stderr);sys.exit(1)
    except Exception:
        print('STOP: Oracle output-policy update not confirmed. Preserve backups, never share secrets.',file=sys.stderr);sys.exit(1)
