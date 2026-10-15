#!/usr/bin/env python3
"""Prepare immutable user-authorized ECOMECH image for open-source CPU reconstruction.

Foreground annotation is a deliberately coarse human DRAFT, not SAM output.
The exact image bytes and decoded pixels are SHA-bound; any mismatch hard fails.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SOURCE_SHA='9f3b9a994315c0578859486a1c9dc17c8916316ba9e96300409772a1b8f5e053'
RGB_SHA='3d601608694b61932ccf11a4e0eff979f49e0c08c2a20e161c117f8e10126508'

def prepare(source:Path,annotation:Path,output:Path):
    raw=source.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=SOURCE_SHA:
        raise ValueError('SOURCE_PHOTO_SHA_MISMATCH')
    with Image.open(io.BytesIO(raw)) as im:
        if im.format!='PNG' or im.size!=(1122,1402):
            raise ValueError('SOURCE_PHOTO_DIMENSIONS_MISMATCH')
        rgb=im.convert('RGB')
    if hashlib.sha256(rgb.tobytes()).hexdigest()!=RGB_SHA:
        raise ValueError('VISIBLE_REFERENCE_PIXELS_MISMATCH')
    record=json.loads(annotation.read_text())
    if record.get('purpose')!='ANNOTATION_DRAFT_NOT_RELEASE_APPROVED' or record.get('sourceImageOriginalSha256')!=SOURCE_SHA:
        raise ValueError('REFERENCE_MASK_NOT_PINNED')
    width,height=rgb.size
    mask=Image.new('L',(width*2,height*2),0)
    pen=ImageDraw.Draw(mask)
    for name in ('robotOutline','chiliOutline'):
        pts=record['parts'][name]
        if not isinstance(pts,list) or len(pts)<15 or any(len(pt)!=2 or not all(isinstance(v,(int,float)) and 0<=v<=1 for v in pt) for pt in pts):
            raise ValueError('INVALID_HUMAN_DRAFT_SEGMENT')
        pen.polygon([(round(x*width*2),round(y*height*2)) for x,y in pts],fill=255)
    mask=mask.resize((width,height),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.65))
    neutral=Image.new('RGB',rgb.size,(128,128,128))
    neutral.paste(rgb,(0,0),mask)
    crop=(int(.067*width),0,int(.88*width),int(.965*height))
    fitted=ImageOps.contain(neutral.crop(crop),(480,480),Image.Resampling.LANCZOS)
    canvas=Image.new('RGB',(512,512),(128,128,128))
    canvas.paste(fitted,((512-fitted.width)//2,(512-fitted.height)//2))
    output.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(output)
    return {'inputOriginalSha256':SOURCE_SHA,'inputPngSha256':hashlib.sha256(output.read_bytes()).hexdigest(),
      'inputDimensions':[512,512],'mask':'HUMAN_DRAFT_NOT_GROUNDED_NEURAL_SEGMENTATION',
      'sourceImageSharedToThirdParty':False,'preprocessingCostsUsd':0}
if __name__=='__main__':
    a=argparse.ArgumentParser()
    a.add_argument('--image',type=Path,required=True)
    a.add_argument('--annotation',type=Path,required=True)
    a.add_argument('--output',type=Path,required=True)
    v=a.parse_args()
    print(json.dumps(prepare(v.image,v.annotation,v.output)))
