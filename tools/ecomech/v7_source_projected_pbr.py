#!/usr/bin/env python3
"""ECOMECH V7 source-projected PBR LOOKDEV only; never an original 360 reconstruction.

Every visible front-surface color comes from the exact owner-provided original
image; inherited volumetric six-part geometry is local MIT TripoSR output.
The source photograph contains baked lighting; inferred back surfaces, normals
and other 3D surfaces are NOT measured. Fails closed on input SHA, mesh count
and unresolved external GLB buffers. Explicit NO-GO for shop/MAKE/photorealism.
"""
from __future__ import annotations
import argparse, hashlib, json, struct
from pathlib import Path
import cv2
import numpy as np
import trimesh
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

SOURCE_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
V6_SHA='193ad27bd19ec94941b24222662024460d62758c7e2b0e53e7e55e51196f5970'
EXPECTED_PARTS={'NEURAL_helmet','NEURAL_chest','NEURAL_raised_arm_chili',
                'NEURAL_right_arm_mechanics','NEURAL_armored_left_leg','NEURAL_mechanical_right_leg'}

def digest(path:Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def segment_original(src:np.ndarray,annotation:dict)->np.ndarray:
    h,w=src.shape[:2]
    if (w,h)!=(1122,1402) or annotation.get('sourceImageOriginalSha256')!=SOURCE_SHA or annotation.get('purpose')!='ANNOTATION_DRAFT_NOT_RELEASE_APPROVED':
        raise ValueError('SOURCE_OR_DRAFT_ANNOTATION_MISMATCH')
    polygon=Image.new('L',(w*2,h*2),0);pen=ImageDraw.Draw(polygon)
    for part in ('robotOutline','chiliOutline'):
        coords=np.asarray(annotation['parts'][part],dtype=float)
        if len(coords)<15 or coords.ndim!=2 or coords.shape[1]!=2 or not np.isfinite(coords).all() or (coords<0).any() or (coords>1).any():
            raise ValueError('MALFORMED_DRAFT_FG_POLYGON')
        pen.polygon([(round(float(x)*w*2),round(float(y)*h*2)) for x,y in coords],fill=255)
    probable=np.asarray(polygon.resize((w,h),Image.Resampling.LANCZOS))>64
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13))
    interior=cv2.erode(probable.astype('uint8'),kernel,iterations=2).astype(bool)
    extended=cv2.dilate(probable.astype('uint8'),kernel,iterations=3).astype(bool)
    labels=np.where(extended,cv2.GC_PR_FGD,cv2.GC_BGD).astype('uint8')
    labels[~extended]=cv2.GC_BGD;labels[interior]=cv2.GC_FGD
    cv2.setRNGSeed(1)
    cv2.grabCut(cv2.cvtColor(src,cv2.COLOR_RGB2BGR),labels,None,np.zeros((1,65),np.float64),
                np.zeros((1,65),np.float64),5,cv2.GC_INIT_WITH_MASK)
    mask=np.isin(labels,[cv2.GC_PR_FGD,cv2.GC_FGD]).astype('uint8')*255
    return cv2.morphologyEx(mask,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5)))

def pbr_images(src:np.ndarray,mask:np.ndarray):
    photo=Image.fromarray(src,'RGB')
    base=ImageEnhance.Contrast(photo).enhance(.96)
    base=ImageEnhance.Color(base).enhance(1.10)
    base=Image.composite(base,Image.new('RGB',base.size,(16,20,25)),Image.fromarray(mask))
    gray=cv2.cvtColor(src,cv2.COLOR_RGB2GRAY).astype(np.float32)/255
    smooth=cv2.GaussianBlur(gray,(5,5),1.15)
    gx=cv2.Sobel(smooth,cv2.CV_32F,1,0,ksize=3)
    gy=cv2.Sobel(smooth,cv2.CV_32F,0,1,ksize=3)
    normals=np.stack([-gx*.38,-gy*.38,np.ones_like(gray)],axis=-1)
    normals/=np.maximum(np.linalg.norm(normals,axis=-1,keepdims=True),1e-6)
    normal=Image.fromarray(np.uint8(np.clip(normals*.5+.5,0,1)*255),'RGB')
    hsv=cv2.cvtColor(src,cv2.COLOR_RGB2HSV)
    colored=(hsv[:,:,0]>33)&(hsv[:,:,0]<110)&(hsv[:,:,1]>55)
    metallic=np.where(colored,210,238).astype('uint8'); metallic[mask<100]=30
    rough=np.clip((.36+cv2.GaussianBlur(np.abs(gx)+np.abs(gy),(5,5),0)*.22)*255,58,204).astype('uint8')
    rough[mask<100]=220
    mr=np.empty((*rough.shape,3),dtype='uint8')
    mr[:,:,0]=255;mr[:,:,1]=rough;mr[:,:,2]=metallic
    emission=np.zeros_like(src,dtype='uint8')
    leds=(((hsv[:,:,0]>=78)&(hsv[:,:,0]<=105)&(hsv[:,:,1]>=95)&(hsv[:,:,2]>155))|
          ((hsv[:,:,0]>=35)&(hsv[:,:,0]<=73)&(hsv[:,:,1]>=115)&(hsv[:,:,2]>210)))&(mask>100)
    emission[leds]=np.minimum(255,src[leds].astype('uint16')*.7).astype('uint8')
    return base,normal,Image.fromarray(mr,'RGB'),Image.fromarray(emission,'RGB')

def reconstruct(reference:Path,original_glb:Path,annotation:Path,output_dir:Path):
    if digest(reference)!=SOURCE_SHA or digest(original_glb)!=V6_SHA:
        raise ValueError('INPUT_ORIGINALS_NOT_SHA_PINNED_NO_RECONSTRUCTION')
    image=Image.open(reference).convert('RGB')
    if image.size!=(1122,1402):raise ValueError('INPUT_SOURCE_IMAGE_DIMENSIONS_CHANGED')
    photo=np.asarray(image)
    ann=json.loads(annotation.read_text())
    mask=segment_original(photo,ann)
    base,normal,mr,emission=pbr_images(photo,mask)
    _,nearest=distance_transform_edt(mask<128,return_indices=True)
    source_scene=trimesh.load(original_glb,force='scene',process=False)
    if set(source_scene.geometry)!=EXPECTED_PARTS or sum(len(m.faces) for m in source_scene.geometry.values())!=218450:
        raise ValueError('UNEXPECTED_ORIGINAL_SIX_PART_TRIANGLE_CONTENT')
    out=trimesh.Scene();parts=[]
    for key,original in source_scene.geometry.items():
        mesh=original.copy(); vertices=np.asarray(mesh.vertices,dtype='float64').copy()
        # Geometry is real but this Z expansion is a constrained lookdev experiment,
        # not inverse-rendered anatomy or a calibrated camera solution.
        factor=1.85 if key=='NEURAL_helmet' else 1.78 if 'leg' in key else 2.00
        vertices[:,2]*=factor
        px=vertices[:,0]/.00205+550
        py=1402-vertices[:,1]/.00192
        iy=np.clip(np.rint(py).astype('int32'),0,1401)
        ix=np.clip(np.rint(px).astype('int32'),0,1121)
        outside=mask[iy,ix]<128
        # Keep topology and contract the implausible overhanging foreground
        # toward original robot mask, preserving Z-depth and part separation.
        tx=nearest[1,iy,ix].astype('float64')
        ty=nearest[0,iy,ix].astype('float64')
        px[outside]=px[outside]*.02+tx[outside]*.98
        py[outside]=py[outside]*.02+ty[outside]*.98
        vertices[:,0]=(px-550)*.00205
        vertices[:,1]=(1402-py)*.00192
        mesh.vertices=vertices
        uv=np.clip(np.column_stack((px/1122,1-py/1402)),1e-5,1-1e-5)
        is_chili='chili' in key
        material=PBRMaterial(name='V7_PHOTO_PROJECTED_'+key,
           baseColorTexture=base,normalTexture=normal,metallicRoughnessTexture=mr,
           emissiveTexture=emission,emissiveFactor=(.35,.75,.90),
           baseColorFactor=(255,255,255,255),
           metallicFactor=.18 if is_chili else .80,roughnessFactor=1.0)
        mesh.visual=TextureVisuals(uv=uv,material=material)
        out.add_geometry(mesh,geom_name=key,node_name=key)
        parts.append({'part':key,'faces':int(len(mesh.faces)), 'localDepthMeters':round(float(mesh.bounds[1,2]-mesh.bounds[0,2]),5)})
    output_dir.mkdir(parents=True,exist_ok=True)
    path=output_dir/'ecomech-v7-projected-pbr-EXPERIMENTAL.glb'
    raw=out.export(file_type='glb')
    path.write_bytes(raw)
    size,typ=struct.unpack_from('<II',raw,12)
    if typ!=0x4E4F534A:raise ValueError('GLTF_JSON_CHUNK_MISSING')
    doc=json.loads(raw[20:20+size])
    report={
      'revision':'worldifact-ecomech-v7-source-projection-rd-v1',
      'originalReferencePngSha256':SOURCE_SHA,'sourceNeuralGlbSha256':V6_SHA,
      'outputGLBSha256':hashlib.sha256(raw).hexdigest(),
      'outputBytes':len(raw),'actualTriangles':sum(x['faces'] for x in parts),
      'partCount':len(parts),'parts':parts,
      'materials':len(doc.get('materials',[])),
      'embeddedImages':len(doc.get('images',[])),
      'normalMappedMaterials':sum(bool(x.get('normalTexture')) for x in doc.get('materials',[])),
      'metallicRoughnessMappedMaterials':sum(bool(x.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')) for x in doc.get('materials',[])),
      'bboxMeters':(out.bounds[1]-out.bounds[0]).tolist(),
      'imageSegmentation':'DRAFT_HUMAN_POLYGON_PLUS_GRABCUT',
      'materialProvenance':'OWNER_ORIGINAL_PHOTO_PROJECTED_ONTO_REAL_NEURAL_MESH; NORMAL/MR_INFERRED',
      'geometryProvenance':'ORIGINAL_OPEN_SOURCE_TRIPOSR_SIX_PART_CPU_MESH_PLUS_WARP',
      'actualOpenAI3DGeneration':False,
      'actualOpenAIPaidCalls':0,'actualExternalPaidVendorCalls':0,
      'rearSideGeometryVerified':False,'photoAccurateThreeQuarter':False,
      'photorealismCertified':False,'premiumShopEligible':False,'makeEligible':False,
      'qualityDecision':'NO_GO_REQUIRES_INDEPENDENT_MULTI_VIEW_SOURCES_AND_RECONSTRUCTION'}
    (output_dir/'provenance-and-qa.json').write_text(json.dumps(report,indent=2)+'\n')
    print('REAL_SOURCE_PROJECTED_GLB_NO_GO',json.dumps({k:report[k] for k in
          ('outputBytes','actualTriangles','materials','embeddedImages','qualityDecision')}),flush=True)
    return report

if __name__=='__main__':
    a=argparse.ArgumentParser()
    a.add_argument('--reference',required=True,type=Path)
    a.add_argument('--original-glb',required=True,type=Path)
    a.add_argument('--annotation',required=True,type=Path)
    a.add_argument('--out',required=True,type=Path)
    v=a.parse_args()
    reconstruct(v.reference,v.original_glb,v.annotation,v.out)
