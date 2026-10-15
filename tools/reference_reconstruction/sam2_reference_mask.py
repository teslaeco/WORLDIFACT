"""Local SAM2.1 masking of the intact original ECOMECH reference.
Removes background pixels only. Does NOT recolor the robot, reconstruct a mesh,
certify likeness, call a paid provider, or submit another TRELLIS task.
SAM2.1 is used as a segmentation specialist, not advertised as the newest 3D model.
"""
from __future__ import annotations
import argparse,hashlib,json,os,time
from pathlib import Path
from core import SOURCE_SHA,digest
MODEL='facebook/sam2.1-hiera-tiny'
REVISION='da4f09582a0488fcc80d5ec7c828062f6abc0d52'
WEIGHTS_SHA='48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7'
# Manually inspected original-image pixel coordinates, not automatically measured anatomy.
FOREGROUND=[(530,80),(491,224),(566,282),(648,355),(243,305),(348,272),
 (250,174),(306,363),(430,637),(655,704),(327,985),(731,1049),(265,1260),(800,1290)]
BACKGROUND=[(404,435),(401,489),(534,831),(521,981),(480,1143),
 (112,715),(932,626),(670,98),(418,57),(790,585)]
# Independent sampled pixels not provided to the model. Still a limited screen, not mask IoU.
BACKGROUND_HOLDOUT=[(398,457),(531,787),(509,909),(510,1060),(485,1200)]

def run(source:Path,out:Path):
    from PIL import Image
    import numpy as np
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import Sam2Model,Sam2Processor
    start=time.monotonic()
    if digest(source)!=SOURCE_SHA:raise ValueError('ORIGINAL_REFERENCE_SHA_MISMATCH')
    image=Image.open(source).convert('RGB')
    if image.size!=(1122,1402):raise ValueError('ORIGINAL_SIZE_CHANGED')
    os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
    os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
    weights=Path(hf_hub_download(MODEL,'model.safetensors',revision=REVISION,token=False))
    if digest(weights)!=WEIGHTS_SHA:raise ValueError('SEGMENTATION_WEIGHTS_SHA_MISMATCH')
    processor=Sam2Processor.from_pretrained(MODEL,revision=REVISION,token=False)
    model=Sam2Model.from_pretrained(MODEL,revision=REVISION,token=False,
      use_safetensors=True,torch_dtype=torch.float32).to('cpu').eval()
    torch.set_num_threads(4)
    points=FOREGROUND+BACKGROUND
    inputs=processor(images=image,input_points=[[points]],input_labels=[[[1]*len(FOREGROUND)+[0]*len(BACKGROUND)]],return_tensors='pt')
    with torch.inference_mode():outputs=model(**inputs,multimask_output=True)
    masks=processor.post_process_masks(outputs.pred_masks.cpu(),inputs['original_sizes'])[0][0].numpy().astype(bool)
    scores=outputs.iou_scores.detach().cpu().numpy().reshape(-1)
    out.mkdir(parents=True,exist_ok=False);candidates=[]
    for i,mask in enumerate(masks):
        fg=sum(bool(mask[y,x]) for x,y in FOREGROUND)
        bg=sum(bool(mask[y,x]) for x,y in BACKGROUND)
        holdout=sum(bool(mask[y,x]) for x,y in BACKGROUND_HOLDOUT)
        candidates.append({'index':i,'modelPredictedIoU':float(scores[i]),
          'foregroundAnchorsKept':fg,'backgroundAnchorLeaks':bg,'holdoutBackgroundLeaks':holdout,
          'foregroundFraction':float(mask.mean()),
          'passesAnchorScreen':fg==len(FOREGROUND) and bg==holdout==0 and .12<float(mask.mean())<.65})
        Image.fromarray(mask.astype('uint8')*255).save(out/f'candidate-mask-{i}.png')
    passing=[v for v in candidates if v['passesAnchorScreen']]
    chosen=max(passing,key=lambda v:v['modelPredictedIoU']) if passing else max(candidates,key=lambda v:v['modelPredictedIoU'])
    mask=masks[chosen['index']];alpha=Image.fromarray(mask.astype('uint8')*255)
    alpha.save(out/'mask.png')
    rgba=image.copy().convert('RGBA');rgba.putalpha(alpha);rgba.save(out/'original-rgb-masked.png')
    # Actual object RGB bytes remain unchanged; no color correction or synthesized pixels.
    assert np.array_equal(np.asarray(rgba)[:,:,:3],np.asarray(image))
    display=Image.new('RGB',image.size,(0,0,0));display.paste(image,mask=alpha);display.save(out/'mask-preview.png')
    report={'revision':'ecomech-sam21-reference-mask-v1','sourceSha256':SOURCE_SHA,
      'segmentationModel':MODEL,'modelRevision':REVISION,'weightsSha256':WEIGHTS_SHA,
      'license':'Apache-2.0, Meta SAM2.1 model; retain attribution',
      'execution':'LOCAL_CPU_INFERENCE_NO_IMAGE_UPLOAD','maskSha256':digest(out/'mask.png'),
      'originalRgbUnchanged':True,'foregroundAnchors':FOREGROUND,'backgroundAnchors':BACKGROUND,
      'backgroundHoldoutPixels':BACKGROUND_HOLDOUT,'candidates':candidates,'selectedIndex':chosen['index'],
      'anchorScreenPassed':chosen['passesAnchorScreen'],'humanFullMaskApproved':False,
      'new3DGenerationCalls':0,'newPaidApiCalls':0,'geometryQualityClaim':False,
      'elapsedSeconds':round(time.monotonic()-start,2)}
    (out/'mask-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)
    if not chosen['passesAnchorScreen']:raise ValueError('MASK_REQUIRES_REFINEMENT_NO_3D_SUBMISSION')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
    a=p.parse_args();run(a.source,a.out)
