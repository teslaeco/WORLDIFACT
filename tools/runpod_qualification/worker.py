"""One operator-only CUDA qualification. Never impersonates a customer/Astra job.

Injected as an exec-form command beside the immutable image. All model/runtime
code remains in that image. Original decoder and GLB/BLEND stay in private R2.
"""
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import tempfile
import threading
import time
import traceback

SAMPLE = Path('/opt/TRELLIS.2/assets/example_image/T.png')
SAMPLE_SHA = 'db468bad8a04f1474a8d68140c07501b013b3ec6124b911fb7852675d64c05ee'


def cuda_uv_acceptance():
    """Compare actual CUDA raster/interpolation with independent CPU math.

    Covers rectangular resolution, both winding orders, face identity, varying
    homogeneous W, attribute interpolation and empty pixels. Boundary pixels
    are excluded: this is not an assertion of bitwise nvdiffrast equivalence.
    """
    import numpy as np
    import torch
    from worldifact_drtk_uv import RasterizeCudaContext, rasterize, interpolate
    h, w = 64, 96
    ndc = np.array([[-.88,.8],[-.12,.7],[-.65,-.8],
                    [.1,.8],[.85,-.8],[.85,.7]], dtype=np.float32)
    homogeneous = np.array([.5,1.2,2.,.8,1.7,1.], dtype=np.float32)
    pos = np.column_stack((ndc * homogeneous[:,None], np.zeros(6), homogeneous))
    faces = np.array([[0,1,2],[3,4,5]], dtype=np.int32)
    attrs = np.arange(30, dtype=np.float32).reshape(6,5) / 30
    result,_ = rasterize(RasterizeCudaContext(),
        torch.tensor(pos[None],device='cuda',dtype=torch.float32),
        torch.tensor(faces,device='cuda'), [h,w])
    values,_ = interpolate(torch.tensor(attrs[None],device='cuda'),result,
                           torch.tensor(faces,device='cuda'))
    torch.cuda.synchronize()
    got, interpolated = result.cpu().numpy()[0], values.cpu().numpy()[0]
    y,x = np.mgrid[:h,:w]
    pixels = np.stack((2*(x+.5)/w-1, 1-2*(y+.5)/h),axis=-1)
    exterior = np.ones((h,w),dtype=bool)
    errors, counts = [], []
    for i,face in enumerate(faces):
        a,b,c = ndc[face].astype(np.float64)
        matrix = np.column_stack((a-c,b-c))
        first = (pixels-c) @ np.linalg.inv(matrix).T
        bary = np.concatenate((first,1-first.sum(axis=-1,keepdims=True)),axis=-1)
        inside = bary.min(axis=-1) > .03
        exterior &= bary.min(axis=-1) < -.03
        assert inside.sum() > 100, 'CPU_REFERENCE_TOO_SMALL'
        assert np.all(got[inside,3] == i+1), 'CUDA_FACE_OR_COVERAGE_MISMATCH'
        errors.append(float(np.abs(got[inside,:3]-bary[inside]).max()))
        errors.append(float(np.abs(interpolated[inside]-bary[inside]@attrs[face]).max()))
        counts.append(int(inside.sum()))
    assert exterior.sum() > 100 and np.all(got[exterior] == 0), 'CUDA_BACKGROUND_MISMATCH'
    assert np.all(interpolated[exterior] == 0), 'CUDA_BACKGROUND_ATTRIBUTE_LEAK'
    assert max(errors) < 5e-5, 'CUDA_BARYCENTRIC_OR_INTERPOLATION_MISMATCH'
    return {'status':'PASS','interiorPixels':counts,'backgroundPixels':int(exterior.sum()),
            'maximumAbsoluteError':max(errors),'edgeBitwiseEquivalenceClaimed':False}


def handler(event):
    from storage import S3Store, digest, validate_glb
    from engine import NativeEngine, blender
    from PIL import Image
    import torch
    run = os.environ['QUALIFICATION_ID']
    if event.get('input') != {'qualificationId':run}:
        return {'status':'REFUSED','reason':'OPERATOR_REQUEST_MISMATCH'}
    if time.time() > int(os.environ['QUALIFICATION_EXPIRES_AT']):
        return {'status':'REFUSED','reason':'OPERATOR_REQUEST_EXPIRED'}
    prefix = 'ops/runpod-qualification/' + run + '/'
    store = S3Store.from_env()
    if not store.create_json(prefix+'claim.json', {'qualificationId':run,'startedAt':time.time()}):
        return {'status':'REFUSED','reason':'ALREADY_CLAIMED_NO_AUTOMATIC_RETRY'}
    # Independent process deadline, in addition to Runpod's execution timeout.
    watchdog = threading.Timer(890, lambda: os._exit(124))
    watchdog.daemon = True
    watchdog.start()
    start = time.monotonic()
    proof = {'qualificationId':run,'status':'FAILED','stage':'CUDA',
             'image':os.environ['QUALIFICATION_IMAGE'],
             'probeSha256':os.environ['QUALIFICATION_PROBE_SHA'],
             'plannerUsed':False,'customerTrafficChanged':False,'artifacts':[]}
    try:
        assert torch.cuda.is_available(), 'CUDA_UNAVAILABLE'
        gpu = torch.cuda.get_device_properties(0)
        proof['gpu']={'name':gpu.name,'vramBytes':gpu.total_memory,
                      'torch':torch.__version__,'cuda':torch.version.cuda}
        proof['uvAcceptance']=cuda_uv_acceptance()
        proof['stage']='MODEL_AND_NATIVE_EXPORT'
        assert digest(SAMPLE)==SAMPLE_SHA, 'SAMPLE_IDENTITY_CHANGED'
        with tempfile.TemporaryDirectory(prefix='worldifact-qualification-') as temp:
            root=Path(temp)
            reference=root/'reference.png'; mask=root/'mask.png'
            with Image.open(SAMPLE) as im:
                assert im.mode=='RGBA', 'EXPLICIT_SAMPLE_MASK_MISSING'
                im.save(reference); im.getchannel('A').save(mask)
            def preserve(path):
                relative=path.relative_to(root).as_posix()
                mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
                proof['artifacts'].append(store.put_file(prefix+relative,path,mime))
            preserve(reference); preserve(mask)
            # NativeEngine's image-only input. No fabricated planner response,
            # no call to the customer handler or its provenance validator.
            job={'reference':{'sha256':digest(reference)},'mask':{'sha256':digest(mask)},
                 'settings':{'seed':42,'resolution':512,'textureSize':2048,'targetFaces':100000}}
            proof['engine']=NativeEngine()(reference,mask,job,root/'native',preserve)
            proof['originalGlb']=validate_glb(root/'native/original.glb')
            proof['stage']='BLENDER'
            remaining=min(240,int(870-(time.monotonic()-start)))
            assert remaining >= 30, 'INSUFFICIENT_BLENDER_BUDGET'
            blender(root/'native/original.glb',root/'blender',remaining)
            for path in sorted((root/'blender').rglob('*')):
                if path.is_file():
                    if path.suffix=='.glb':validate_glb(path)
                    preserve(path)
            assert (root/'blender/source.blend').is_file(), 'BLEND_MISSING'
            proof['status']='PASS';proof['stage']='COMPLETE'
    except Exception as error:
        proof['errorType']=type(error).__name__
        # Traceback locations only: never log arbitrary exception values or env.
        proof['errorFrames']=[{'file':Path(f.filename).name,'line':f.lineno,'function':f.name}
                              for f in traceback.extract_tb(error.__traceback__)[-12:]]
    finally:
        proof['elapsedSeconds']=round(time.monotonic()-start,3)
        store.create_json(prefix+'receipt.json',proof)
        watchdog.cancel()
    return proof


if __name__=='__main__':
    import runpod
    runpod.serverless.start({'handler':handler})
