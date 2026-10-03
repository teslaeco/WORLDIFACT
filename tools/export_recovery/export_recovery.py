"""No-AI optional exports, isolated from completed artifacts and job lifecycle.

Draft runtime component. Use only with the exact source transform and a future
verified installation. Importing this module starts no process and reads no job.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import subprocess
import tempfile
import uuid

REVISION = 'worldifact-staged-export-v1'
BUSY = '.worldifact-export-recovery.busy'
SIDECAR = '.worldifact-exports-v1'
RECEIPT = '.worldifact-export-recovery.json'
MAX_EXPORT = 512 * 1024**2
MAX_GLB = 48 * 1024**2
FORMATS = ('pbr', 'fbx', 'blend')
# Public immutable renderer source, reviewed independently of server.py.
EXPORTER_BLOB = '14cce46bf6031532ea9627d519290609df134ca9'
SANDBOX_BLOB = 'd55115d74925b10661c8407f4db87ec52a9f0d79'
GLTF_EXTENSIONS = frozenset(('KHR_materials_clearcoat', 'KHR_materials_transmission',
    'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_specular',
    'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_unlit',
    'KHR_materials_emissive_strength', 'KHR_materials_anisotropy',
    'KHR_materials_dispersion', 'KHR_texture_transform', 'KHR_lights_punctual',
    'KHR_mesh_quantization'))
SCRIPT = '''import bpy,json,sys
from pathlib import Path
sys.path.insert(0,'/runner')
from scene_exports import export_interchange
folder=Path('/work')
bpy.ops.wm.read_factory_settings(use_empty=True)
if bpy.ops.import_scene.gltf(filepath=str(folder/'model.glb'))!={'FINISHED'}:
    raise ValueError('Preserved GLB import failed')
for image in bpy.data.images:
    if image.has_data and (image.packed_file is None or image.is_dirty):image.pack()
if bpy.ops.wm.save_as_mainfile(filepath=str(folder/'model.blend'))!={'FINISHED'}:
    raise ValueError('Recovered BLEND save failed')
report=export_interchange(folder)
(folder/'result.json').write_text(json.dumps({'interchange_exports':report}))
'''


class ExportError(ValueError):
    """No exporter remains running; normal cleanup may release the reservation."""


class CleanupUncertain(RuntimeError):
    """Keep the persistent reservation until an operator verifies process exit."""


def safe_path(path):
    path = Path(path)
    if not path.is_absolute() or any(p.is_symlink() for p in (path, *path.parents)):
        raise ExportError('Unsafe export path.')
    return path


def regular(path, maximum):
    path = safe_path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= maximum:
            raise ExportError('Unsupported export file.')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(maximum + 1)
        after = os.fstat(fd)
        if len(raw) != before.st_size or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ExportError('Export file changed while reading.')
        return raw
    finally:
        os.close(fd)


def record(path, root):
    raw = regular(path, MAX_EXPORT)
    return {'path': Path(path).relative_to(root).as_posix(), 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest()}


def json_file(path):
    value = json.loads(regular(path, 2 * 1024**2))
    if not isinstance(value, dict):
        raise ExportError('Invalid export metadata.')
    return value


def sync_directory(path):
    fd = os.open(safe_path(path), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_new(path, raw):
    fd = os.open(safe_path(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def busy(state):
    # lstat detects dangling links; unreadable or suspicious paths fail closed.
    try:
        safe_path(state)
        (Path(state) / BUSY).lstat()
        return True
    except FileNotFoundError:
        return False
    except (OSError, ValueError):
        return True


def glb_identity(folder):
    raw = regular(Path(folder) / 'model.glb', MAX_GLB)
    if len(raw) < 20:
        raise ExportError('Invalid preserved GLB.')
    magic, version, length, chunk_size, kind = struct.unpack_from('<IIIII', raw)
    if (magic, version, length, kind) != (0x46546c67, 2, len(raw), 0x4e4f534a) or chunk_size % 4 or 20 + chunk_size > len(raw):
        raise ExportError('Invalid preserved GLB.')
    document = json.loads(raw[20:20 + chunk_size])
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0':
        raise ExportError('Invalid preserved GLB document.')
    for key in ('extensionsUsed', 'extensionsRequired'):
        extensions = document.get(key, [])
        if not isinstance(extensions, list) or any(not isinstance(item, str) or item not in GLTF_EXTENSIONS for item in extensions):
            raise ExportError('Unreviewed GLB extension.')
    def check_paths(value, depth=0):
        if depth > 128:
            raise ExportError('GLB nesting is too deep.')
        if isinstance(value, dict):
            for key, child in value.items():
                if key == 'extensions' and (not isinstance(child, dict) or not set(child) <= GLTF_EXTENSIONS):
                    raise ExportError('Unreviewed GLB extension payload.')
                if key == 'path' and child not in ('translation', 'rotation', 'scale', 'weights'):
                    raise ExportError('Unreviewed GLB path field.')
                if key.lower() in ('uri', 'url', 'href', 'src') and (not isinstance(child, str) or not child.startswith('data:')):
                    raise ExportError('External GLB resource is not allowed.')
                check_paths(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                check_paths(child, depth + 1)
    check_paths(document)
    for key in ('buffers', 'images'):
        entries = document.get(key, [])
        if not isinstance(entries, list):
            raise ExportError('Invalid GLB resources.')
        for entry in entries:
            if not isinstance(entry, dict) or ('uri' in entry and (not isinstance(entry['uri'], str) or not entry['uri'].startswith('data:'))):
                raise ExportError('External GLB resources are not allowed.')
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def checked_records(folder, records, name):
    if not isinstance(records, list) or not 1 <= len(records) <= 256:
        raise ExportError('Invalid export records.')
    paths = []
    total = 0
    for item in records:
        value = item.get('path') if isinstance(item, dict) else None
        allowed = (value == 'model.fbx' if name == 'fbx' else value == 'model.blend' if name == 'blend'
                   else isinstance(value, str) and re.fullmatch(r'textures/[A-Za-z0-9_.-]+\.(png|jpg)', value))
        if not allowed or value in [p.relative_to(folder).as_posix() for p in paths]:
            raise ExportError('Invalid optional export path.')
        path = folder / value
        measured = record(path, folder)
        if measured != {k: item.get(k) for k in ('path', 'bytes', 'sha256')}:
            raise ExportError('Optional export hash differs.')
        total += measured['bytes']
        if total > MAX_EXPORT:
            raise ExportError('Optional export is too large.')
        paths.append(path)
    if name in ('blend', 'fbx') and len(paths) != 1:
        raise ExportError('Invalid single-file export.')
    return paths


def original_files(folder, name, resolver):
    safe_path(folder)
    try:
        paths = resolver(folder, name)
        for path in paths:
            regular(path, MAX_EXPORT)
        if not paths:
            raise ExportError('Empty export.')
        return paths
    except (ValueError, OSError, KeyError, TypeError):
        if name != 'pbr':
            raise
    # Preserve the existing, hash-checked embedded-texture fallback. This is a
    # texture package; it does not claim all independent PBR channels exist.
    report = json_file(folder / 'result.json').get('interchange_exports', {})
    return checked_records(folder, report.get('textures'), 'pbr')


def resolve(folder, name, resolver):
    folder = safe_path(folder)
    try:
        return original_files(folder, name, resolver)
    except (ValueError, OSError, KeyError, TypeError):
        if name not in FORMATS:
            raise
    bundle = safe_path(folder / SIDECAR)
    manifest = json_file(bundle / 'manifest.json')
    if manifest.get('revision') != REVISION or manifest.get('source_glb') != glb_identity(folder):
        raise ExportError('Stale optional export bundle.')
    return checked_records(bundle, manifest.get('formats', {}).get(name), name)


def archive_name(folder, path):
    """Keep the on-disk immutable sidecar name out of customer ZIP layouts."""
    folder, path = safe_path(folder), safe_path(path)
    base = folder / SIDECAR if path.is_relative_to(folder / SIDECAR) else folder
    return path.relative_to(base).as_posix()


def ready(folder, resolver):
    result = []
    for name in FORMATS:
        try:
            resolve(folder, name, resolver)
            result.append(name)
        except (ValueError, OSError, KeyError, TypeError):
            pass
    return result


def run_export(root, work, token, memory, sandbox_options, image, timeout=300):
    """Run only the fixed GLB import in the existing sandbox; prove cleanup."""
    renderer = regular(root / 'runtime/scene_exports.py', 1024**2)
    if hashlib.sha1(b'blob ' + str(len(renderer)).encode() + b'\0' + renderer).hexdigest() != EXPORTER_BLOB:
        raise ExportError('Unreviewed optional exporter.')
    script = work / 'export.py'
    write_new(script, SCRIPT.encode())
    name = 'froge-posthoc-' + token
    command = ['podman', 'run', '--rm', '--pull=never', '--name', name] + sandbox_options(memory) + [
        '-v', str(safe_path(root / 'runtime')) + ':/runner:ro,Z',
        '-v', str(safe_path(work)) + ':/work:rw,Z', image,
        '--background', '--factory-startup', '--disable-autoexec', '--threads', '2',
        '--python-exit-code', '1', '--python', '/work/export.py']
    process = None
    failed = False
    try:
        with (work / 'export.log').open('xb') as output:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output,
                                       stderr=subprocess.STDOUT)
            failed = process.wait(timeout=timeout) != 0
    except BaseException:
        failed = True
    finally:
        # A reaped podman client is not proof its container has stopped. Never
        # release admission merely because kill/rm was attempted or timed out.
        try:
            def exists():
                value = subprocess.run(['podman', 'container', 'exists', name], stdin=subprocess.DEVNULL,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                if value.returncode not in (0, 1):
                    raise CleanupUncertain('Container status unavailable.')
                return value.returncode == 0
            present = exists()
            starting = process is not None and process.poll() is None and not present
            if present:
                subprocess.run(['podman', 'rm', '--force', name], stdin=subprocess.DEVNULL,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
            if process is not None:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=10)
            if exists() or starting:
                # A still-starting client with no visible container is ambiguous:
                # killing it does not prove a late conmon child cannot appear.
                raise CleanupUncertain('Export container cleanup is unconfirmed.')
        except BaseException:
            raise CleanupUncertain('Export cleanup is unconfirmed; admission remains reserved.') from None
    if failed:
        raise ExportError('Optional export failed; original artifacts are preserved.')


def verified_health(root):
    """A source stage is not a runtime attestation and cannot enable this API."""
    try:
        root = safe_path(root)
        proof = json_file(root / RECEIPT)
        names = {'server.py', 'export_recovery.py', 'runtime/scene_exports.py', 'runtime_check.py'}
        expected = proof.get('sha256')
        if proof.get('revision') != REVISION or not isinstance(expected, dict) or set(expected) != names:
            return {}
        if not all(proof.get(key) is True for key in ('offline_export_roundtrip', 'cleanup_verified', 'admission_verified')):
            return {}
        for name, digest in expected.items():
            if hashlib.sha256(regular(root / name, 1024**2)).hexdigest() != digest:
                return {}
        return {'posthocExportSafetyRevision': REVISION, 'posthocExportBusy': busy(root / 'state')}
    except (ValueError, OSError, KeyError, TypeError):
        return {}


class Recovery:
    def __init__(self, root, state, jobs, lock, database, running, resolver, sandbox_options, memory, image):
        self.root, self.state, self.jobs = map(Path, (root, state, jobs))
        self.lock, self.database, self.running, self.resolver = lock, database, running, resolver
        self.sandbox_options, self.memory, self.image = sandbox_options, memory, image

    def prepare(self, job_id):
        stage = None
        reserved = False
        uncertain = False
        token = uuid.uuid4().hex
        try:
            if verified_health(self.root).get('posthocExportSafetyRevision') != REVISION:
                raise ExportError('Safe export runtime is not verified.')
            if not isinstance(job_id, str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', job_id):
                raise ExportError('Invalid job identifier.')
            folder = safe_path(self.jobs / job_id)
            with self.lock, self.database() as db:
                row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
                if row is None or row['state'] != 'succeeded':
                    raise ExportError('Only an existing completed model can be exported.')
                import fast_preview
                import completion_policy
                request = json_file(folder / 'agent-request.json')
                if fast_preview.read_profile(folder) != 'standard' or not completion_policy.profile(request):
                    raise ExportError('Only a completed WORLDIFACT detailed job is eligible.')
                before = glb_identity(folder)
                existing = ready(folder, self.resolver)
                if len(existing) == len(FORMATS):
                    return self.response(folder, existing, False), 200
                if (folder / SIDECAR).exists() or (folder / SIDECAR).is_symlink():
                    raise ExportError('An immutable recovery bundle already exists; missing exports require review.')
                if busy(self.state) or self.running or db.execute("SELECT COUNT(*) FROM jobs WHERE state NOT IN ('succeeded','failed','cancelled')").fetchone()[0]:
                    raise ExportError('Generator or optional export is busy.')
                write_new(self.state / BUSY, (REVISION + '\n' + token + '\n').encode())
                reserved = True
                sync_directory(self.state)
            if shutil.disk_usage(self.state).free < 2 * 1024**3 + 2 * MAX_EXPORT:
                raise ExportError('Insufficient disk space for an isolated export.')
            stage = Path(tempfile.mkdtemp(prefix='.export-recovery-', dir=safe_path(self.state)))
            work = stage / 'work'
            work.mkdir(mode=0o700)
            write_new(work / 'model.glb', regular(folder / 'model.glb', MAX_GLB))
            if glb_identity(work) != before:
                raise ExportError('Model changed before private staging.')
            # Never call run_blender, status(), a provider, or the live finalizer.
            # Only the private work directory is writable inside the container.
            try:
                run_export(self.root, work, token, 4, self.sandbox_options, self.image)
            except ExportError:
                raise
            except BaseException:
                uncertain = True
                raise CleanupUncertain('Export process cleanup is unconfirmed.') from None
            if glb_identity(work) != before:
                raise ExportError('Exporter rewrote its private GLB; publication refused.')
            report = json_file(work / 'result.json').get('interchange_exports', {})
            generated = {}
            for name in FORMATS:
                if name in existing:
                    continue
                try:
                    if name == 'blend':
                        if not regular(work / 'model.blend', MAX_EXPORT).startswith(b'BLENDER'):
                            raise ExportError('Invalid recovered BLEND.')
                        records = [record(work / 'model.blend', work)]
                    elif name == 'fbx':
                        entry = report.get('fbx', {})
                        if entry.get('status') != 'ready' or entry.get('reimport_verified') is not True:
                            raise ExportError('FBX reimport verification is missing.')
                        records = entry.get('files')
                    else:
                        records = report.get('textures')
                    checked_records(work, records, name)
                    generated[name] = [{k: r[k] for k in ('path', 'bytes', 'sha256')} for r in records]
                except (ValueError, OSError, KeyError, TypeError):
                    continue
            if not generated:
                raise ExportError('No verified missing exports were produced.')
            publish = stage / 'publish'
            publish.mkdir(mode=0o700)
            for records in generated.values():
                for item in records:
                    target = publish / item['path']
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    write_new(target, regular(work / item['path'], MAX_EXPORT))
            manifest = {'revision': REVISION, 'source_glb': before, 'formats': generated,
                        'provenance': 'reimported-preserved-glb', 'visual_fidelity_verified': False}
            write_new(publish / 'manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode())
            for name, records in generated.items():
                checked_records(publish, records, name)
            for directory in sorted([p for p in publish.rglob('*') if p.is_dir()], reverse=True):
                sync_directory(directory)
            sync_directory(publish)
            with self.lock, self.database() as db:
                row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
                if row is None or row['state'] != 'succeeded' or glb_identity(folder) != before:
                    raise ExportError('Completed model changed; publication refused.')
                if (folder / SIDECAR).exists() or (folder / SIDECAR).is_symlink():
                    raise ExportError('Recovery bundle appeared concurrently.')
                # One directory rename exposes a complete immutable bundle.
                # Existing GLB, BLEND, reports and format paths are never opened
                # for writing, and originals remain the preferred downloads.
                os.rename(publish, folder / SIDECAR)
                sync_directory(folder)
            return self.response(folder, ready(folder, self.resolver), True), 200
        except CleanupUncertain:
            return {'error': 'Optional export cleanup needs review; new generation remains blocked.', 'code': 'EXPORT_CLEANUP_UNCERTAIN'}, 503
        except (ValueError, OSError, KeyError, TypeError):
            return {'error': 'Optional exports unavailable. Original model and completion state are preserved.', 'code': 'EXPORT_NOT_PREPARED'}, 409
        finally:
            if reserved and not uncertain:
                # A cleanup error leaves the durable marker in place. Never
                # remove somebody else's marker or an uncertain stage tree.
                try:
                    if stage is not None:
                        safe_path(stage)
                        shutil.rmtree(stage)
                    with self.lock:
                        expected = (REVISION + '\n' + token + '\n').encode()
                        if regular(self.state / BUSY, 256) != expected:
                            raise CleanupUncertain('Reservation changed.')
                        (self.state / BUSY).unlink()
                        sync_directory(self.state)
                except BaseException:
                    # Raising overrides an earlier successful return, so callers
                    # never receive a successful cleanup claim after a failure.
                    raise CleanupUncertain('Export cleanup needs operator review.') from None

    def response(self, folder, formats, prepared):
        recovered = [name for name in formats if any(path.is_relative_to(folder / SIDECAR)
                     for path in resolve(folder, name, self.resolver))]
        return {'prepared': prepared, 'alreadyReady': not prepared, 'formats': formats,
                'missingFormats': [name for name in FORMATS if name not in formats],
                'paidGenerationRequested': False, 'generationRequested': False,
                'exportSafetyRevision': REVISION, 'recoveredFromGlb': bool(recovered),
                'recoveredFormats': recovered}
