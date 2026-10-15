"""Lossless decoder checkpoint + export-only recovery. No image/shape generation.
NPZ contains numeric arrays only; a separately pinned receipt hashes all bytes.
Export never downloads weights or invokes a model. GPU export consumes compute
and requires separate explicit authorization; this is not free inference.
"""
from __future__ import annotations
import argparse,hashlib,json,math,os,re,signal,time,zipfile
from pathlib import Path
import numpy as np
SOURCE_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
ARRAY_NAMES={'vertices','faces','coords','attrs'}
MAX_ARRAY_BYTES=1024**3
MAX_ARCHIVE_BYTES=MAX_ARRAY_BYTES+1024**2
LAYOUT={'base_color':[0,3],'metallic':[3,4],'roughness':[4,5],'alpha':[5,6]}

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1024**2),b''):h.update(b)
    return h.hexdigest()

def numeric(value):
    if hasattr(value,'detach'):value=value.detach().cpu().numpy()
    a=np.asarray(value)
    if a.dtype.kind not in 'fiu' or not np.isfinite(a).all():raise ValueError('FINITE_NUMERIC_ARRAY_REQUIRED')
    return a

def validate_arrays(arrays):
    if set(arrays)!=ARRAY_NAMES:raise ValueError('CHECKPOINT_ARRAY_SET_CHANGED')
    v,f,c,a=(numeric(arrays[k]) for k in ('vertices','faces','coords','attrs'))
    if v.ndim!=2 or v.shape[1]!=3 or len(v)<3 or v.dtype.kind!='f':raise ValueError('INVALID_VERTICES')
    if f.ndim!=2 or f.shape[1]!=3 or len(f)<1 or f.dtype.kind not in 'iu':raise ValueError('INVALID_FACES')
    if f.min()<0 or f.max()>=len(v):raise ValueError('FACE_INDEX_OUT_OF_BOUNDS')
    if c.ndim!=2 or c.shape[1]!=3 or c.dtype.kind not in 'iu' or len(c)<1 or c.min()<0:raise ValueError('INVALID_SPARSE_COORDINATES')
    if a.ndim!=2 or a.shape!=(len(c),6) or a.dtype.kind!='f':raise ValueError('INVALID_PBR_ATTRIBUTE_ARRAY')
    if sum(x.nbytes for x in (v,f,c,a))>MAX_ARRAY_BYTES:raise ValueError('CHECKPOINT_MEMORY_LIMIT')
    return dict(zip(('vertices','faces','coords','attrs'),(v,f,c,a)))

def validate_meta(meta):
    if meta.get('revision')!='worldifact-native-decoder-checkpoint-v1' or meta.get('sourceSha256')!=SOURCE_SHA:raise ValueError('CHECKPOINT_PROVENANCE_MISMATCH')
    for k in ('inputSha256','arraySha256','codeRevision','modelRevision'):
        width=40 if k.endswith('Revision') else 64
        if not re.fullmatch('[0-9a-f]{'+str(width)+'}',str(meta.get(k,''))):raise ValueError('INVALID_PROVENANCE_HASH')
    if meta.get('model')!='microsoft/TRELLIS.2-4B' or meta.get('layout')!=LAYOUT:raise ValueError('MODEL_OR_PBR_LAYOUT_CHANGED')
    origin=meta.get('origin');voxel=meta.get('voxelSize')
    if not isinstance(origin,list) or len(origin)!=3 or any(type(n) not in (float,int) or not math.isfinite(n) for n in origin):raise ValueError('INVALID_VOXEL_ORIGIN')
    if type(voxel) not in (float,int) or not math.isfinite(voxel) or voxel<=0:raise ValueError('INVALID_VOXEL_SIZE')
    if meta.get('units')!='MODEL_NATIVE_NOT_PRINT_MM':raise ValueError('UNVERIFIED_PHYSICAL_SCALE')

def save_checkpoint(mesh,destination,provenance):
    """Persist original geometry AND spatial PBR values before decimation."""
    arrays=validate_arrays({k:getattr(mesh,k) for k in ARRAY_NAMES})
    layout={k:[v.start,v.stop] for k,v in mesh.layout.items()}
    origin=numeric(mesh.origin).reshape(-1).tolist();root=Path(destination)
    if root.exists():raise FileExistsError('CHECKPOINT_MUST_NOT_BE_OVERWRITTEN')
    meta={'revision':'worldifact-native-decoder-checkpoint-v1',
      'sourceSha256':provenance['sourceSha256'],'inputSha256':provenance['inputSha256'],
      'model':provenance['model'],'modelRevision':provenance['modelRevision'],
      'codeRevision':provenance['codeRevision'],'layout':layout,'origin':origin,
      'voxelSize':float(mesh.voxel_size),'units':'MODEL_NATIVE_NOT_PRINT_MM',
      'arraySha256':'0'*64,'visualAccepted':False,'printReady':False,
      'arrayInfo':{k:{'shape':list(v.shape),'dtype':str(v.dtype)} for k,v in arrays.items()}}
    validate_meta(meta);root.mkdir(parents=True,exist_ok=False)
    partial=root/'decoder.npz.partial'
    with partial.open('xb') as f:
        np.savez_compressed(f,**arrays);f.flush();os.fsync(f.fileno())
    if partial.stat().st_size>MAX_ARCHIVE_BYTES:raise ValueError('ARCHIVE_SIZE_LIMIT')
    os.replace(partial,root/'decoder.npz');meta['arraySha256']=sha(root/'decoder.npz')
    partial=root/'checkpoint.json.partial'
    with partial.open('x',encoding='utf8') as f:
        json.dump(meta,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(partial,root/'checkpoint.json')
    return {'manifestSha256':sha(root/'checkpoint.json'),'arraySha256':meta['arraySha256'],
      'path':root.name,'geometryAndPbrPreserved':True,'visualAccepted':False,'printReady':False}

def load_checkpoint(root,expected_manifest_sha256):
    root=Path(root);manifest=root/'checkpoint.json';archive=root/'decoder.npz'
    if not re.fullmatch('[0-9a-f]{64}',str(expected_manifest_sha256)) or not manifest.is_file() or manifest.stat().st_size>1024**2:raise ValueError('PINNED_MANIFEST_REQUIRED')
    if sha(manifest)!=expected_manifest_sha256:raise ValueError('MANIFEST_HASH_MISMATCH')
    meta=json.loads(manifest.read_text());validate_meta(meta)
    if not archive.is_file() or archive.stat().st_size>MAX_ARCHIVE_BYTES or sha(archive)!=meta['arraySha256']:raise ValueError('CHECKPOINT_ARRAY_HASH_MISMATCH')
    with zipfile.ZipFile(archive) as z:
        members=z.infolist()
        if len(members)!=4 or {v.filename for v in members}!={k+'.npy' for k in ARRAY_NAMES}:raise ValueError('UNEXPECTED_NPZ_MEMBERS')
        if sum(v.file_size for v in members)>MAX_ARRAY_BYTES+65536:raise ValueError('UNCOMPRESSED_CHECKPOINT_SIZE_LIMIT')
        for item in members:
            with z.open(item) as f:
                version=np.lib.format.read_magic(f)
                if version==(1,0):shape,_,dtype=np.lib.format.read_array_header_1_0(f)
                elif version==(2,0):shape,_,dtype=np.lib.format.read_array_header_2_0(f)
                else:raise ValueError('UNSUPPORTED_NPY_VERSION')
                if dtype.hasobject or dtype.kind not in 'fiu':raise ValueError('UNSAFE_CHECKPOINT_DTYPE')
                nbytes=math.prod(shape)*dtype.itemsize
                if nbytes>MAX_ARRAY_BYTES or nbytes>item.file_size-f.tell():raise ValueError('NPY_SHAPE_SIZE_MISMATCH')
    with np.load(archive,allow_pickle=False) as z:arrays=validate_arrays({k:z[k] for k in z.files})
    if {k:{'shape':list(v.shape),'dtype':str(v.dtype)} for k,v in arrays.items()}!=meta['arrayInfo']:raise ValueError('ARRAY_LAYOUT_MISMATCH')
    return arrays,meta

def export_only(checkpoint,manifest_sha256,out,compute_authorized=False,texture_size=4096,target=500000):
    if not compute_authorized:raise ValueError('EXISTING_GPU_EXPORT_COMPUTE_AUTHORIZATION_REQUIRED')
    if texture_size not in (2048,4096) or type(target) is not int or not 100000<=target<=500000:raise ValueError('INVALID_EXPORT_PROFILE')
    arrays,meta=load_checkpoint(checkpoint,manifest_sha256)
    # No imports of pipeline.run, checkpoint download or image generation.
    import torch
    from native_trellis2 import hardware
    available=torch.cuda.is_available();total=torch.cuda.get_device_properties(0).total_memory if available else 0
    if not hardware(available,total)['ready']:raise ValueError('CUDA_EXPORT_DEVICE_UNAVAILABLE')
    import o_voxel
    from core import inspect_glb
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    report={'revision':'worldifact-export-only-recovery-v1','checkpointManifestSha256':manifest_sha256,
      'sourceSha256':meta['sourceSha256'],'inputSha256':meta['inputSha256'],
      'newGeometryGenerations':0,'exportComputeRequired':True,'computeCostUsd':None,
      'visualAccepted':False,'printReady':False,'state':'EXPORTING_EXISTING_DECODER_RESULT'}
    def save():
        temp=out/'export-receipt.json.tmp';temp.write_text(json.dumps(report,indent=2)+'\n')
        os.replace(temp,out/'export-receipt.json')
    save();start=time.monotonic()
    def expired(*_):raise TimeoutError('EXPORT_ONLY_DEADLINE')
    previous=signal.signal(signal.SIGALRM,expired);signal.alarm(600)
    try:
        tensors={k:torch.from_numpy(v.copy()).cuda() for k,v in arrays.items()}
        glb=o_voxel.postprocess.to_glb(vertices=tensors['vertices'].float(),faces=tensors['faces'].int(),
          attr_volume=tensors['attrs'].float(),coords=tensors['coords'].int(),
          attr_layout={k:slice(*v) for k,v in meta['layout'].items()},voxel_size=meta['voxelSize'],
          aabb=[[-.5,-.5,-.5],[.5,.5,.5]],decimation_target=target,texture_size=texture_size,remesh=False,verbose=True)
        glb.export(str(out/'RECOVERED_ORIGINAL_PBR.glb'),extension_webp=False)
        report['glb']=inspect_glb(out/'RECOVERED_ORIGINAL_PBR.glb');report['state']='EXPORTED_UNREVIEWED'
    except Exception as e:
        report['state']='EXPORT_FAILED_CHECKPOINT_RETAINED';report['errorType']=type(e).__name__;raise
    finally:
        signal.alarm(0);signal.signal(signal.SIGALRM,previous)
        report['elapsedSeconds']=round(time.monotonic()-start,2);save()
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',type=Path,required=True)
    p.add_argument('--manifest-sha256',required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--compute-authorized',action='store_true');a=p.parse_args()
    export_only(a.checkpoint,a.manifest_sha256,a.out,a.compute_authorized)
