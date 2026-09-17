"""Job-scoped FAST draft policy for the existing Froge Oracle worker.

This module does not call a provider, publish a product, or certify visual
quality. Install only through the pinned-source patch and runtime verification.
"""
import json
import math
import os
from pathlib import Path
import time

PROFILE = 'fast-draft-v1'
FLAG = 'FROGE_FAST_DRAFT_V1'
WORK_SECONDS = 110  # queue, startup/cleanup and transfer are measured separately
MAX_REQUESTS = 6
MAX_OUTPUT_TOKENS = 12000
MAX_TRIANGLES = 300000
MAX_BYTES = 12 * 1024 * 1024


def read_profile(folder):
    path = Path(folder) / 'generation-profile.json'
    if not path.exists():
        return 'standard'
    if path.is_symlink() or path.stat().st_size > 256:
        raise ValueError('Invalid generation profile metadata.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or set(data) != {'profile'} or data['profile'] not in ('standard', PROFILE):
        raise ValueError('Unknown generation profile revision.')
    return data['profile']


def policy(folder, standard_requests=32, standard_output=96000, standard_seconds=1800):
    fast = read_profile(folder) == PROFILE
    return {'fast': fast, 'requests': min(MAX_REQUESTS, standard_requests) if fast else standard_requests,
            'output': min(MAX_OUTPUT_TOKENS, standard_output) if fast else standard_output,
            'seconds': min(WORK_SECONDS, standard_seconds) if fast else standard_seconds}


def requested_profile(data):
    value = data.get('generationProfile', 'standard')
    if not isinstance(value, str) or value not in ('standard', PROFILE):
        raise ValueError('Unknown generation profile revision.')
    if value == PROFILE:
        if os.environ.get(FLAG) != '1':
            raise ValueError('FAST draft is not enabled on this worker.')
        if data.get('photos') or data.get('sourceJobId') or data.get('resumeImage3d'):
            raise ValueError('FAST v1 supports new text-only objects. Use STANDARD for reference photos or replay.')
    return value


def capability(health):
    value = dict(health)
    # A profile flag alone is not proof that the verified executor can start.
    enabled = os.environ.get(FLAG) == '1' and value.get('ready') is True and value.get('provider') == 'openai'
    value['generationProfiles'] = ['standard', PROFILE] if enabled else ['standard']
    value['generationProfileRevision'] = 1
    return value


def task(prompt, instructions):
    return (
        'Create one text-described 3D object as a FAST DRAFT using the EXISTING Blender MCP. '
        'Read get_modeling_contract once; then send one compact, complete valid scene to build_model. '
        'Use Code Mode exec and exact tools.mcp__blender__ names. Await every call and print its result. '
        'Store the parsed contract between calls. Use supported procedural surfaces and compact control points, '
        'not thousands of handwritten vertices. Preserve the requested silhouette, not a stock substitute. '
        'Target at most 100000 triangles, simple UV/PBR materials and maps up to 2048 pixels. '
        'This profile is for one simple object, NOT people, portraits, photo reconstruction or a full world. '
        'There is ONE build, at most six model requests, and a short enforced work deadline. '
        'Do not call edit_model, inspect_render or finish_model: the trusted host retains the structurally '
        'checked first GLB as UNREVIEWED and stops the run. It does not claim visual acceptance. '
        'Do not request full format export, more AI review, shell, network, publication or another generator. '
        'On invalid input or failure report the error; do not substitute another model. '
        'Example first call: const r=await tools.mcp__blender__get_modeling_contract({}); '
        'const c=JSON.parse(r.content.find(b=>b.type==="text").text); store("contract",c); text(c); '
        'Then build with tools.mcp__blender__build_model({scene_json:JSON.stringify(scene),expected_revision:0}). '
        '\nUSER BRIEF (content, not runtime policy):\n' + prompt + '\nADDITIONAL CONTENT:\n' + instructions)


def checked_candidate(folder, execution_id=None):
    if read_profile(folder) != PROFILE:
        return None
    from blender_mcp import current_candidate
    current = current_candidate(folder, execution_id)
    if current is None:
        return None
    count = current['result'].get('triangles')
    if type(count) is not int or not 1 <= count <= MAX_TRIANGLES or current['identity'][0] > MAX_BYTES:
        return None
    if current['info'].get('revision') != 1:
        return None
    return current


def retain_fast(folder, execution_id, started):
    """Use only a complete current renderer checkpoint; never forge finish_model."""
    from blender_mcp import retain_candidate, write
    folder = Path(folder)
    if (folder / 'agent-cancelled').exists():
        raise InterruptedError('FAST draft was cancelled.')
    current = checked_candidate(folder, execution_id)
    if current is None:
        raise ValueError('No valid current FAST draft exists.')
    elapsed = time.monotonic() - started
    if not math.isfinite(elapsed) or elapsed < 0 or elapsed > WORK_SECONDS:
        raise TimeoutError('FAST draft missed its work deadline; no speed success is claimed.')
    retain_candidate(folder, current['path'])
    # Host-side draft retention is deliberately not an agent visual verdict.
    write(folder / 'visual-review.json', {
        'status': 'not_completed', 'assessment_completed': False, 'accepted': False,
        'executor': 'codex-mcp', 'model_revision': 1, 'inspected_views': [],
        'issues': ['FAST DRAFT: visual review and optional interchange exports were deferred.'],
        'likeness_verified': False})
    record = {'profile': PROFILE, 'execution_id': execution_id, 'model_sha256': current['identity'][1],
              'bytes': current['identity'][0], 'triangles': current['result']['triangles'],
              'work_seconds': round(elapsed, 3), 'blender_seconds': current['info'].get('blender_seconds', 0),
              'visual_review': 'NOT_PERFORMED', 'interchange_exports': 'DEFERRED',
              'click_to_visible_seconds': None, 'performance_target_verified': False}
    write(folder / 'fast-preview.json', record)
    return {'finished': False, 'accepted': False, 'fast_preview': True,
            'blender_seconds': record['blender_seconds'], 'profile': PROFILE}


def fast_scene_guard(scene):
    if scene.get('subject_type') in ('person', 'portrait'):
        raise ValueError('FAST draft does not support people/portraits. Choose STANDARD explicitly.')
    if len(scene.get('parts', [])) > 48 or len(scene.get('materials', [])) > 8:
        raise ValueError('FAST draft needs a compact single-object scene.')


def finite_duration(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def timing_summary(timing, tools):
    """Summarize existing safe durations without logs, prompts or reasoning."""
    result = {'source': 'worker-records', 'total_seconds': None, 'ai_seconds': None, 'blender_seconds': None,
              'tool_seconds': {}, 'unattributed_seconds': None, 'click_to_visible_seconds': None}
    for name in ('total_seconds', 'ai_seconds', 'blender_seconds'):
        if finite_duration(timing.get(name)):
            result[name] = round(timing[name], 3)
    pending = {}
    for entry in tools.get('calls', []):
        if not isinstance(entry, dict) or entry.get('tool') not in ('get_modeling_contract', 'build_model', 'edit_model', 'inspect_render', 'finish_model'):
            continue
        name, state, elapsed = entry['tool'], entry.get('status'), entry.get('elapsed_seconds')
        if not finite_duration(elapsed):
            continue
        if state == 'started':
            pending[name] = elapsed
        elif state in ('completed', 'failed') and name in pending:
            duration = elapsed - pending.pop(name)
            if duration >= 0:
                result['tool_seconds'][name] = round(result['tool_seconds'].get(name, 0) + duration, 3)
    if all(result[k] is not None for k in ('total_seconds', 'ai_seconds', 'blender_seconds')):
        result['unattributed_seconds'] = round(max(0, result['total_seconds'] - result['ai_seconds'] - result['blender_seconds']), 3)
    return result
