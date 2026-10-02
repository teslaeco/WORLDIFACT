"""Offline reproduction of the installed reviewed ancestor from pinned sources."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/fast_preview'))
import installed_v33
import apply
import completion
import install_spend
sys.path.insert(0, str(ROOT/'tools/profit_guard'))
import install
import install_tuning
import install_cache_accounting
import install_request_timeout900


def installed_sources(source):
    source = Path(source)
    raw = {name: (source/name).read_bytes() for name in installed_v33.INSTALLED}
    raw['server.py'] = installed_v33.installed_server_from_reviewed(raw['server.py'])
    for name, expected in installed_v33.INSTALLED.items():
        if installed_v33.blob_sha(raw[name]) != expected: raise ValueError('Unreviewed pinned fixture: '+name)
    transforms = {'server.py': apply.patch_server, 'codex_runner.py': apply.patch_codex,
        'blender_mcp.py': apply.patch_mcp, 'runtime/run.py': apply.patch_renderer}
    patched = {name: completion.finish_patch(name, fn(raw[name].decode())).encode() for name, fn in transforms.items()}
    patched['fast_preview.py'] = (ROOT/'tools/fast_preview/fast_preview.py').read_bytes()
    selected = lambda: {name: patched[name] for name in install.EXPECTED}
    patched.update(install_spend.changes(selected(), (ROOT/'tools/fast_preview/fast_spend.py').read_bytes()))
    patched.update(install.changes(selected(), (ROOT/'tools/profit_guard/astra_spend.py').read_bytes()))
    patched.update(install_tuning.changes(selected(), (ROOT/'tools/profit_guard/astra_spend_v2.py').read_bytes()))
    # Cache accounting updates only the policy already supplied from current tree.
    install_cache_accounting.reviewed_installed_variant(selected())
    patched['codex_runner.py'] = install_request_timeout900.patch_runner(patched['codex_runner.py'])[0]
    return patched
