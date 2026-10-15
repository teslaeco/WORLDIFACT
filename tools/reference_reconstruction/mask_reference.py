"""Prepare an explicit whole-object mask; no source pixel repainting or 3D warp."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from core import SOURCE_SHA,digest

def build(source,annotation,out):
    if digest(source)!=SOURCE_SHA:raise ValueError('SOURCE_SHA_MISMATCH')
    record=json.loads(annotation.read_text())
    if record.get('sourceImageOriginalSha256')!=SOURCE_SHA or record.get('purpose')!='ANNOTATION_DRAFT_NOT_RELEASE_APPROVED':raise ValueError('ANNOTATION_SHA_MISMATCH')
    with Image.open(source) as im:
        if im.size!=(1122,1402):raise ValueError('SOURCE_SIZE_MISMATCH')
        rgb=np.array(im.convert('RGB'))
    h,w=rgb.shape[:2];mask=Image.new('L',(w,h),0);draw=ImageDraw.Draw(mask)
    for k in ('robotOutline','chiliOutline'):
        p=np.asarray(record['parts'][k],float)
        if p.ndim!=2 or p.shape[1]!=2 or len(p)<15 or not np.isfinite(p).all() or (p<0).any() or (p>1).any():raise ValueError('MASK_COORDINATES_INVALID')
        draw.polygon([(round(x*w),round(y*h)) for x,y in p],fill=255)
    binary=np.array(mask)>128
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13))
    inner=cv2.erode(binary.astype('uint8'),kernel,iterations=2)>0
    outer=cv2.dilate(binary.astype('uint8'),kernel,iterations=3)>0
    labels=np.where(outer,cv2.GC_PR_FGD,cv2.GC_BGD).astype('uint8');labels[inner]=cv2.GC_FGD
    cv2.setRNGSeed(1)
    cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),labels,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
    binary=np.isin(labels,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype('uint8')*255
    out.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(binary).save(out)
    return {'sourceSha256':SOURCE_SHA,'maskSha256':digest(out),'method':'DRAFT_POLYGON_PLUS_GRABCUT'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--annotation',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();print(json.dumps(build(a.source,a.annotation,a.out)))
