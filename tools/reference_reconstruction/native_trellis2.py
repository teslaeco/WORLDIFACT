"""WORLDIFACT native GPU adapter, not an image-to-old-mesh projection.
Requires an operator-prepared, licensed local checkpoint bundle and an already
available GPU. No cloud rental, implicit download, provider fallback or billing.
Production integration remains disabled until real inference and visual QA pass.
"""
from __future__ import annotations
import argparse,json,os,platform,re,signal,subprocess,sys,time
from pathlib import Path
from core import MODEL_ID,MODEL_REVISION,SOURCE_REVISION,prepare_input,digest,inspect_glb,validate_job

# Must be set BEFORE importing torch/transformers/the upstream pipeline.
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['OPENCV_IO_ENABLE_OPENEXR']='1'
MODELS=('sparse_structure_decoder','sparse_structure_flow_model','shape_slat_decoder',
 'shape_slat_flow_model_512','shape_slat_flow_model_1024','tex_slat_decoder',
 'tex_slat_flow_model_512','tex_slat_flow_model_1024')

class ExplicitMaskOnly:
    """Never load BRIA weights or send images to a background-removal service."""
    def __call__(self,*args,**kwargs):raise RuntimeError('EXPLICIT_LOCAL_MASK_REQUIRED')
    def to(self,*args,**kwargs):return self
    def cpu(self):return self

def contained(root,relative):
    if not isinstance(relative,str) or Path(relative).is_absolute():raise ValueError('BUNDLE_PATH_INVALID')
    path=(root/relative).resolve()
    if not path.is_relative_to(root.resolve()):raise ValueError('BUNDLE_PATH_ESCAPE')
    return path

def validate_bundle(bundle):
    lock=json.loads((bundle/'worldifact-bundle.json').read_text())
    if lock.get('modelRevision')!=MODEL_REVISION or lock.get('sourceRevision')!=SOURCE_REVISION:
        raise ValueError('BUNDLE_REVISION_MISMATCH')
    if lock.get('dependencyLicensesReviewed') is not True:raise ValueError('DEPENDENCY_LICENSE_REVIEW_REQUIRED')
    files=lock.get('files',{})
    if not isinstance(files,dict) or not files:raise ValueError('BUNDLE_HASH_MANIFEST_REQUIRED')
    for name,sha in files.items():
        path=contained(bundle,name)
        if not re.fullmatch('[0-9a-f]{64}',str(sha)) or not path.is_file() or digest(path)!=sha:
            raise ValueError('BUNDLE_FILE_HASH_MISMATCH')
    config_path=lock.get('pipelineConfig','pipeline.json')
    if config_path not in files:raise ValueError('UNHASHED_CONFIG')
    config=json.loads(contained(bundle,config_path).read_text())
    prefixes=lock.get('modelPrefixes',{})
    if set(prefixes)!=set(MODELS):raise ValueError('MISSING_SHAPE_OR_TEXTURE_CHECKPOINT')
    for key,prefix in prefixes.items():
        for ext in ('.json','.safetensors'):
            if prefix+ext not in files:raise ValueError('UNHASHED_CHECKPOINT')
        config['args']['models'][key]=str(contained(bundle,prefix))
    feature=lock.get('dinov3Directory')
    directory=contained(bundle,feature)
    feature_files={str(p.relative_to(bundle)) for p in directory.rglob('*') if p.is_file()}
    if not feature_files or not feature_files.issubset(files):raise ValueError('UNHASHED_FEATURE_EXTRACTOR')
    config['args']['image_cond_model']={'name':'DinoV3FeatureExtractor','args':{'model_name':str(directory)}}
    config['args']['rembg_model']={'name':'ExplicitMaskOnly','args':{}}
    return config,lock

def hardware(cuda_available,total_bytes,system=None):
    reasons=[]
    if (system or platform.system())!='Linux':reasons.append('LINUX_REQUIRED')
    if not cuda_available:reasons.append('CUDA_GPU_NOT_AVAILABLE')
    if total_bytes<24_000_000_000:reasons.append('NOMINAL_24GB_VRAM_REQUIRED')
    return {'ready':not reasons,'blockers':reasons,'vramBytes':int(total_bytes),'minimumVramBytes':24_000_000_000}

def execute(source,mask,job_path,upstream,bundle,out,compute_authorized=False):
    job=validate_job(json.loads(job_path.read_text()))
    if not compute_authorized:raise ValueError('EXISTING_COMPUTE_AUTHORIZATION_REQUIRED')
    import torch
    total=torch.cuda.get_device_properties(0).total_memory if torch.cuda.is_available() else 0
    hw=hardware(torch.cuda.is_available(),total)
    if not hw['ready']:raise ValueError(','.join(hw['blockers']))
    sha=subprocess.check_output(['git','-C',str(upstream),'rev-parse','HEAD'],text=True,timeout=10).strip()
    if sha!=SOURCE_REVISION:raise ValueError('UPSTREAM_SOURCE_REVISION_CHANGED')
    subprocess.run(['git','-C',str(upstream),'diff','--exit-code','HEAD','--'],check=True,capture_output=True,timeout=10)
    config,lock=validate_bundle(bundle)
    # Unique output/claim before any expensive inference. No overwrites or retries.
    out.mkdir(parents=True,exist_ok=False)
    prepared=out/'input.png';input_evidence=prepare_input(source,mask,prepared,digest(mask))
    (out/'pipeline.json').write_text(json.dumps(config))
    report={'revision':'worldifact-native-trellis2-v1','job':job,'input':input_evidence,
      'geometryEngine':MODEL_ID,'checkpointRevision':MODEL_REVISION,'sourceRevision':SOURCE_REVISION,
      'hardware':hw,'state':'CLAIMED','providerInferenceCalls':0,'newOpenAIRequests':0,
      'computeCostUsd':None,'visualAccepted':False,'printReady':False,'retryAllowed':False}
    def save():(out/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
    save();start=time.monotonic()
    def expired(*_):raise TimeoutError('GPU_JOB_TIME_BUDGET_EXCEEDED')
    previous=signal.signal(signal.SIGALRM,expired);signal.alarm(900)
    try:
        sys.path.insert(0,str(upstream.resolve()))
        from trellis2.pipelines import Trellis2ImageTo3DPipeline,rembg
        import o_voxel,numpy as np,trimesh
        from PIL import Image
        rembg.ExplicitMaskOnly=ExplicitMaskOnly
        pipeline=Trellis2ImageTo3DPipeline.from_pretrained(str(out.resolve()),config_file='pipeline.json')
        pipeline.cuda();report['state']='INFERENCE';report['providerInferenceCalls']=1;save()
        outputs=pipeline.run(Image.open(prepared),seed=job['seed'],preprocess_image=False,
          pipeline_type={512:'512',1024:'1024_cascade',1536:'1536_cascade'}[job['resolution']])
        mesh=outputs[0]
        v=mesh.vertices.detach().cpu().numpy();f=mesh.faces.detach().cpu().numpy()
        if len(f)<4 or not np.isfinite(v).all():raise ValueError('INVALID_NATIVE_GEOMETRY')
        # Preserve decoder geometry BEFORE UV baking/decimation; no old V7 inputs.
        np.savez_compressed(out/'RAW_NEURAL_GEOMETRY.npz',vertices=v,faces=f)
        clay=trimesh.Trimesh(vertices=v,faces=f,process=False)
        clay.visual=trimesh.visual.ColorVisuals(mesh=clay,vertex_colors=[150,150,150,255])
        clay.export(out/'RAW_GEOMETRY_CLAY.glb')
        report['rawTriangles']=len(f);report['rawGeometrySha256']=digest(out/'RAW_NEURAL_GEOMETRY.npz');save()
        mesh.simplify(16777216)
        glb=o_voxel.postprocess.to_glb(vertices=mesh.vertices,faces=mesh.faces,
          attr_volume=mesh.attrs,coords=mesh.coords,attr_layout=mesh.layout,voxel_size=mesh.voxel_size,
          aabb=[[-.5,-.5,-.5],[.5,.5,.5]],decimation_target=job['decimation_target'],
          texture_size=job['texture_size'],remesh=False,verbose=True)
        glb.export(str(out/'ORIGINAL_PBR.glb'),extension_webp=False)
        report['glb']=inspect_glb(out/'ORIGINAL_PBR.glb')
        report['state']='GENERATED_UNREVIEWED_NOT_PRINT_READY'
    except Exception as e:
        report['state']='FAILED_OR_PARTIAL_DO_NOT_RETRY';report['errorType']=type(e).__name__
        raise
    finally:
        signal.alarm(0);signal.signal(signal.SIGALRM,previous)
        report['elapsedSeconds']=round(time.monotonic()-start,2);save()
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--preflight',action='store_true')
    for name in ('source','mask','job','upstream','bundle','out'):p.add_argument('--'+name,type=Path)
    p.add_argument('--compute-authorized',action='store_true');a=p.parse_args()
    if a.preflight:
        try:
            import torch
            available=torch.cuda.is_available();total=torch.cuda.get_device_properties(0).total_memory if available else 0
        except ImportError:available=False;total=0
        print(json.dumps(hardware(available,total)))
    else:
        if any(getattr(a,n) is None for n in ('source','mask','job','upstream','bundle','out')):p.error('All paths are required for execution')
        execute(a.source,a.mask,a.job,a.upstream,a.bundle,a.out,a.compute_authorized)
