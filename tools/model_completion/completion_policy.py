"""WORLDIFACT-only completion contract. No provider calls or budget mutations.

Measurements are structural screening, never visual fidelity or manufacturing
approval. Ordinary Froge and FAST jobs keep their existing draft behavior.
"""
import hashlib
import json
import os
from pathlib import Path
import signal
import struct
import time

REVISION = 'worldifact-reference-completion-v1'
MAX_CONTINUATIONS = 1
RECEIPT = '.worldifact-model-completion.json'
STATE = 'agent-completion-state.json'
CABINET = 'WORLDIFACT INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE:'
STANDARD = 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:'
REFERENCE = 'WORLDIFACT REFERENCE-FIDELITY MODE:'
CHARACTER = 'WORLDIFACT REFERENCE CHARACTER — REALISTIC 3D MODE:'
FLOORS = {'cabinet': {'renderedTriangles': 20000, 'meshCount': 8,
    'substantialMeshCount': 6, 'primitiveCount': 8, 'materialCount': 3, 'nodeCount': 8},
    'character': {'renderedTriangles': 25000, 'meshCount': 5,
    'substantialMeshCount': 4, 'primitiveCount': 5, 'materialCount': 3, 'nodeCount': 5}}


def profile(request):
    if not isinstance(request, dict): return None
    # Only the authenticated adapter's explicit instruction contract activates
    # this mode. Natural-language subject guesses never change legacy behavior.
    text = request.get('instructions', '')
    if not isinstance(text, str): return None
    if CABINET in text: return 'cabinet'
    if CHARACTER in text: return 'character'
    if STANDARD in text or REFERENCE in text: return 'standard'
    return None


def read(path, limit=100000):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= limit:
        raise ValueError('Invalid completion evidence.')
    value = json.loads(path.read_text())
    if not isinstance(value, dict): raise ValueError('Invalid completion evidence.')
    return value


def guidance(request):
    selected = profile(request)
    if selected is None: return ''
    text = ('WORLDIFACT completion takes priority over generic compact/simple-asset advice. '
            'Your FIRST build must contain the complete requested subject, with substantive physical '
            'detail and every defining component family. A sparse bootstrap followed by a promise '
            'to improve it is not completion. Use the supported 80-part schema and compact procedural '
            'repetition where needed; the generic 4-20-part/3000-token suggestion is not a quality cap. '
            'Read completion_contract after every build. Inspect actual image blocks on the current '
            'revision (front, side, back; face for a person; three-quarter for a cabinet), correct '
            'observed faults, and successfully call finish_model. No textual final answer substitutes '
            'for these tools. accepted=false must list specific remaining issues honestly. ')
    if selected in FLOORS:
        text += 'Required current-GLB structural floors: ' + ', '.join('%s >= %d' % item for item in FLOORS[selected].items()) + '. '
    if selected == 'cabinet':
        text += ('Build shaped devices with terminals/recesses, rail profiles, slotted ducts, physical '
                 'cylindrical cable runs, supports and fasteners. Each substantial mesh has at least '
                 '24 triangles. Linked copies add rendered triangles, not distinct mesh definitions. '
                 'No photo-covered interior plane, invisible duplicates, degenerate triangles or '
                 'gratuitous subdivision to pad counts. Counts alone never prove reference fidelity. ')
    return text


def inspect_glb(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not 20 <= path.stat().st_size <= 50000000:
        raise ValueError('Missing or oversized current GLB.')
    raw = path.read_bytes()
    magic, version, length, chunk, kind = struct.unpack_from('<IIIII', raw)
    if magic != 0x46546c67 or version != 2 or length != len(raw) or kind != 0x4e4f534a or chunk % 4 or 20 + chunk > len(raw):
        raise ValueError('Invalid current GLB container.')
    doc = json.loads(raw[20:20+chunk])
    if not isinstance(doc, dict) or doc.get('asset', {}).get('version') != '2.0':
        raise ValueError('Invalid current GLB document.')
    for key in ('buffers', 'images', 'meshes', 'accessors', 'nodes', 'materials'):
        if not isinstance(doc.get(key, []), list): raise ValueError('Invalid GLB arrays.')
    for entry in doc.get('buffers', []) + doc.get('images', []):
        if not isinstance(entry, dict) or (entry.get('uri') and not str(entry['uri']).startswith('data:')):
            raise ValueError('External GLB resource is not allowed.')
    mesh_triangles = []; primitives = 0; accessors = doc.get('accessors', [])
    for mesh in doc.get('meshes', []):
        total = 0
        for p in mesh.get('primitives', []):
            primitives += 1
            index = p.get('indices', p.get('attributes', {}).get('POSITION'))
            if type(index) is not int or not 0 <= index < len(accessors): raise ValueError('Invalid mesh accessor.')
            count = accessors[index].get('count')
            if type(count) is not int or not 0 <= count <= 9000000: raise ValueError('Invalid mesh count.')
            mode = p.get('mode', 4)
            if mode == 4: total += count // 3
            elif mode in (5, 6): total += max(0, count - 2)
        mesh_triangles.append(total)
    nodes = doc.get('nodes', []); rendered = 0; parents = set()
    if len(nodes) > 5000: raise ValueError('Too many GLB nodes.')
    for node in nodes:
        if node.get('extensions', {}).get('EXT_mesh_gpu_instancing') is not None:
            raise ValueError('Realize GPU instances before export.')
        if 'mesh' in node:
            index = node['mesh']
            if type(index) is not int or not 0 <= index < len(mesh_triangles): raise ValueError('Invalid mesh node.')
            rendered += mesh_triangles[index]
        children = node.get('children', [])
        if not isinstance(children, list): raise ValueError('Invalid node children.')
        for child in children:
            if type(child) is not int or not 0 <= child < len(nodes) or child in parents:
                raise ValueError('Invalid repeated node.')
            parents.add(child)
    visiting = set(); heights = {}
    def visit(index, depth):
        if depth > 128 or index in visiting: raise ValueError('Cyclic or deep scene.')
        if index in heights: return heights[index]
        visiting.add(index)
        height = max([0] + [1 + visit(child, depth+1) for child in nodes[index].get('children', [])])
        visiting.remove(index); heights[index] = height
        if height > 128: raise ValueError('Deep scene.')
        return height
    for index in range(len(nodes)): visit(index, 0)
    if sum(mesh_triangles) > 3000000 or rendered > 3000000: raise ValueError('GLB triangle ceiling exceeded.')
    return {'triangles': sum(mesh_triangles), 'renderedTriangles': rendered,
        'meshCount': len(mesh_triangles), 'primitiveCount': primitives,
        'substantialMeshCount': sum(n >= 24 for n in mesh_triangles),
        'materialCount': len(doc.get('materials', [])), 'nodeCount': len(nodes)}


def assessment(request, candidate):
    selected = profile(request)
    if selected is None: return None
    try:
        measured = inspect_glb(Path(candidate)/'model.glb')
        required = FLOORS.get(selected, {'renderedTriangles': 1, 'meshCount': 1, 'materialCount': 1})
        deficits = {key: {'actual': measured[key], 'required': floor}
                    for key, floor in required.items() if measured[key] < floor}
        return {'revision': REVISION, 'profile': selected, 'structural_passed': not deficits,
                'measured': measured, 'deficits': deficits, 'visual_fidelity_verified': False,
                'next_action': ('Inspect current GLB images, correct visible defects, then finish_model.' if not deficits else
                    'Edit/rebuild the current candidate with missing physical component detail; inspect again. '
                    'Do not pad triangle counts or claim finished review. If limits prevent correction, finish honestly with accepted=false and specific issues.')}
    except (ValueError, OSError, TypeError, KeyError, AttributeError, struct.error, RecursionError):
        return {'revision': REVISION, 'profile': selected, 'structural_passed': False,
                'deficits': {'current_glb': 'invalid'}, 'visual_fidelity_verified': False,
                'next_action': 'Repair the invalid current GLB; do not claim completion or acceptance.'}


def minimum_output(request, current):
    if profile(request) is None: return 256
    if current is None: return 2048
    result = assessment(request, current['path'])
    return 256 if result and result.get('structural_passed') is True else 2048


def required_views(request, scene):
    views = {'front', 'side', 'back'}
    if scene.get('subject_type') in ('person', 'portrait'): views.add('face')
    if profile(request) == 'cabinet': views.add('three-quarter')
    return views


def save_state(job, writer):
    if not profile(job.request) or job.fast_limits['fast']: return
    writer(job.folder/STATE, {'revision': 1, 'execution_id': job.execution_id,
        'started': job.started, 'attempts': job.attempts, 'model_revision': job.revision,
        'blender_seconds': job.blender_seconds, 'calls': job.calls[-40:],
        'tool_failures': job.tool_failures})


def restore_state(job, current_candidate):
    if not profile(job.request) or job.fast_limits['fast']: return
    start = job.request.get('completion_started')
    if type(start) not in (int, float) or not 0 < start <= time.monotonic():
        raise ValueError('Missing original WORLDIFACT job deadline.')
    job.started = start
    path = job.folder/STATE
    if not path.exists():
        if (job.folder/'agent-candidate.json').exists() or (job.folder/'candidates').exists():
            raise ValueError('Missing WORLDIFACT continuation state; no budget reset.')
        return
    state = read(path)
    if state.get('revision') != 1 or state.get('execution_id') != job.execution_id or state.get('started') != start:
        raise ValueError('Stale WORLDIFACT continuation state.')
    attempts, revision = state.get('attempts'), state.get('model_revision')
    if type(attempts) is not int or type(revision) is not int or not 0 <= revision <= attempts <= job.build_limit:
        raise ValueError('Invalid persisted build limits.')
    candidates = job.folder/'candidates'
    if candidates.is_symlink(): raise ValueError('Invalid candidate state.')
    if candidates.exists():
        for child in candidates.iterdir():
            if child.is_symlink() or not child.is_dir() or not child.name.isdigit() or not 1 <= int(child.name) <= attempts:
                raise ValueError('Unaccounted prior build; no budget reset.')
    calls = state.get('calls')
    if not isinstance(calls, list) or len(calls) > 40 or (calls and calls[-1].get('status') == 'started'):
        raise ValueError('Prior tool did not finish; no continuation.')
    seconds, failures = state.get('blender_seconds'), state.get('tool_failures')
    if type(seconds) not in (int, float) or seconds < 0 or type(failures) is not int or failures < 0:
        raise ValueError('Invalid persisted tool accounting.')
    if revision:
        current = current_candidate(job.folder, job.execution_id)
        if current is None or current['info']['revision'] != revision:
            raise ValueError('Current continuation candidate is not verified.')
        job.current = current['path']
    job.attempts = attempts; job.revision = revision; job.blender_seconds = seconds
    job.calls = calls; job.tool_failures = failures
    # Fresh CLI must see actual images itself; never carry an earlier model's
    # claimed visual inspection over a new execution context.
    job.seen = set()


def can_continue(request, gateway, process_code, reader_alive, failure, pass_index, started, seconds):
    return bool(profile(request) and not gateway.fast_limits['fast'] and pass_index < MAX_CONTINUATIONS
        and process_code == 0 and not reader_alive and failure is None
        and not gateway.error and not gateway.error_code and not gateway.unknown_usage
        and gateway.upstream_status is None and not gateway.active and not gateway.cancelled.is_set()
        and not (gateway.folder/'agent-cancelled').exists() and gateway.requests > 0
        and gateway.requests < gateway.fast_limits['requests']
        and gateway.output < gateway.fast_limits['output']
        and time.monotonic()-started < seconds - 30)


def drain_group(pid):
    """A dead CLI leader is insufficient: finish its MCP process group first."""
    for signum in (signal.SIGTERM, signal.SIGKILL):
        try: os.killpg(pid, signum)
        except ProcessLookupError: return True
        for _ in range(20):
            try: os.killpg(pid, 0)
            except ProcessLookupError: return True
            time.sleep(.05)
    return False


def verified_health(root=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parent
    try:
        proof = read(root/RECEIPT)
        if proof.get('revision') != REVISION: return {}
        expected = proof.get('sha256')
        names = {'codex_runner.py', 'blender_mcp.py', 'server.py', 'completion_policy.py', 'astra_spend_v2.py'}
        if not isinstance(expected, dict) or set(expected) != names: return {}
        for name, digest in expected.items():
            path = root/name
            if path.is_symlink() or path.stat().st_size > 1048576 or hashlib.sha256(path.read_bytes()).hexdigest() != digest: return {}
        runtime = read(root/'tools/codex/verified.json')
        if runtime.get('sources') != {name: expected[name] for name in ('codex_runner.py', 'blender_mcp.py')}: return {}
        if not all(runtime.get(key) is True for key in ('cli_mcp_roundtrip', 'code_mode_roundtrip', 'blender_build_roundtrip')): return {}
        from astra_spend_v2 import verified_health as spend_health
        if not spend_health(root): return {}
        return {'worldifactCompletionPolicy': REVISION, 'worldifactCompletionMaxContinuations': MAX_CONTINUATIONS}
    except (ValueError, OSError, KeyError, TypeError, AttributeError): return {}


def public_failure_code(folder, state):
    if state!='failed': return {}
    try:
        code=read(Path(folder)/'agent-usage.json').get('error_code')
        public={'WORLDIFACT_MODEL_INCOMPLETE':'ORACLE_JOB_INCOMPLETE',
                'WORLDIFACT_RESPONSE_INCOMPLETE':'ORACLE_JOB_INCOMPLETE',
                'WORLDIFACT_COMPLETION_TIMEOUT':'STUDIO_TIMEOUT',
                'WORLDIFACT_ASTRA_COST_GUARD':'ASTRA_COST_LIMIT'}.get(code)
        return {'worldifactFailureCode':public} if public else {}
    except (OSError,ValueError,TypeError): return {}
