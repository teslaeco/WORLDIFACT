"""Whole-object source contracts. No network, inference, recoloring or mesh warps."""
from __future__ import annotations
import hashlib, io, json, struct
from pathlib import Path
SOURCE_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
MODEL_ID='microsoft/TRELLIS.2-4B'
MODEL_REVISION='af44b45f2e35a493886929c6d786e563ec68364d'
SOURCE_REVISION='75fbf0183001ed9876c8dbb35de6b68552ee08bd'
SPACE_ID='microsoft/TRELLIS.2'
SPACE_REVISION='ebf60b20fc5a4607f90a1c11c0aab0ceeda5429d'
MAX_GLB=100*1024*1024

def digest(path:Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def prepare_input(source:Path,mask:Path,out:Path,expected_mask_sha:str):
    """Only mask and uniformly resize original RGB. Never assemble six reconstructions."""
    from PIL import Image
    if not source.is_file() or digest(source)!=SOURCE_SHA:raise ValueError('ORIGINAL_REFERENCE_SHA_MISMATCH')
    if len(expected_mask_sha)!=64 or not mask.is_file() or digest(mask)!=expected_mask_sha:raise ValueError('MASK_SHA_MISMATCH')
    with Image.open(source) as im:
        if im.size!=(1122,1402) or im.format!='PNG':raise ValueError('SOURCE_FORMAT_MISMATCH')
        rgba=im.convert('RGBA')
    with Image.open(mask) as im:
        if im.size!=rgba.size:raise ValueError('MASK_DIMENSION_MISMATCH')
        alpha=im.convert('L')
    if not .08<sum(alpha.histogram()[205:])/(rgba.width*rgba.height)<.90:raise ValueError('EMPTY_OR_BACKGROUND_ONLY_MASK')
    rgba.putalpha(alpha)
    bounds=alpha.point(lambda v:255 if v>204 else 0).getbbox()
    if bounds is None:raise ValueError('NO_FOREGROUND')
    x0,y0,x1,y1=bounds;size=max(x1-x0,y1-y0);cx=(x0+x1)//2;cy=(y0+y1)//2
    cropped=rgba.crop((cx-size//2,cy-size//2,cx+(size+1)//2,cy+(size+1)//2))
    if cropped.width>1024:cropped=cropped.resize((1024,1024),Image.Resampling.LANCZOS)
    image=Image.new('RGB',cropped.size,(0,0,0));image.paste(cropped,mask=cropped.getchannel('A'))
    out.parent.mkdir(parents=True,exist_ok=True);image.save(out)
    return {'sourceSha256':SOURCE_SHA,'maskSha256':expected_mask_sha,'inputSha256':digest(out),
      'inputDimensions':list(image.size),'method':'WHOLE_OBJECT_MASKED_CROP_NO_SPLIT_NO_RECOLOUR',
      'maskApproval':'DRAFT_HUMAN_POLYGON_PLUS_GRABCUT_NOT_VISUAL_APPROVAL'}

def inspect_glb(path:Path):
    """Count actual transformed triangles; no claim that valid glTF equals likeness."""
    import numpy as np
    import trimesh
    if path.stat().st_size>MAX_GLB:raise ValueError('OUTPUT_TOO_LARGE')
    raw=path.read_bytes()
    if len(raw)<28 or struct.unpack_from('<III',raw)!=(0x46546c67,2,len(raw)):raise ValueError('INVALID_GLB_CONTAINER')
    n,typ=struct.unpack_from('<II',raw,12)
    if typ!=0x4e4f534a or n%4 or n+28>len(raw):raise ValueError('INVALID_JSON_CHUNK')
    doc=json.loads(raw[20:20+n])
    if doc.get('asset',{}).get('version')!='2.0' or not doc.get('meshes'):raise ValueError('NO_MESH')
    for e in doc.get('images',[])+doc.get('buffers',[]):
        if 'uri' in e and not e['uri'].startswith('data:'):raise ValueError('EXTERNAL_GLB_RESOURCES')
    scene=trimesh.load(io.BytesIO(raw),file_type='glb',force='scene',process=False)
    triangles=0
    for node in scene.graph.nodes_geometry:
        transform,name=scene.graph[node];mesh=scene.geometry[name]
        if not isinstance(mesh,trimesh.Trimesh) or not np.isfinite(transform).all() or not np.isfinite(mesh.vertices).all():raise ValueError('NONFINITE_OR_NONTRIANGLE_SCENE')
        triangles+=len(mesh.faces)
    if triangles<4 or not np.isfinite(scene.bounds).all():raise ValueError('EMPTY_GEOMETRY')
    mats=doc.get('materials',[])
    return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'instantiatedTriangles':triangles,
      'meshDefinitions':len(doc['meshes']),'materials':len(mats),'images':len(doc.get('images',[])),
      'metallicRoughnessMaps':sum('metallicRoughnessTexture' in m.get('pbrMetallicRoughness',{}) for m in mats),
      'boundsNativeUnits':scene.bounds.tolist(),'visualAccepted':False,'printReady':False}

def validate_job(job):
    keys={'revision','source_sha256','seed','resolution','texture_size','decimation_target','engine'}
    if set(job)!=keys or job.get('revision')!='reference-reconstruction-v1':raise ValueError('INVALID_JOB')
    if job['source_sha256']!=SOURCE_SHA or job['engine']!='trellis2':raise ValueError('SOURCE_OR_ENGINE_CHANGED')
    if type(job['seed']) is not int or not 0<=job['seed']<2**31:raise ValueError('INVALID_SEED')
    if type(job['resolution']) is not int or job['resolution'] not in (512,1024,1536):raise ValueError('INVALID_RESOLUTION')
    if type(job['texture_size']) is not int or job['texture_size'] not in (2048,4096):raise ValueError('INVALID_TEXTURE_SIZE')
    if type(job['decimation_target']) is not int or not 100000<=job['decimation_target']<=500000:raise ValueError('INVALID_TARGET')
    return dict(job)

def supplier_release_decision(evidence):
    required=('identity_reviewed','clay_four_views_accepted','pbr_four_views_accepted','scale_confirmed',
      'watertight','self_intersections_checked','wall_thickness_checked','supports_slicer_accepted',
      'supplier_material_profile_confirmed','supplier_accepted')
    missing=[k for k in required if evidence.get(k) is not True]
    return {'eligibleForSupplierHandoff':not missing,'missingEvidence':missing,
      'automaticOrderAllowed':False,'physicalPrintVerified':False}
