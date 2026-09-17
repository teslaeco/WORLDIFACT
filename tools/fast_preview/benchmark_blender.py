"""Compare the same deterministic scene through real Blender, with no AI.

This measures renderer subprocess wall time including Blender startup, not an
Oracle, Codex, network, queue or click-to-visible benchmark. No browser preview.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import struct
import subprocess
import sys
import time


def glb_summary(path):
    raw=path.read_bytes()
    if len(raw)<20 or struct.unpack('<III',raw[:12])!=(0x46546c67,2,len(raw)):
        raise ValueError('Invalid actual Blender GLB container.')
    length,kind=struct.unpack('<II',raw[12:20])
    if kind!=0x4e4f534a or length%4 or 20+length>len(raw):
        raise ValueError('Invalid GLB JSON chunk.')
    data=json.loads(raw[20:20+length])
    if any('uri' in entry for entry in data.get('buffers',[])) or any('uri' in entry and not entry['uri'].startswith('data:') for entry in data.get('images',[])):
        raise ValueError('Fixture export is not self-contained.')
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
            'materials':len(data.get('materials',[])), 'images':len(data.get('images',[]))}


def main():
    if len(sys.argv)!=4:
        raise SystemExit('benchmark_blender.py BLENDER PATCHED_WORKER NEW_OUTPUT')
    binary,worker,output=Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve(),Path(sys.argv[3]).resolve()
    if output.exists():
        raise ValueError('Use a new output directory to preserve prior measurements.')
    output.mkdir(parents=True)
    source=worker/'examples/rocket.scene.json'
    scene_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    results=[]
    for profile in ('standard-preview','fast-draft-v1'):
        folder=output/profile;folder.mkdir()
        shutil.copy2(source,folder/'scene.json')
        (folder/'review-request.json').write_text(json.dumps({'enabled':profile=='standard-preview','preview_only':True,**({'fast_draft':True} if profile!='standard-preview' else {})}))
        expression=("import sys; from pathlib import Path; sys.path.insert(0,"+repr(str(worker/'runtime'))+"); "
                    "import run; run.execute_job(Path("+repr(str(folder))+"))")
        started=time.monotonic()
        with (folder/'blender.log').open('wb') as log:
            completed=subprocess.run([str(binary),'--background','--factory-startup','--threads','2','--python-exit-code','1','--python-expr',expression],
                                     stdout=log,stderr=subprocess.STDOUT,timeout=180)
        seconds=round(time.monotonic()-started,3)
        if completed.returncode:
            raise RuntimeError(profile+' renderer failed: '+(folder/'blender.log').read_text(errors='replace')[-3500:])
        report=json.loads((folder/'result.json').read_text())
        checkpoint=json.loads((folder/'model-ready.json').read_text())
        summary=glb_summary(folder/'model.glb')
        if checkpoint.get('sha256')!=summary['sha256'] or checkpoint.get('bytes')!=summary['bytes'] or not (folder/'model.blend').is_file():
            raise ValueError('The actual output is missing a matching checkpoint or editable original.')
        if profile=='fast-draft-v1' and (list((folder/'review').glob('*.png')) or report.get('fast_profile')!='fast-draft-v1'):
            raise ValueError('FAST did not actually defer optional rendered review.')
        if profile=='standard-preview' and not list((folder/'review').glob('*.png')):
            raise ValueError('STANDARD preview lost its actual render output.')
        results.append({'profile':profile,'renderer_wall_seconds':seconds,'triangles':report['triangles'],
                        'texture_report':report.get('texture_quality',{}),'glb':summary,
                        'review_pngs':len(list((folder/'review').glob('*.png'))), 'input_sha256':scene_hash})
    if results[0]['triangles']!=results[1]['triangles']:
        raise ValueError('Fixture geometry differs; not a matched renderer comparison.')
    summary={'kind':'DETERMINISTIC_RENDERER_FIXTURE','sample_count_per_profile':1,'model':'rocket fixture, not the user knight',
             'host':platform.platform(),'cpu_count':os.cpu_count(),'blender_threads':2,
             'blender_version':subprocess.check_output([str(binary),'--version'],text=True).splitlines()[0],
             'includes':['Blender process startup','scene build','core GLB and blend export','optional review for standard'],
             'excludes':['AI planning','Codex orchestration','Oracle queue','container startup','network transfer','browser decode/render'],
             'ai_requests':0,'live_oracle_test':False,'target_120_seconds_verified':False,'runs':results}
    (output/'benchmark.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__=='__main__': main()
