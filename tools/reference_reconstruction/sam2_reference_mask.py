"""Local SAM2.1 masking of the intact original ECOMECH reference.
Only alpha changes; no repainting, 3D generation, quota retry or geometry claims.
All prompt variants and loading diagnostics are preserved for honest review.
"""
from __future__ import annotations
import argparse,json,os,time
from pathlib import Path
from core import SOURCE_SHA,digest
MODEL='facebook/sam2.1-hiera-tiny'
REVISION='da4f09582a0488fcc80d5ec7c828062f6abc0d52'
WEIGHTS_SHA='48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7'
FOREGROUND=[(530,80),(491,224),(566,282),(648,355),(243,305),(348,272),
 (250,174),(306,363),(430,637),(655,704),(327,985),(731,1049),(265,1260),(800,1290)]
# Original pixel inspection: (790,585) touches the exposed forearm, and
# (401,489) is too near a protruding hip plate. They cannot label background.
BACKGROUND=[(404,435),(380,460),(534,831),(521,981),(480,1143),
 (112,715),(932,626),(670,98),(418,57),(970,520)]
BACKGROUND_HOLDOUT=[(398,457),(531,787),(509,909),(510,1060),(485,1200)]
BOX=[105,0,925,1370]

def point_inputs(foreground=FOREGROUND,background=BACKGROUND,size=(1122,1402)):
    """The processor requires lists at every image/object/point/coordinate level."""
    if not foreground or not background:raise ValueError('BOTH_FOREGROUND_AND_BACKGROUND_PROMPTS_REQUIRED')
    points=[]
    for pair in list(foreground)+list(background):
        if not isinstance(pair,(tuple,list)) or len(pair)!=2:raise ValueError('INVALID_POINT_PAIR')
        if any(type(v) is not int for v in pair):raise ValueError('INTEGER_PIXEL_COORDINATES_REQUIRED')
        x,y=pair
        if not 0<=x<size[0] or not 0<=y<size[1]:raise ValueError('POINT_OUTSIDE_ORIGINAL_IMAGE')
        points.append([x,y])
    if len({tuple(p) for p in points})!=len(points):raise ValueError('DUPLICATE_OR_CONTRADICTORY_PROMPT')
    return {'input_points':[[points]],'input_labels':[[[1]*len(foreground)+[0]*len(background)]]}

def run(source:Path,out:Path):
    from PIL import Image
    import numpy as np
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import Sam2Model,Sam2Processor
    from mask_selection import evaluate_masks,PROTECTED_REGIONS,MIN_REGION_KEEP
    start=time.monotonic()
    if digest(source)!=SOURCE_SHA:raise ValueError('ORIGINAL_REFERENCE_SHA_MISMATCH')
    image=Image.open(source).convert('RGB')
    if image.size!=(1122,1402):raise ValueError('ORIGINAL_SIZE_CHANGED')
    point_inputs(size=image.size)
    out.mkdir(parents=True,exist_ok=False)
    os.environ['HF_HUB_DISABLE_TELEMETRY']='1';os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
    torch.set_num_threads(4)
    weights=Path(hf_hub_download(MODEL,'model.safetensors',revision=REVISION,token=False))
    if digest(weights)!=WEIGHTS_SHA:raise ValueError('SEGMENTATION_WEIGHTS_SHA_MISMATCH')
    processor=Sam2Processor.from_pretrained(MODEL,revision=REVISION,token=False)
    model,loading=Sam2Model.from_pretrained(MODEL,revision=REVISION,token=False,
      use_safetensors=True,dtype=torch.float32,output_loading_info=True)
    model=model.to('cpu').eval()
    load_report={'missingKeys':loading.get('missing_keys',[]),'unexpectedKeys':loading.get('unexpected_keys',[]),
      'mismatchedKeys':loading.get('mismatched_keys',[]),'errorMessages':loading.get('error_msgs',[]),
      'config':model.config.to_dict(),'model':MODEL,'revision':REVISION,'weightsSha256':WEIGHTS_SHA}
    (out/'load-report.json').write_text(json.dumps(load_report,indent=2)+'\n')
    if any(load_report[k] for k in ('missingKeys','mismatchedKeys','errorMessages')):raise ValueError('SEGMENTATION_CHECKPOINT_NOT_FULLY_LOADED')
    masks_all=[];candidates=[];shape_records=[]
    variants=[('corrected_points',FOREGROUND,BACKGROUND,False),
      ('corrected_points_and_box',FOREGROUND,BACKGROUND,True),
      ('sparse_points_and_box',[FOREGROUND[i] for i in (0,1,4,8,9,10,11,12,13)],BACKGROUND,True)]
    for variant,fg_prompt,bg_prompt,boxed in variants:
        prompts=point_inputs(fg_prompt,bg_prompt,size=image.size)
        if boxed:prompts['input_boxes']=[[BOX]]
        inputs=processor(images=image,**prompts,return_tensors='pt')
        if tuple(inputs['input_points'].shape)!=(1,1,len(fg_prompt)+len(bg_prompt),2):raise ValueError('PROCESSOR_CHANGED_POINT_TENSOR_CONTRACT')
        shape_records.append({'variant':variant,'pointTensorShape':list(inputs['input_points'].shape),'box':BOX if boxed else None})
        with torch.inference_mode():outputs=model(**inputs,multimask_output=True)
        masks=processor.post_process_masks(outputs.pred_masks.cpu(),inputs['original_sizes'])[0][0].numpy().astype(bool)
        scores=outputs.iou_scores.detach().cpu().numpy().reshape(-1)
        if masks.ndim!=3 or masks.shape[1:]!=(1402,1122) or len(scores)!=len(masks) or not np.isfinite(scores).all():raise ValueError('SEGMENTATION_OUTPUT_CONTRACT_CHANGED')
        for local,mask in enumerate(masks):
            index=len(masks_all);masks_all.append(mask)
            candidates.append({'index':index,'variant':variant,'modelPredictedIoU':float(scores[local])})
            Image.fromarray(mask.astype('uint8')*255).save(out/f'candidate-mask-{index}.png')
    # Point matches alone allowed a mask that deleted foreground between anchors.
    # Region screening precedes score ranking and never fills/repaints missing pixels.
    chosen,candidates=evaluate_masks(masks_all,candidates,FOREGROUND,BACKGROUND,BACKGROUND_HOLDOUT)
    report={'revision':'ecomech-sam21-reference-mask-v4','sourceSha256':SOURCE_SHA,
      'segmentationModel':MODEL,'modelRevision':REVISION,'weightsSha256':WEIGHTS_SHA,
      'license':'Apache-2.0, Meta SAM2.1 model; retain attribution',
      'execution':'LOCAL_CPU_INFERENCE_NO_IMAGE_UPLOAD','inputContracts':shape_records,
      'foregroundAnchors':FOREGROUND,'backgroundAnchors':BACKGROUND,
      'annotationCorrections':[{'previous':[401,489],'replacement':[380,460],'reason':'ambiguous hip plate edge'},
        {'previous':[790,585],'replacement':[970,520],'reason':'prior background click was on exposed forearm'}],
      'protectedRegions':PROTECTED_REGIONS,'minimumRegionRetention':MIN_REGION_KEEP,
      'backgroundHoldoutPixels':BACKGROUND_HOLDOUT,'candidates':candidates,
      'selectedIndex':chosen['index'] if chosen else None,
      'anchorScreenPassed':bool(chosen),'integrityScreenPassed':bool(chosen),
      'humanFullMaskApproved':False,'new3DGenerationCalls':0,'newPaidApiCalls':0,'geometryQualityClaim':False,
      'elapsedSeconds':round(time.monotonic()-start,2)}
    if chosen is None:
        (out/'mask-report.json').write_text(json.dumps(report,indent=2)+'\n')
        raise ValueError('MASK_REQUIRES_REFINEMENT_NO_3D_SUBMISSION')
    mask=masks_all[chosen['index']];alpha=Image.fromarray(mask.astype('uint8')*255);alpha.save(out/'mask.png')
    rgba=image.copy().convert('RGBA');rgba.putalpha(alpha);rgba.save(out/'original-rgb-masked.png')
    if not np.array_equal(np.asarray(rgba)[:,:,:3],np.asarray(image)):raise ValueError('ORIGINAL_RGB_CHANGED')
    display=Image.new('RGB',image.size,(0,0,0));display.paste(image,mask=alpha);display.save(out/'mask-preview.png')
    report['maskSha256']=digest(out/'mask.png');report['originalRgbUnchanged']=True
    (out/'mask-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
    a=p.parse_args();run(a.source,a.out)
