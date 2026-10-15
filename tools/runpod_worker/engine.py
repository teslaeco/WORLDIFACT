"""Native whole-object TRELLIS.2 + independent Blender process.
Runtime/model bundle is installed and license-reviewed BEFORE paid deployment.
No download-on-request, no public demo, no external geometry API, no CPU fallback.
"""
from __future__ import annotations
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
from contracts import Rejected
from storage import digest
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

def prepare(reference,mask):
    from PIL import Image
    with Image.open(reference) as im:rgba=im.convert('RGBA')
    with Image.open(mask) as im:alpha=im.convert('L')
    if rgba.size!=alpha.size:raise Rejected('MASK_SIZE_MISMATCH')
    box=alpha.point(lambda x:255 if x>204 else 0).getbbox()
    if box is None:raise Rejected('MASK_EMPTY')
    rgba.putalpha(alpha);left,top,right,bottom=box
    size=max(right-left,bottom-top);cx=(left+right)//2;cy=(top+bottom)//2
    rgba=rgba.crop((cx-size//2,cy-size//2,cx+(size+1)//2,cy+(size+1)//2))
    if size>1024:rgba=rgba.resize((1024,1024),Image.Resampling.LANCZOS)
    image=Image.new('RGB',rgba.size,(0,0,0));image.paste(rgba,mask=rgba.getchannel('A'))
    return image

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
        # Trust only the operator-selected image path, not a global safe.directory=* exception.
        git=['git','-c',f'safe.directory={upstream}','-C',str(upstream)]
        code=subprocess.check_output(git+['rev-parse','HEAD'],text=True,timeout=10).strip()
        if code!=CODE_REVISION:raise Rejected('UPSTREAM_REVISION_CHANGED')
        subprocess.run(git+['diff','--exit-code','HEAD','--'],check=True,timeout=10,capture_output=True)
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
        image=prepare(reference,mask);s=job['settings']
        out.mkdir(parents=True,exist_ok=False)
        # Astra plan is recorded as review criteria. This engine's conditioning is
        # image-only: do not pretend description text directly controls its mesh.
        with torch.inference_mode():
            mesh=self.pipeline.run(image,seed=s['seed'],preprocess_image=False,
                pipeline_type={512:'512',1024:'1024_cascade',1536:'1536_cascade'}[s['resolution']])[0]
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

def blender(source,out,seconds):
    binary=Path(os.environ.get('BLENDER_BIN','/opt/blender/blender'))
    if not binary.is_absolute() or not binary.is_file():raise Rejected('BLENDER_RUNTIME_MISSING')
    out.mkdir(parents=True,exist_ok=False)
    subprocess.run([str(binary),'--background','--factory-startup','--disable-autoexec','--python-exit-code','3',
        '--threads','2','--python',str(Path(__file__).with_name('blender_export.py')),'--',str(source),str(out)],
        check=True,timeout=seconds,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
