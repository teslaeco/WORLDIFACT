"""Stage ONLY the FAST source changes for the owner's hash-identified v33.

No installation, source overwrite, service restart, network or AI call. Original
code is retained in the new staging directory. Runtime verification and release
approval are separate steps. Do not copy an entire newer worker over this one.
"""
import hashlib
import json
from pathlib import Path
import tempfile
from apply import patch_server, patch_codex, patch_mcp, patch_renderer
from completion import finish_patch

INSTALLED = {
    'server.py': '4e40ac5e30b1dadd3c2b97c18d746a630122ccf3',
    'codex_runner.py': '55a4442f411a7e2c6060cca298a056004d30d9d4',
    'blender_mcp.py': '1fe58476bd1366c8c8106dc76439db1974fa51a4',
    'runtime/run.py': '48e4e456084b5bbd7e6b399f4210992d41bfdfe7',
}


def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def installed_server_from_reviewed(data):
    """Reproduce the public installed blob for CI without private host access.

These are the complete THREE differences from reviewed v35, not a claim that
only its version changed. The final Git hash proves the exact source identity.
    """
    if blob_sha(data) != 'ac0ef28c11385709269a79f88b0d43ef517a15e7':
        raise ValueError('Unexpected reviewed server source.')
    text = data.decode('utf-8')
    replacements = (
        ('CONNECTOR_VERSION = 35\n', 'CONNECTOR_VERSION = 33\n'),
        ("            'referenceAcceptanceRevision':1, 'workerRelease':'v35-reference-acceptance',\n", ''),
        ("                # The raw agent verdict is provenance. The host decides whether\n"
         "                # the current exported artifact has complete review evidence.\n"
         "                accepted=model_status(folder, 'succeeded')['modelStatus']=='reviewed'",
         "                accepted=outcome.get('accepted') is True"),
    )
    for old, new in replacements:
        if text.count(old) != 1:
            raise ValueError('Reviewed-to-installed source context changed.')
        text = text.replace(old, new, 1)
    result = text.encode('utf-8')
    if blob_sha(result) != INSTALLED['server.py']:
        raise ValueError('The reconstructed server is not the exact public installed blob.')
    return result


def stage(source, destination):
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or destination.is_symlink():
        raise ValueError('Source and output must not be symlinks.')
    source, destination = source.resolve(), destination.resolve()
    if not source.is_dir() or destination.exists() or destination == source or source in destination.parents:
        raise ValueError('Use an existing worker source and a NEW separate staging directory.')
    original = {}
    for name, expected in INSTALLED.items():
        path = source / name
        if path.is_symlink() or path.parent.is_symlink() or not path.is_file() or path.stat().st_size > 1024 * 1024:
            raise ValueError('Missing or unsafe source: ' + name)
        raw = path.read_bytes()
        if blob_sha(raw) != expected:
            raise ValueError('Installed source changed: ' + name + '. No files were changed.')
        original[name] = raw
    helper_target = source / 'fast_preview.py'
    if helper_target.exists() or helper_target.is_symlink():
        raise ValueError('A FAST helper already exists. Review it instead of overwriting it.')
    transforms = {'server.py': patch_server, 'codex_runner.py': patch_codex,
                  'blender_mcp.py': patch_mcp, 'runtime/run.py': patch_renderer}
    output = {}
    for name, transform in transforms.items():
        text = finish_patch(name, transform(original[name].decode('utf-8')))
        compile(text, name, 'exec')
        output[name] = text.encode('utf-8')
    output['fast_preview.py'] = Path(__file__).with_name('fast_preview.py').read_bytes()
    compile(output['fast_preview.py'], 'fast_preview.py', 'exec')
    if b'CONNECTOR_VERSION = 33\n' not in output['server.py'] or b'v35-reference-acceptance' in output['server.py']:
        raise ValueError('The patch must preserve the installed release identity.')
    manifest = {
        'kind': 'NARROW_V33_SOURCE_STAGE', 'profile': 'fast-draft-v1',
        'installed': False, 'services_restarted': False, 'paid_generation_requested': False,
        'default_enabled': False, 'runtime_reverification_required': True,
        'source_git_blobs': INSTALLED,
        'original_sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()},
        'patched_sha256': {name: hashlib.sha256(raw).hexdigest() for name, raw in output.items()},
        'not_copied': ['state', 'jobs', 'credentials', 'tools', 'verification_receipts'],
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='worldifact-v33-stage-', dir=destination.parent) as temp:
        folder = Path(temp) / 'stage'
        folder.mkdir(mode=0o700)
        for subdir, files in (('originals', original), ('patch', output)):
            for name, raw in files.items():
                path = folder / subdir / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
                path.chmod(0o600)
        (folder / 'STAGE_MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
        # Never reuse an existing output. Stage stays outside the live source.
        if destination.exists():
            raise ValueError('Output appeared during preparation; refusing to replace it.')
        folder.rename(destination)
    return manifest


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 3:
        raise SystemExit('installed_v33.py EXISTING_WORKER NEW_SEPARATE_STAGE')
    print(json.dumps(stage(sys.argv[1], sys.argv[2]), indent=2))
