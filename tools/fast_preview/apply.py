"""Build a NEW patched source directory; never install over a running worker.

Usage: python tools/fast_preview/apply.py PINNED_ORACLE_SOURCE NEW_OUTPUT
The input files must match their reviewed Git blob identities. Runtime binaries
need re-verification after this patch; no receipt is fabricated here.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
from completion import finish_patch

PIN = 'd3f61b842dcfeda2ed794210caafc391919a75be'
HASHES = {
    'server.py': 'ac0ef28c11385709269a79f88b0d43ef517a15e7',
    'codex_runner.py': '55a4442f411a7e2c6060cca298a056004d30d9d4',
    'blender_mcp.py': '1fe58476bd1366c8c8106dc76439db1974fa51a4',
    'runtime/run.py': '48e4e456084b5bbd7e6b399f4210992d41bfdfe7',
}


def blob_sha(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def replace(source, old, new, count=1):
    found = source.count(old)
    if found != count:
        raise ValueError('Patch context changed: expected %d occurrences, found %d: %r' % (count, found, old[:100]))
    return source.replace(old, new)


def patch_server(s):
    s = replace(s, 'from generation_budget import initial_ai_remaining, total_ai_limit, initial_blender_remaining',
                'from generation_budget import initial_ai_remaining, total_ai_limit, initial_blender_remaining\nfrom fast_preview import requested_profile, read_profile, capability')
    s = replace(s, 'return self.send_json(health())', 'return self.send_json(capability(health()))')
    s = replace(s, "if write and self.path == '/v1/jobs':\n                data = self.input()",
                "if write and self.path == '/v1/jobs':\n                data = self.input()\n                profile = requested_profile(data)")
    s = replace(s, "if prior['prompt'] != prompt.strip() or prior_source != source_id", "if read_profile(JOBS/job_id) != profile or prior['prompt'] != prompt.strip() or prior_source != source_id")
    s = replace(s, "recovery=recoverable_review_scene(db,prompt.strip(),photos,instructions) if source_id is None else None",
                "recovery=recoverable_review_scene(db,prompt.strip(),photos,instructions) if source_id is None and profile == 'standard' else None")
    s = replace(s, "write_json(destination/'agent-instructions.json',{'text':instructions,'revision':1})",
                "write_json(destination/'agent-instructions.json',{'text':instructions,'revision':1})\n                    if profile != 'standard':\n                        write_json(destination/'generation-profile.json', {'profile': profile})")
    return s


def patch_codex(s):
    s = replace(s, 'from agent_limits import MAX_REQUESTS, MAX_OUTPUT_TOKENS, MAX_SECONDS, MAX_BUILDS',
                'from agent_limits import MAX_REQUESTS, MAX_OUTPUT_TOKENS, MAX_SECONDS, MAX_BUILDS\nimport fast_preview')
    s = replace(s, 'self.key=key;self.folder=folder;self.cancelled=cancelled',
                'self.key=key;self.folder=folder;self.cancelled=cancelled\n        self.fast_limits=fast_preview.policy(folder, MAX_REQUESTS, MAX_OUTPUT_TOKENS, MAX_SECONDS)')
    s = replace(s, 'entries=list(request_tools(payload))',
                "if outer.fast_limits['fast'] and fast_preview.checked_candidate(outer.folder) is not None:\n                        return self.reject(422, 'Checked FAST draft is ready; no further provider turn.', 'FORGE_FAST_DRAFT_READY')\n                    entries=list(request_tools(payload))")
    s = replace(s, 'outer.requests>=MAX_REQUESTS or outer.output>=MAX_OUTPUT_TOKENS', "outer.requests>=outer.fast_limits['requests'] or outer.output>=outer.fast_limits['output']")
    s = replace(s, '%(MAX_REQUESTS,MAX_OUTPUT_TOKENS)', "%(outer.fast_limits['requests'],outer.fast_limits['output'])")
    s = replace(s, 'allowance=min(16000,MAX_OUTPUT_TOKENS-outer.output)', "allowance=min(8192 if outer.fast_limits['fast'] else 16000,outer.fast_limits['output']-outer.output)")
    s = replace(s, "payload['reasoning']={**payload.get('reasoning',{}),'effort':'high'}",
                "payload['reasoning']={**payload.get('reasoning',{}),'effort':'low' if outer.fast_limits['fast'] else 'high'}")
    s = replace(s, 'started=time.monotonic();failure=None\n    with Gateway',
                "fast_limits=fast_preview.policy(folder, MAX_REQUESTS, MAX_OUTPUT_TOKENS, MAX_SECONDS)\n    if fast_limits['fast']:\n        task=fast_preview.task(prompt,instructions)\n    started=time.monotonic();failure=None\n    with Gateway")
    s = replace(s, 'while process.poll() is None:\n                outcome=completed_outcome(folder)',
                "while process.poll() is None:\n                if fast_limits['fast'] and not cancelled.is_set() and fast_preview.checked_candidate(folder, execution_id) is not None:\n                    try:\n                        fast_result=fast_preview.retain_fast(folder,execution_id,started)\n                    finally:\n                        terminate()\n                    return fast_result\n                outcome=completed_outcome(folder)")
    s = replace(s, 'time.monotonic()-started>MAX_SECONDS', "time.monotonic()-started>fast_limits['seconds']")
    s = replace(s, '    outcome=completed_outcome(folder)\n    if outcome is not None:return outcome',
                "    if fast_limits['fast']:\n        if cancelled.is_set():raise InterruptedError('FAST draft was cancelled.')\n        return fast_preview.retain_fast(folder,execution_id,started)\n    outcome=completed_outcome(folder)\n    if outcome is not None:return outcome")
    return s


def patch_mcp(s):
    s = replace(s, 'from agent_limits import MAX_BUILDS, BUILD_DEADLINE',
                'from agent_limits import MAX_BUILDS, BUILD_DEADLINE\nfrom fast_preview import policy as fast_policy, fast_scene_guard')
    start, rest = s.split('class JobTools:', 1)
    body, end = rest.split('\ndef retain_candidate(', 1)
    body = body.replace('MAX_BUILDS', 'self.build_limit').replace('BUILD_DEADLINE', 'self.work_limit')
    body = replace(body, 'self.folder = Path(folder)', "self.folder = Path(folder)\n        self.fast_limits = fast_policy(folder, standard_seconds=BUILD_DEADLINE)\n        self.build_limit = 1 if self.fast_limits['fast'] else MAX_BUILDS\n        self.work_limit = self.fast_limits['seconds']")
    body = replace(body, 'validate_photo_plan(scene, self.photos)', "if self.fast_limits['fast']:\n            fast_scene_guard(scene)\n        validate_photo_plan(scene, self.photos)")
    body = replace(body, "write(candidate/'review-request.json',{'enabled':True,'preview_only':True})",
                   "write(candidate/'review-request.json',{'enabled':False,'preview_only':True,'fast_draft':True} if self.fast_limits['fast'] else {'enabled':True,'preview_only':True})")
    body = replace(body, "if name=='finish_model':\n            if self.current is None:",
                   "if name=='finish_model':\n            if self.fast_limits['fast']:\n                raise ValueError('FAST draft uses checked-candidate retention, not visual acceptance or final export.')\n            if self.current is None:")
    return start + 'class JobTools:' + body + '\ndef retain_candidate(' + end


def patch_renderer(s):
    s = replace(s, '    from reference_quality import export_textures, geometry_digest',
                "    fast_path=output/'review-request.json'\n    fast_request=json.loads(fast_path.read_text()) if fast_path.is_file() else {}\n    if fast_request.get('fast_draft') is True:\n        if heads or not 1 <= triangles <= 300000 or len(objects) > 128:\n            raise ValueError('FAST draft geometry scope exceeded; no silent STANDARD fallback.')\n        for image in bpy.data.images:\n            width,height=image.size\n            if width > 2048 or height > 2048:\n                factor=2048/max(width,height)\n                image.scale(max(1,round(width*factor)),max(1,round(height*factor)))\n        bpy.context.scene['material_max_edge']=min(bpy.context.scene.get('material_max_edge',2048),2048)\n    from reference_quality import export_textures, geometry_digest")
    s = replace(s, "    if request.get('preview_only') is True:\n        # Review the exported GLB before spending time exporting every format.",
                "    if request.get('preview_only') is True:\n        if request.get('fast_draft') is True:\n            report['review_render']={'status':'deferred_fast_draft','assessment_completed':False}\n            report['interchange_exports']={'status':'deferred_fast_draft','formats':['glb','blend']}\n            report['fast_profile']='fast-draft-v1'\n            (output/'result.json').write_text(json.dumps(report))\n            save_ready(output,report,'core_export')\n            return\n        # Review the exported GLB before spending time exporting every format.")
    return s


def build(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists() or destination == source or source in destination.parents:
        raise ValueError('Use a new output directory outside the source; in-place installation is prohibited.')
    transforms = {'server.py': patch_server, 'codex_runner.py': patch_codex,
                  'blender_mcp.py': patch_mcp, 'runtime/run.py': patch_renderer}
    updates = {}
    for name, expected in HASHES.items():
        path = source / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing or unsafe reviewed source: ' + name)
        raw = path.read_bytes()
        if blob_sha(raw) != expected:
            raise ValueError('Source parity not confirmed: ' + name + '. No files were changed.')
        patched = finish_patch(name, transforms[name](raw.decode('utf-8')))
        compile(patched, name, 'exec')
        updates[name] = patched
    helper = Path(__file__).with_name('fast_preview.py').read_text(encoding='utf-8')
    compile(helper, 'fast_preview.py', 'exec')
    updates['fast_preview.py'] = helper
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='fast-stage-', dir=destination.parent) as staging:
        stage = Path(staging)/'worker'
        shutil.copytree(source, stage, ignore=shutil.ignore_patterns('state', 'tools', '__pycache__', '*.pyc', '.git'), symlinks=True)
        if any(p.is_symlink() for p in stage.rglob('*')):
            raise ValueError('Unexpected source symlink; assembly stopped.')
        for name, content in updates.items():
            (stage/name).write_text(content, encoding='utf-8')
        manifest = {'source_repository':'teslaeco/Froge-MPC-2-test','source_commit':PIN,
                    'profile':'fast-draft-v1','installed':False,'live_benchmark':'NOT_RUN',
                    'source_blobs':HASHES,'patched_sha256':{name:hashlib.sha256(content.encode()).hexdigest() for name,content in updates.items()},
                    'runtime_reverification_required':True,'default_enabled':False}
        (stage/'FAST_PATCH_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
        stage.replace(destination)
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(json.dumps(build(sys.argv[1], sys.argv[2]), indent=2))
