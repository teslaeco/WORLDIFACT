"""Native whole-object TRELLIS.2 + independent Blender process.
Runtime/model bundle is installed and license-reviewed BEFORE paid deployment.
No download-on-request, no public demo, no external geometry API, no CPU fallback.
"""
from __future__ import annotations
import hashlib,json,math,os,re,signal,subprocess,sys,time
from pathlib import Path
from contracts import Rejected,QUALITY_REVISION
from storage import digest
from trellis_mit_patch import audit as verify_commercial_upstream_patch
MODEL='microsoft/TRELLIS.2-4B'
CODE_REVISION='75fbf0183001ed9876c8dbb35de6b68552ee08bd'
WEIGHTS_REVISION='af44b45f2e35a493886929c6d786e563ec68364d'
PARTS=('sparse_structure_decoder','sparse_structure_flow_model','shape_slat_decoder',
 'shape_slat_flow_model_512','shape_slat_flow_model_1024','tex_slat_decoder','tex_slat_flow_model_512','tex_slat_flow_model_1024')

class ExplicitMaskOnly:
    def __call__(self,*_,**__):raise Rejected('EXPLICIT_MASK_REQUIRED')
    def to(self,*_,**__):return self
    def cpu(self):return self

def inside(root,relative):
    if not isinstance(relative,str) or Path(relative).is_absolute():raise Rejected('INVALID_BUNDLE_PATH')
    path=(root/relative).resolve()
    if not path.is_relative_to(root.resolve()):raise Rejected('BUNDLE_PATH_ESCAPE')
    return path

def load_bundle(root):
    lock=json.loads((root/'worldifact-bundle.json').read_text())
    if lock.get('sourceRevision')!=CODE_REVISION or lock.get('modelRevision')!=WEIGHTS_REVISION or lock.get('dependencyLicensesReviewed') is not True:
        raise Rejected('BUNDLE_REVISION_OR_LICENSE_REVIEW_REQUIRED')
    files=lock.get('files')
    if not isinstance(files,dict) or not files:raise Rejected('BUNDLE_HASHES_REQUIRED')
    for relative,sha in files.items():
        path=inside(root,relative)
        if not isinstance(sha,str) or not re.fullmatch('[a-f0-9]{64}',sha) or not path.is_file() or digest(path)!=sha:
            raise Rejected('BUNDLE_FILE_HASH_MISMATCH')
    cfg=lock.get('pipelineConfig','pipeline.json')
    if cfg not in files:raise Rejected('UNHASHED_PIPELINE')
    config=json.loads(inside(root,cfg).read_text())
    prefixes=lock.get('modelPrefixes',{})
    if set(prefixes)!=set(PARTS):raise Rejected('MISSING_CHECKPOINT_PART')
    for key,value in prefixes.items():
        if value+'.json' not in files or value+'.safetensors' not in files:raise Rejected('UNHASHED_CHECKPOINT')
        config['args']['models'][key]=str(inside(root,value))
    directory=inside(root,lock.get('dinov3Directory'))
    members={str(p.relative_to(root)) for p in directory.rglob('*') if p.is_file()}
    if not members or not members.issubset(files):raise Rejected('UNHASHED_IMAGE_ENCODER')
    config['args']['image_cond_model']={'name':'DinoV3FeatureExtractor','args':{'model_name':str(directory)}}
    config['args']['rembg_model']={'name':'ExplicitMaskOnly','args':{}}
    return config

def prepare(reference,mask,max_resolution=1024):
    from PIL import Image
    if type(max_resolution) is not int or max_resolution not in (512,1024,1536):
        raise Rejected('INVALID_INPUT_RESOLUTION')
    with Image.open(reference) as im:rgba=im.convert('RGBA')
    with Image.open(mask) as im:alpha=im.convert('L')
    if rgba.size!=alpha.size:raise Rejected('MASK_SIZE_MISMATCH')
    box=alpha.point(lambda x:255 if x>204 else 0).getbbox()
    if box is None:raise Rejected('MASK_EMPTY')
    rgba.putalpha(alpha);left,top,right,bottom=box
    size=max(right-left,bottom-top);cx=(left+right)//2;cy=(top+bottom)//2
    rgba=rgba.crop((cx-size//2,cy-size//2,cx+(size+1)//2,cy+(size+1)//2))
    if size>max_resolution:rgba=rgba.resize((max_resolution,max_resolution),Image.Resampling.LANCZOS)
    image=Image.new('RGB',rgba.size,(0,0,0));image.paste(rgba,mask=rgba.getchannel('A'))
    return image

def inference_options(job):
    """Fixed reviewed profiles. No caller-supplied executable/sampler settings."""
    settings=job['settings']
    options={'pipeline_type':{512:'512',1024:'1024_cascade',1536:'1536_cascade'}[settings['resolution']]}
    if job.get('revision')==QUALITY_REVISION:
        if (settings['resolution'],settings['textureSize'],settings['targetFaces'])!=(1536,4096,1000000):
            raise Rejected('INVALID_QUALITY_PROFILE')
        # Guidance/rescale remain the pinned model defaults. More sampling steps
        # and a higher token budget are an experiment, not a likeness guarantee.
        options.update(sparse_structure_sampler_params={'steps':24},
                       shape_slat_sampler_params={'steps':24},
                       tex_slat_sampler_params={'steps':24},max_num_tokens=65536)
    return options

def resolution_evidence(requested,voxel_size):
    size=float(voxel_size)
    if not math.isfinite(size) or size<=0:raise Rejected('INVALID_DECODER_RESOLUTION')
    effective=round(1/size)
    if effective<=0 or effective>requested or not math.isclose(1/size,effective,rel_tol=1e-5):
        raise Rejected('INVALID_DECODER_RESOLUTION')
    return {'requestedResolution':requested,'effectiveResolution':effective,
            'resolutionReduced':effective!=requested}

def require_quality_memory(total_bytes):
    # A100 80GB cards report slightly different usable totals. Reject the 48GB
    # and smaller tiers before inference; this is not an OOM-free guarantee.
    if total_bytes<75_000_000_000:raise Rejected('QUALITY_CUDA_80GB_REQUIRED')

class NativeEngine:
    def __init__(self):self.pipeline=None
    def initialize(self):
        if self.pipeline is not None:return
        os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
        os.environ['HF_HUB_DISABLE_TELEMETRY']='1';os.environ['OPENCV_IO_ENABLE_OPENEXR']='1'
        import torch
        if not torch.cuda.is_available() or torch.cuda.get_device_properties(0).total_memory<24_000_000_000:
            raise Rejected('CUDA_24GB_REQUIRED')
        upstream=Path(os.environ['TRELLIS_CODE_DIR']).resolve();bundle=Path(os.environ['TRELLIS_BUNDLE_DIR'])
        # The image build applies exactly ONE reviewed MIT DRTK import patch to
        # the immutable Microsoft source. Never patch/download during inference.
        proof=verify_commercial_upstream_patch(upstream,apply=False)
        if proof['revision'] != CODE_REVISION:
            raise Rejected('UPSTREAM_REVISION_CHANGED')
        import importlib.util
        if (importlib.util.find_spec('drtk') is None
                or importlib.util.find_spec('nvdiffrast') is not None
                or importlib.util.find_spec('nvdiffrec_render') is not None):
            raise Rejected('COMMERCIAL_RASTERIZER_BUNDLE_NOT_VERIFIED')
        config=load_bundle(bundle)
        sys.path.insert(0,str(upstream.resolve()))
        from trellis2.pipelines import Trellis2ImageTo3DPipeline,rembg
        rembg.ExplicitMaskOnly=ExplicitMaskOnly
        import tempfile
        with tempfile.TemporaryDirectory(prefix='worldifact-config-') as tmp:
            p=Path(tmp);(p/'pipeline.json').write_text(json.dumps(config))
            pipeline=Trellis2ImageTo3DPipeline.from_pretrained(str(p),config_file='pipeline.json')
        pipeline.cuda();self.pipeline=pipeline
    def __call__(self,reference,mask,job,out,preserve):
        self.initialize()
        import numpy as np
        import torch
        import o_voxel
        s=job['settings'];options=inference_options(job)
        quality=job.get('revision')==QUALITY_REVISION
        if quality:require_quality_memory(torch.cuda.get_device_properties(0).total_memory)
        image=prepare(reference,mask,1536 if quality else 1024)
        out.mkdir(parents=True,exist_ok=False)
        # Astra plan is recorded as review criteria. This engine's conditioning is
        # image-only: do not pretend description text directly controls its mesh.
        with torch.inference_mode():
            mesh=self.pipeline.run(image,seed=s['seed'],preprocess_image=False,**options)[0]
        arrays={k:getattr(mesh,k).detach().cpu().numpy() for k in ('vertices','faces','coords','attrs')}
        if len(arrays['faces'])<4 or not all(np.isfinite(a).all() for a in arrays.values()):raise Rejected('INVALID_DECODER_OUTPUT')
        if arrays['faces'].min()<0 or arrays['faces'].max()>=len(arrays['vertices']):raise Rejected('INVALID_FACE_INDICES')
        layout={k:[v.start,v.stop,v.step] for k,v in mesh.layout.items()}
        np.savez_compressed(out/'decoder.npz',**arrays)
        origin=mesh.origin.detach().cpu().tolist()
        report={'geometryEngine':MODEL,'codeRevision':CODE_REVISION,'weightsRevision':WEIGHTS_REVISION,
            'sourceSha256':job['reference']['sha256'],'maskSha256':job['mask']['sha256'],
            'rawTriangles':len(arrays['faces']),'decoderSha256':digest(out/'decoder.npz'),
            'origin':origin,'voxelSize':float(mesh.voxel_size),'voxelShape':list(mesh.voxel_shape),'layout':layout,
            **resolution_evidence(s['resolution'],mesh.voxel_size),
            'settings':s.copy(),'inferenceOptions':options,'conditioningImageSize':list(image.size),
            'imageEncoderResolutions':[512,1024] if s['resolution']!=512 else [512],
            'exportGeometryPolicy':'RAW_DECODER_PRESERVED; GLB_SIMPLIFIED_AND_TOPOLOGY_CLEANED',
            'planUsedFor':'REVIEW_CRITERIA_NOT_TEXT_CONDITIONING','printReady':False,'visualAccepted':False}
        (out/'engine.json').write_text(json.dumps(report,indent=2)+'\n')
        preserve(out/'decoder.npz');preserve(out/'engine.json')
        # Native decoder checkpoint is durable before UV baking/simplification.
        mesh.simplify(16777216)
        glb=o_voxel.postprocess.to_glb(vertices=mesh.vertices,faces=mesh.faces,attr_volume=mesh.attrs,
            coords=mesh.coords,attr_layout=mesh.layout,voxel_size=mesh.voxel_size,
            aabb=[[-.5,-.5,-.5],[.5,.5,.5]],decimation_target=s['targetFaces'],
            texture_size=s['textureSize'],remesh=False,verbose=False)
        glb.export(str(out/'original.glb'),extension_webp=False)
        preserve(out/'original.glb')
        return report

EXPORT_CHECKPOINTS={'game.glb','source.blend','scene-report.json','qa.initial.json','qa.json'} | {
    kind+'_'+view+'.png' for kind in ('pbr','clay') for view in ('front','three_quarter','side','back')}

def _stop_process(process):
    if process.poll() is not None:return
    try:os.killpg(process.pid,signal.SIGTERM)
    except ProcessLookupError:
        process.wait(timeout=5);return
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)

def blender(source,out,seconds,preserve=None,profile=None):
    if profile is not None and (profile not in ('robot','halloween') or preserve is None):
        raise Rejected('INVALID_OWNER_EXPORT_PROFILE')
    binary=Path(os.environ.get('BLENDER_BIN','/opt/blender/blender'))
    if not binary.is_absolute() or not binary.is_file():raise Rejected('BLENDER_RUNTIME_MISSING')
    out.mkdir(parents=True,exist_ok=False)
    command=[str(binary),'--background','--factory-startup','--disable-autoexec','--python-exit-code','3',
        '--threads','2','--python',str(Path(__file__).with_name('blender_export.py')),'--',str(source),str(out)]
    if preserve is None:
        subprocess.run(command,check=True,timeout=seconds,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        return
    command.append('--checkpoint-acks')
    if profile is not None:command.append('--owner-profile='+profile)
    end=time.monotonic()+seconds;done=set();checkpoint_dir=out/'.checkpoints'
    process=subprocess.Popen(command,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
    try:
        while True:
            if time.monotonic()>=end:raise subprocess.TimeoutExpired(command,seconds)
            if checkpoint_dir.exists():
                if checkpoint_dir.is_symlink():raise Rejected('INVALID_EXPORT_CHECKPOINT')
                for marker in sorted(checkpoint_dir.glob('*.ready')):
                    name=marker.name[:-6]
                    if name in done:continue
                    if name not in EXPORT_CHECKPOINTS or marker.is_symlink() or marker.stat().st_size>2048:
                        raise Rejected('INVALID_EXPORT_CHECKPOINT')
                    data=json.loads(marker.read_text());path=out/name
                    if (set(data)!= {'filename','bytes','sha256'} or data['filename']!=name or
                        path.is_symlink() or not path.is_file() or type(data['bytes']) is not int or
                        data['bytes']!=path.stat().st_size or data['sha256']!=digest(path)):
                        raise Rejected('EXPORT_CHECKPOINT_MISMATCH')
                    preserve(path)
                    if time.monotonic()>=end:raise subprocess.TimeoutExpired(command,seconds)
                    # Acknowledge only after the durable callback returned. The
                    # renderer cannot proceed to the next expensive stage first.
                    (checkpoint_dir/(name+'.ack')).write_bytes(b'persisted\n')
                    done.add(name)
            result=process.poll()
            if result is not None:
                if result:raise subprocess.CalledProcessError(result,command)
                if done!=EXPORT_CHECKPOINTS:raise Rejected('EXPORT_CHECKPOINTS_MISSING')
                return
            time.sleep(min(.2,max(0,end-time.monotonic())))
    finally:
        _stop_process(process)
