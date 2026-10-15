#!/usr/bin/env python3
"""Experimental part-wise TripoSR reconstruction of the EXACT ECOMECH photo.

Each original input is a cropped, masked source image. Six separate true neural
meshes are saved and assembled into one GLB. No paid provider APIs or mock meshes.
This experiment remains NO-GO until multi-view geometry is visually reviewed.
"""
import argparse, hashlib, io, json, subprocess, sys, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageChops
import numpy as np
import trimesh

ORIGINAL = '9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
REGIONS = {
 'helmet':(409,0,748,262),
 'chest':(287,145,825,675),
 'raised_arm_chili':(125,18,470,555),
 'right_arm_mechanics':(625,160,925,805),
 'armored_left_leg':(111,565,567,1402),
 'mechanical_right_leg':(475,540,958,1402),
}
def crop_parts(source:Path,annotation:Path,out:Path):
    raw=source.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=ORIGINAL:raise ValueError('ORIGINAL_SOURCE_SHA_CHANGED')
    with Image.open(io.BytesIO(raw)) as im:
        if im.format!='PNG' or im.size!=(1122,1402):raise ValueError('ORIGINAL_SOURCE_DIMENSIONS_CHANGED')
        rgb=im.convert('RGB')
    ann=json.loads(annotation.read_text())
    if ann.get('sourceImageOriginalSha256')!=ORIGINAL or ann.get('purpose')!='ANNOTATION_DRAFT_NOT_RELEASE_APPROVED':
        raise ValueError('REFERENCE_ANNOTATION_NOT_APPROVED_OR_MUTATED')
    w,h=rgb.size
    alpha=Image.new('L',(w*2,h*2),0)
    pen=ImageDraw.Draw(alpha)
    for key in ('robotOutline','chiliOutline'):
        points=ann['parts'][key]
        if len(points)<15 or any(len(pt)!=2 or any(not (0<=v<=1) for v in pt) for pt in points):
            raise ValueError('REFERENCE_PART_COORDINATES_INVALID')
        pen.polygon([(round(x*w*2),round(y*h*2)) for x,y in points],fill=255)
    alpha=alpha.resize((w,h),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.6))
    inp=out/'inputs';inp.mkdir(parents=True,exist_ok=True)
    items={}
    for name,(left,top,right,bottom) in REGIONS.items():
        area=rgb.crop((left,top,right,bottom));mask=alpha.crop((left,top,right,bottom))
        edge=Image.new('L',area.size,0);p=ImageDraw.Draw(edge)
        padding=max(3,round(min(area.size)*.045))
        p.rounded_rectangle((padding,padding,area.width-padding,area.height-padding),radius=padding,fill=255)
        edge=edge.filter(ImageFilter.GaussianBlur(max(2,padding*.8)))
        mask=ImageChops.multiply(mask,edge)
        patch=Image.new('RGB',area.size,(128,128,128));patch.paste(area,(0,0),mask)
        fitted=ImageOps.contain(patch,(480,480),Image.Resampling.LANCZOS)
        final=Image.new('RGB',(512,512),(128,128,128))
        final.paste(fitted,((512-fitted.width)//2,(512-fitted.height)//2))
        path=inp/(name+'.png');final.save(path)
        items[name]={'bboxOriginal':[left,top,right,bottom],
          'inputSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    (inp/'parts.json').write_text(json.dumps({'sourceSha256':ORIGINAL,'partInputs':items,'segmentation':'HUMAN_DRAFT_NOT_AUTO_SAM'},indent=2)+'\n')
    return items

def run(source:Path,annotation:Path,code_dir:Path,model:Path,output:Path,resolution:int):
    parts=crop_parts(source,annotation,output)
    scene=trimesh.Scene()
    all_parts=[];started=time.monotonic()
    for name,meta in parts.items():
        current=output/'neural' / name;current.mkdir(parents=True,exist_ok=True)
        runner=[sys.executable,str(model),
          '--source',str(output/'inputs'/ (name+'.png')),
          '--source-sha256',meta['inputSha256'],
          '--repository',str(code_dir),
          '--output',str(current),'--resolution',str(resolution)]
        subprocess.run(runner,check=True,timeout=1200)
        path=current/'ecomech-v6-open-neural-original.glb'
        raw=path.read_bytes()
        if len(raw)<5000: raise RuntimeError('MISSING_ACTUAL_NEURAL_PART_'+name)
        mesh=trimesh.load(path,force='mesh',process=False)
        if len(mesh.faces)<400:raise RuntimeError('LOW_DETAIL_PART_'+name)
        p=np.asarray(mesh.vertices,dtype=np.float32)
        lo=p.min(axis=0);ext=np.maximum(p.max(axis=0)-lo,.00001)
        l,t,r,b=meta['bboxOriginal']
        mapped=p.copy()
        # Original open TripoSR X-axis is vertical; uncalibrated relative assembly.
        mapped[:,0]=((p[:,1]-lo[1])/ext[1]*(r-l)+l-550)*.00205
        mapped[:,1]=(1402-(t+(1-(p[:,0]-lo[0])/ext[0])*(b-t)))*.00192
        mapped[:,2]=(p[:,2]-p[:,2].mean())*(.28 if name=='helmet' else .42)
        mesh.vertices=mapped
        scene.add_geometry(mesh,geom_name='NEURAL_'+name,node_name='CHARACTER_PART_'+name)
        all_parts.append({'part':name,'triangles':int(len(mesh.faces)),
             'inputImageSha256':meta['inputSha256'],
             'rawNeuralSha256':hashlib.sha256(raw).hexdigest(),
             'assembledBounds':mesh.bounds.tolist()})
        print('ECOMECH_REAL_NEURAL_PART',name,len(mesh.faces),flush=True)
    output_model=output/'ecomech-v6-neural-parts-original.glb'
    scene.export(output_model)
    result={
      'revision':'worldifact-ecomech-neural-part-assembly-v1',
      'sourceImageOriginalSha256':ORIGINAL,
      'geometryProvider':'stabilityai/TripoSR — MIT OPEN SOURCE, six CPU passes',
      'generator':'WORLDIFACT own part-aware assembly',
      'claimAstraCreatedGeometry':False,'claimPhotorealistic':False,
      'partCount':len(all_parts),'parts':all_parts,
      'outputSha256':hashlib.sha256(output_model.read_bytes()).hexdigest(),
      'outputBytes':output_model.stat().st_size,
      'elapsedSeconds':round(time.monotonic()-started,2),
      'modelProvenance':'OPEN_SOURCE_NEURAL_CPU_AND_INTERNAL_PART_ASSEMBLY',
      'quality':'UNREVIEWED_VISUAL_NO_GO',
      'rigReady':False,'makeReady':False,
      'newOpenAIRequests':0,'externalPaidVendorRequests':0}
    (output/'assembly-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
    print('SIX_REAL_NEURAL_MESHES_READY',json.dumps({'parts':len(all_parts),'sha':result['outputSha256'],'elapsed':result['elapsedSeconds']}),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True,type=Path)
    ap.add_argument('--annotation',required=True,type=Path)
    ap.add_argument('--open-code',required=True,type=Path)
    ap.add_argument('--runner',required=True,type=Path)
    ap.add_argument('--out',required=True,type=Path)
    ap.add_argument('--resolution',type=int,choices=(128,144,160,192),default=144)
    args=ap.parse_args()
    run(args.source,args.annotation,args.open_code,args.runner,args.out,args.resolution)
