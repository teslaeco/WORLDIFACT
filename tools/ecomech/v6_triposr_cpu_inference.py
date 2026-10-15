#!/usr/bin/env python3
"""Open-source, MIT-licensed TripoSR single-image neural mesh inference (CPU only).

Not an OpenAI/Astra mesh, not a third-party paid API, not a guaranteed likeness.
Source revision and model license are recorded by the invoking GitHub workflow.
We shim CUDA-oriented torchmcubes with stock scikit-image for CPU marching cubes.
"""
import argparse, hashlib, json, os, resource, sys, time, types
from pathlib import Path
import numpy as np

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--repository',type=Path,required=True)
    parser.add_argument('--source-sha256',required=True)
    parser.add_argument('--resolution',type=int,choices=(128,144,160,192),default=160)
    a=parser.parse_args()
    if a.source.stat().st_size>5*1024*1024 or hashlib.sha256(a.source.read_bytes()).hexdigest()!=a.source_sha256:
        raise RuntimeError('MODEL_INPUT_FILE_SHA_NOT_PINNED')
    sys.path.insert(0,str(a.repository.resolve()))
    import torch
    import trimesh
    from PIL import Image
    from skimage.measure import marching_cubes as cpu_mc
    # CPU-only implementation: avoid compiling untrusted CUDA build wheels on a
    # standard public GitHub runner; keep the upstream API and mesh semantics.
    cpu=types.ModuleType('torchmcubes')
    def marching_cubes(volume, level):
        grid=np.asarray(volume.detach().cpu(),dtype=np.float32)
        verts,faces,_,_=cpu_mc(grid,level=float(level),allow_degenerate=False)
        return torch.as_tensor(np.ascontiguousarray(verts),dtype=torch.float32), \
          torch.as_tensor(np.ascontiguousarray(faces),dtype=torch.long)
    cpu.marching_cubes=marching_cubes
    sys.modules['torchmcubes']=cpu
    # Upstream utils imports rembg at module import; preprocessing was already
    # done off-line with SHA-pinned human draft mask so it is not called here.
    sys.modules['rembg']=types.ModuleType('rembg')

    from tsr.system import TSR
    torch.set_num_threads(4)
    os.environ['TOKENIZERS_PARALLELISM']='false'
    a.output.mkdir(parents=True,exist_ok=True)
    start=time.monotonic()
    model=TSR.from_pretrained('stabilityai/TripoSR',config_name='config.yaml',weight_name='model.ckpt')
    model.renderer.set_chunk_size(2048)
    model.to('cpu').eval()
    print('TRIPOSR_CPU_WEIGHTS_LOADED',round(time.monotonic()-start,2),flush=True)
    with Image.open(a.source) as raw:
        image=raw.convert('RGB').copy()
    with torch.inference_mode():
        codes=model([image],device='cpu')
        shape=model.extract_mesh(codes,True,resolution=a.resolution)
    if not shape or not isinstance(shape[0],trimesh.Trimesh):
        raise RuntimeError('OPEN_NEURAL_MODEL_NO_MESH')
    mesh=shape[0]
    if len(mesh.faces)<2000 or len(mesh.vertices)<1000 or not np.isfinite(mesh.vertices).all():
        raise RuntimeError('OPEN_NEURAL_MODEL_INSUFFICIENT_GEOMETRY')
    glb=a.output/'ecomech-v6-open-neural-original.glb'
    mesh.export(glb)
    output_bytes=glb.read_bytes()
    if output_bytes[:4]!=b'glTF' or not output_bytes:
        raise RuntimeError('OPEN_NEURAL_EXPORT_NOT_GLB')
    report={
     'revision':'ecomech-v6-opensource-inference-cpu-v1',
     'imageSha256':a.source_sha256,
     'openNeuralModel':'stabilityai/TripoSR',
     'openSourceCode':'VAST-AI-Research/TripoSR',
     'upstreamCommit':'107cefdc244c39106fa830359024f6a2f1c78871',
     'codeAndModelLicense':'MIT (retained attribution required)',
     'geometryProvider':'LOCAL_OPEN_SOURCE_TRIPOSR_CPU_INFERENCE',
     'aiDirector':'NONE',
     'astraGeneratedMesh':False,
     'referenceImageUsed':True,
     'meshBytes':len(output_bytes),
     'meshSha256':hashlib.sha256(output_bytes).hexdigest(),
     'triangles':int(len(mesh.faces)),
     'vertices':int(len(mesh.vertices)),
     'watertight':bool(mesh.is_watertight),
     'timeSeconds':round(time.monotonic()-start,2),
     'maxResidentKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
     'visualFidelity':'UNREVIEWED',
     'pbrVerified':False,
     'humanAccept':False,
     'finalRelease':'NO_GO',
     'makeReady':False,
     'newOpenAIApiSpendUsd':0,
     'newExternalVendorApiSpendUsd':0,
     'paidGenerationRequests':0,
    }
    (a.output/'inference.json').write_text(json.dumps(report,indent=2)+'\n')
    print('REAL_OPEN_NEURAL_GLB_EXPORT',json.dumps(report),flush=True)

if __name__=='__main__':
    main()
