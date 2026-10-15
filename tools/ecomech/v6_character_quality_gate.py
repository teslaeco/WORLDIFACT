#!/usr/bin/env python3
"""Independent reference-geometry QA for *existing* ECOMECH GLB bytes.

Not an AI quality model. Uses original-face 2D rasterization plus global 3D
thickness, semantic part names and actual glTF materials. Rejects impressive
triangle counts without an anatomically plausible volume and PBR textures.
No inference, remeshing, provider calls, or user/account writes.
"""
from __future__ import annotations
import argparse, hashlib, io, json, math, struct
from pathlib import Path

import cv2
import numpy as np
import trimesh

SOURCE_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
W,H=448,560
ESSENTIAL=frozenset({
    'helmet','chest','raised_arm_chili','right_arm_mechanics',
    'armored_left_leg','mechanical_right_leg'
})
MAX_GLB=48*1024*1024

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def gltf_info(raw):
    if not 28<=len(raw)<=MAX_GLB or len(raw)<20 or struct.unpack_from('<III',raw)!=(0x46546c67,2,len(raw)):
        raise ValueError('REAL_GLB_V2_REQUIRED')
    size,typ=struct.unpack_from('<II',raw,12)
    if size%4 or typ!=0x4e4f534a or size+28>len(raw):
        raise ValueError('GLB_JSON_CHUNK_INVALID')
    doc=json.loads(raw[20:20+size])
    if doc.get('asset',{}).get('version')!='2.0' or not doc.get('meshes'):
        raise ValueError('MESHES_AND_GLTF2_REQUIRED')
    for entry in doc.get('images',[])+doc.get('buffers',[]):
        if 'uri' in entry and not str(entry['uri']).startswith('data:'):
            raise ValueError('GLB_UNRESOLVED_EXTERNAL_RESOURCES')
    return doc

def reference_mask(path):
    record=json.loads(path.read_text())
    if record.get('purpose')!='ANNOTATION_DRAFT_NOT_RELEASE_APPROVED' or record.get('sourceImageOriginalSha256')!=SOURCE_SHA:
        raise ValueError('REFERENCE_ANNOTATION_NOT_FROM_ORIGINAL_IMAGE')
    mask=np.zeros((H,W),dtype=np.uint8)
    for name in ('robotOutline','chiliOutline'):
        pts=np.asarray(record['parts'][name],dtype=float)
        if pts.ndim!=2 or pts.shape[1]!=2 or len(pts)<15 or not np.isfinite(pts).all() or (pts<0).any() or (pts>1).any():
            raise ValueError('ANNOTATION_OUT_OF_BOUNDS')
        cv2.fillPoly(mask,[np.rint(pts*[W,H]).astype(np.int32)],255)
    return mask

def score_geometry(glb,source_manifest,annotation):
    raw=Path(glb).read_bytes()
    doc=gltf_info(raw)
    saved=json.loads(Path(source_manifest).read_text())
    if saved.get('sourceImageOriginalSha256')!=SOURCE_SHA or not saved.get('parts'):
        raise ValueError('MODEL_NOT_BOUND_TO_EXACT_REFERENCE')
    partinfo=saved['parts']
    byname={x.get('part'):x for x in partinfo}
    if set(byname)!=ESSENTIAL or any(x.get('triangles',0)<300 for x in partinfo):
        raise ValueError('SEMANTIC_NEURAL_PARTS_MISSING')
    if saved.get('outputSha256')!=sha(raw) or saved.get('geometryProvider','').find('TripoSR')<0:
        raise ValueError('EXACT_NEURAL_RESULT_PROVENANCE_CHANGED')
    scene=trimesh.load(io.BytesIO(raw),file_type='glb',force='scene',process=False)
    part_meshes={}
    mask=np.zeros((H,W),dtype=np.uint8)
    scale=np.array([W/1122,H/1402],dtype=float)
    for name in scene.geometry:
        geometry=scene.geometry[name]
        if len(geometry.faces)<10 or not np.isfinite(geometry.vertices).all():
            raise ValueError('MESH_EMPTY_OR_NONFINITE')
        # Naming must be independent, stable and unambiguous.
        part=name.removeprefix('NEURAL_')
        if part not in ESSENTIAL or part in part_meshes:
            raise ValueError('MESH_HAS_UNKNOWN_OR_DUPLICATE_PART')
        part_meshes[part]=geometry
        verts=np.asarray(geometry.vertices,dtype=np.float64)
        x=verts[:,0]/.00205+550
        y=1402-verts[:,1]/.00192
        xy=np.rint(np.column_stack([x,y])*scale).astype(np.int32)
        projected=xy[np.asarray(geometry.faces,dtype=np.int32)]
        # The full triangle rasterization exposes silhouette, not texturing.
        for off in range(0,len(projected),5000):
            cv2.fillPoly(mask,projected[off:off+5000],255)
    if set(part_meshes)!=ESSENTIAL:
        raise ValueError('ALL_SIX_ORIGINAL_NEURAL_PARTS_REQUIRED')
    actual_faces=sum(len(m.faces) for m in part_meshes.values())
    expected_faces=sum(int(x['triangles']) for x in partinfo)
    if actual_faces!=expected_faces:
        raise ValueError('FACE_COUNT_NOT_MATCHING_ORIGINAL_JOB_MANIFEST')
    xyz=np.vstack([m.vertices for m in part_meshes.values()])
    lo,hi=np.min(xyz,axis=0),np.max(xyz,axis=0)
    width,height,depth=float(hi[0]-lo[0]),float(hi[1]-lo[1]),float(hi[2]-lo[2])
    if height<=0: raise ValueError('INVALID_HUMANOID_HEIGHT')
    target=reference_mask(Path(annotation))
    i=np.count_nonzero((target>0)&(mask>0));u=np.count_nonzero((target>0)|(mask>0))
    iou=float(i/u) if u else 0.
    appearance_materials=len(doc.get('materials',[]))
    images=len(doc.get('images',[]))
    normal_mapped=sum(bool(m.get('normalTexture')) for m in doc.get('materials',[]))
    pbr_mapped=sum(bool(m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')) for m in doc.get('materials',[]))
    ratios={'widthOverHeight':round(width/height,5),'depthOverHeight':round(depth/height,5),
            'depthOverWidth':round(depth/width,5)}
    reasons=[]
    if depth/height<.15:reasons.append('FLATTENED_3D_DEPTH')
    if iou<.72:reasons.append('SOURCE_IMAGE_SILHOUETTE_MISMATCH_DRAFT')
    if not normal_mapped or not pbr_mapped or images<2:
        reasons.append('NO_EMBEDDED_NORMAL_AND_METALLIC_ROUGHNESS_PBR_TEXTURES')
    if scene.geometry and len(part_meshes)!=6:reasons.append('MISSING_SEMANTIC_PARTS')
    if doc.get('skins') is None or not doc['skins']:reasons.append('NO_SKINNED_RIG')
    # Even if all numeric checks pass, human front/3/4/side/back review is mandatory.
    reasons.append('REQUIRES_ORIGINAL_PHOTO_HUMAN_MULTIVIEW_REVIEW')
    return {
       'revision':'worldifact-ecomech-v6-geometric-qa-v1',
       'sourceImageSha256':SOURCE_SHA,'originalGLBSha256':sha(raw),
       'actualTriangles':actual_faces,'semanticParts':sorted(part_meshes),
       'bbox':{'min':lo.tolist(),'max':hi.tolist(),'size':[width,height,depth]},
       'ratios':ratios,'draftSilhouetteIoU':round(iou,5),
       'draftSilhouetteSource':'APPROX_MANUAL_ORIGINAL_IMAGE_NOT_CAMERA_SOLVED',
       'imageCount':images,'materialCount':appearance_materials,
       'normalMappedMaterials':normal_mapped,'metallicRoughnessMappedMaterials':pbr_mapped,
       'failures':reasons,'visualAccept':False,
       'premiumEligible':False,'manufacturingApproved':False,
       'provider':'TripoSR local CPU + WORLDIFACT assembly',
       'notAnAstraMesh':True,'newPaidRequests':0,'newCostUsd':0,
       'release':'NO_GO'}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--glb',type=Path,required=True)
    ap.add_argument('--manifest',type=Path,required=True)
    ap.add_argument('--annotation',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    a=ap.parse_args()
    report=score_geometry(a.glb,a.manifest,a.annotation)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(report,indent=2)+'\n')
    print('ECOMECH_V6_INDEPENDENT_QA',json.dumps({
      'faces':report['actualTriangles'],'draftIoU':report['draftSilhouetteIoU'],
      'depthRatio':report['ratios']['depthOverHeight'],
      'status':report['release'],'failed':report['failures']},ensure_ascii=False))
if __name__=='__main__': main()
