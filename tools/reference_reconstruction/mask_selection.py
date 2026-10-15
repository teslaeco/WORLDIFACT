"""Reject masks erasing visible source armor even if sparse point checks pass.
Manually reviewed original-image regions are a limited screening set, NOT full
segmentation ground truth, an independent benchmark or 3D/print approval.
"""
from __future__ import annotations
import math
import numpy as np
PROTECTED_REGIONS={
 'exposed_forearm':(792,580,805,608),'blue_shin':(302,933,322,966),
 'green_ankle':(237,1105,260,1131),'heel_armor':(210,1180,235,1205),
 'front_foot':(206,1281,231,1305),'helmet_eye':(510,66,531,83),
 'shoulder_armor':(323,156,347,177),'raised_elbow':(219,387,237,410),
 'energy_core':(556,257,581,293),'leg_motor':(663,687,690,711),
 'pepper_surface':(298,385,313,402)}
MIN_REGION_KEEP=.95

def evaluate_masks(masks,candidates,foreground,background,holdout):
    if len(masks)!=len(candidates) or not masks or len(masks)>12:raise ValueError('MASK_CANDIDATE_COUNT_INVALID')
    rows=[]
    for index,(raw,candidate) in enumerate(zip(masks,candidates)):
        mask=np.asarray(raw)
        if mask.shape!=(1402,1122) or mask.dtype!=np.bool_:raise ValueError('ORIGINAL_SIZE_BOOLEAN_MASK_REQUIRED')
        if candidate.get('index')!=index:raise ValueError('CANDIDATE_ORDER_CHANGED')
        score=candidate.get('modelPredictedIoU')
        if isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score):raise ValueError('FINITE_MODEL_SCORE_REQUIRED')
        groups=(foreground,background,holdout)
        if any(not group for group in groups):raise ValueError('ANCHOR_GROUP_MISSING')
        for group in groups:
            for pair in group:
                if len(pair)!=2 or any(type(v) is not int for v in pair):raise ValueError('INVALID_ANCHOR')
                if not(0<=pair[0]<1122 and 0<=pair[1]<1402):raise ValueError('ANCHOR_OUTSIDE_SOURCE')
        fg=sum(bool(mask[y,x]) for x,y in foreground)
        bg=sum(bool(mask[y,x]) for x,y in background)
        gaps=sum(bool(mask[y,x]) for x,y in holdout)
        fraction=float(mask.mean())
        regions={name:float(mask[y0:y1,x0:x1].mean()) for name,(x0,y0,x1,y1) in PROTECTED_REGIONS.items()}
        failed=[name for name,value in regions.items() if value<MIN_REGION_KEEP]
        anchors_ok=fg==len(foreground) and bg==gaps==0 and .12<fraction<.65
        rows.append({**candidate,'index':index,'foregroundAnchorsKept':fg,
          'backgroundAnchorLeaks':bg,'holdoutBackgroundLeaks':gaps,'foregroundFraction':fraction,
          'passesAnchorScreen':anchors_ok,'protectedRegionRetention':regions,
          'failedProtectedRegions':failed,'passesIntegrityScreen':anchors_ok and not failed})
    eligible=[row for row in rows if row['passesIntegrityScreen']]
    # A model score can only rank masks AFTER source-content and background checks.
    selected=max(eligible,key=lambda row:(row['modelPredictedIoU'],-row['index'])) if eligible else None
    return selected,rows

def replay(source_dir,output_dir):
    """Read-only replay of EXISTING masks. Zero neural calls; inputs unchanged."""
    import hashlib,json
    from pathlib import Path
    from PIL import Image
    from core import SOURCE_SHA
    source_dir,output_dir=Path(source_dir),Path(output_dir)
    report=json.loads((source_dir/'mask-report.json').read_text())
    if report.get('sourceSha256')!=SOURCE_SHA or report.get('revision')!='ecomech-sam21-reference-mask-v3':raise ValueError('EXPECTED_SOURCE_BOUND_MASK_REPORT')
    rgba=Image.open(source_dir/'original-rgb-masked.png').convert('RGBA')
    if rgba.size!=(1122,1402):raise ValueError('SOURCE_SIZE_MISMATCH')
    rgb=rgba.convert('RGB')
    if hashlib.sha256(rgb.tobytes()).hexdigest()!='3d601608694b61932ccf11a4e0eff979f49e0c08c2a20e161c117f8e10126508':raise ValueError('ORIGINAL_RGB_CHANGED')
    masks=[np.asarray(Image.open(source_dir/f'candidate-mask-{i}.png'))>0 for i in range(len(report['candidates']))]
    chosen,rows=evaluate_masks(masks,report['candidates'],report['foregroundAnchors'],report['backgroundAnchors'],report['backgroundHoldoutPixels'])
    if chosen is None:raise ValueError('ALL_CANDIDATES_FAIL_SOURCE_INTEGRITY')
    output_dir.mkdir(parents=True,exist_ok=False)
    alpha=Image.fromarray(masks[chosen['index']].astype('uint8')*255)
    alpha.save(output_dir/'mask.png');rgba.putalpha(alpha);rgba.save(output_dir/'original-rgb-masked.png')
    view=Image.new('RGB',rgb.size,(0,0,0));view.paste(rgb,mask=alpha);view.save(output_dir/'mask-preview.png')
    receipt={'revision':'source-mask-integrity-replay-v1','sourceSha256':SOURCE_SHA,
      'previousSelectedIndex':report['selectedIndex'],'selectedIndex':chosen['index'],
      'maskSha256':hashlib.sha256((output_dir/'mask.png').read_bytes()).hexdigest(),
      'protectedRegions':PROTECTED_REGIONS,'minimumRegionRetention':MIN_REGION_KEEP,'candidates':rows,
      'originalRgbUnchanged':bool(np.array_equal(np.asarray(rgb),np.asarray(rgba)[:,:,:3])),
      'newInferenceCalls':0,'new3DCalls':0,'humanFullMaskApproved':False,
      'visual3DQualityApproved':False,'printReady':False}
    (output_dir/'selection-report.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({k:receipt[k] for k in ('previousSelectedIndex','selectedIndex','maskSha256','newInferenceCalls')}))
    return receipt

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--existing-masks',required=True);parser.add_argument('--out',required=True)
    args=parser.parse_args();replay(args.existing_masks,args.out)
