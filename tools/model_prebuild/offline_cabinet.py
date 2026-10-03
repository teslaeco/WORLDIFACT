"""Genuine cabinet first-exec fixture; fixture Responses, never paid quality.

VM mode exercises real Codex/CodeMode/MCP/Blender and unchanged spend admission.
--blender-only is narrower local geometry verification; it cannot issue a CLI
verification receipt or stand in for the mandatory VM gate.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import uuid
from unittest.mock import patch


SYNTHETIC_JPEGS = ['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']


def references(folder):
    metadata=[]
    for i,encoded in enumerate(SYNTHETIC_JPEGS):
        raw=base64.b64decode(encoded)
        (folder/("reference-%d.jpg"%i)).write_bytes(raw)
        metadata.append({"name":"Synthetic reference %d"%i,"view":["front","side","back"][i],"sha256":hashlib.sha256(raw).hexdigest()})
    (folder/"reference-photos.json").write_text(json.dumps(metadata))
    return metadata


def references_unchanged(folder,metadata):
    return json.loads((folder/'reference-photos.json').read_text())==metadata and all(
        hashlib.sha256((folder/('reference-%d.jpg'%i)).read_bytes()).hexdigest()==entry['sha256'] for i,entry in enumerate(metadata))


def scene():
    mats=[{'name':name,'rgb':rgb,'pattern':'plain','roughness':.65,'metallic':.1,'emission':0}
          for name,rgb in [('steel',[.45,.48,.5]),('insulator',[.18,.19,.2]),('wire',[.1,.2,.6])]]
    parts=[]
    def box(name,c,s,material='steel'):
        parts.append({'kind':'box','name':name,'material':material,'center':c,'size':s,'rotation':[0,0,0]})
    box('backplate',[0,.12,1],[1.2,.04,2])
    for x in (-.62,.62):box('wall_'+str(x),[x,0,1],[.04,.3,2])
    for z in (0,2):box('cap_'+str(z),[0,0,z],[1.2,.3,.04])
    for z in (.55,1.35):
        parts.append({'kind':'extrusion','name':'rail_'+str(z),'material':'steel','cap_material':'steel',
          'center':[-.5,.02,z],'outline':[[0,0],[1,0],[1,.03],[.98,.03],[.98,.012],[.02,.012],[.02,.03],[0,.03]],
          'levels':[{'z':0,'scale':1,'offset':[0,0]},{'z':.04,'scale':1,'offset':[0,0]}]})
    # Real radial device housings with recessed central sockets and collars.
    for row,z in enumerate((.72,1.5)):
        for col,x in enumerate((-.36,-.12,.12,.36)):
            parts.append({'kind':'lathe','name':'device_%d_%d'%(row,col),'material':'insulator','center':[x,-.06,z],
                'profile':[[.05,0],[.08,0],[.08,.04],[.07,.05],[.07,.16],[.055,.18],[.035,.18],[.035,.12]],'sides':96})
    # Slotted ducts: physical body/back plus separated fingers leave real gaps.
    for side,x in enumerate((-.54,.54)):
        box('duct_back_'+str(side),[x,-.005,1],[.07,.025,1.7],'insulator')
        for i in range(9):box('duct_finger_%d_%d'%(side,i),[x,-.05,.25+i*.18],[.065,.07,.045],'insulator')
    for i in range(20):
        x=-.38+(i%10)*.084;z=.68 if i<10 else 1.46
        points=[[x,-.14,z],[x,-.17,z-.08],[x*.9,-.18,z-.14],[x*.9,-.19,z-.21],
                [x*.85,-.18,z-.27],[x*.85,-.16,z-.30]]
        parts.append({'kind':'tube','name':'cable_'+str(i),'material':'wire','points':points,'radii':[.009]*len(points),'sides':32})
    for i,(x,z) in enumerate(((-.55,.1),(.55,.1),(-.55,1.9),(.55,1.9))):
        parts.append({'kind':'lathe','name':'fastener_'+str(i),'material':'steel','center':[x,-.05,z],
                      'profile':[[.006,0],[.012,0],[.012,.012],[.018,.012],[.018,.02],[.006,.02]],'sides':64})
    box('small_label',[-.36,-.145,.8],[.025,.002,.025])
    views=[{'photo_index':i,'position':[0,-3,1],'target':[0,0,1],'up':[0,0,1],'projection':'orthographic',
            'vertical_span':2.2,'fov':.8,'regions':[{'part':'small_label','polygon':[[.30,.39],[.32,.39],[.32,.41],[.30,.41]]}]} for i in range(3)]
    return {'version':2,'name':'Synthetic electrical cabinet','subject_type':'object','materials':mats,'parts':parts,'reference_views':views}


def no_remote(event,args):
    if event=='socket.connect':
        address=args[1]
        if isinstance(address,tuple) and address[0] not in ('127.0.0.1','::1'):raise RuntimeError('Offline verification refused external network')


def programs():
    return [
        "const r=await tools.mcp__blender__get_modeling_contract({}); const c=JSON.parse(r.content.find(b=>b.type==='text').text); store('contract',c); "
        "if(!c.scene_schema.properties.parts || !c.edit_helpers)throw new Error('CONTRACT_MISSING'); "
        "const scene="+json.dumps(scene(),separators=(',',':'))+"; text(await tools.mcp__blender__build_model({scene_json:JSON.stringify(scene),expected_revision:0}));",
        "let n=0;for(const view of ['front','side','back','three-quarter']){const r=await tools.mcp__blender__inspect_render({view,expected_revision:1});for(const b of r.content||[]){if(b.type==='image'){image(b);n++;}}}text({cabinet_views:n});",
        "text(await tools.mcp__blender__finish_model({expected_revision:1,accepted:false,issues:['Scripted offline transport fixture; visual fidelity has not been assessed by a real model.'],summary:'Offline cabinet geometry and transport test only.'}));"
    ]


class Fixture:
    def __init__(self,runner,has_value):self.runner=runner;self.has_value=has_value;self.seen=[]
    def open(self,request,timeout):
        payload=json.loads(request.data);step=len(self.seen);self.seen.append(payload)
        if step:
            outputs=[x.get('output') for x in payload.get('input',[]) if x.get('type')=='custom_tool_call_output' and x.get('call_id')=='cabinet_'+str(step-1)]
            predicates=[lambda v:v.get('revision')==1 and v.get('completion_contract',{}).get('structural_passed') is True,
                        lambda v:v.get('cabinet_views')==4]
            if step>2 or not any(self.has_value(v,predicates[step-1]) for v in outputs):raise ValueError('Cabinet actual tool result missing.')
        namespace=next(ns for ns,t in self.runner.request_tools(payload) if t.get('name')=='exec')
        item={'id':'ctc_cabinet_'+str(step),'type':'custom_tool_call','status':'completed','call_id':'cabinet_'+str(step),
              'name':'exec','input':'// @exec: {"yield_time_ms":120000,"max_output_tokens":12000}\n'+programs()[step]}
        if namespace:item['namespace']=namespace
        response={'id':'resp_cabinet_'+str(step),'object':'response','created_at':1789170000,'status':'completed',
                  'model':self.runner.MODEL,'output':[item],'usage':{'input_tokens':100,'output_tokens':100,'total_tokens':200}}
        events=[{'type':'response.created','response':{**response,'status':'in_progress','output':[]}},
                {'type':'response.output_item.done','output_index':0,'item':item},{'type':'response.completed','response':response}]
        return io.BytesIO(''.join('data: '+json.dumps(e)+'\n\n' for e in events).encode())


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',required=True);parser.add_argument('--blender-only');parser.add_argument('--artifact-dir');args=parser.parse_args(argv)
    if args.artifact_dir and not args.blender_only: parser.error('--artifact-dir requires the local --blender-only mode')
    root=Path(args.source).resolve();sys.path.insert(0,str(root));sys.addaudithook(no_remote)
    import completion_policy as completion
    from runtime.scene_contract import parse_scene
    parsed=parse_scene(json.dumps(scene()),'Synthetic electrical cabinet')
    folder=root/'state/jobs'/str(uuid.uuid4());folder.mkdir(parents=True)
    metadata=references(folder)
    try:
        from photo_input import read_photos,validate_photo_plan
        validate_photo_plan(parsed,read_photos(folder))
        if args.blender_only:
            (folder/'scene.json').write_text(json.dumps(parsed));(folder/'review-request.json').write_text('{"enabled":true,"preview_only":true}')
            expression='import sys;from pathlib import Path;sys.path.insert(0,'+repr(str(root/'runtime'))+');from run import execute_job;execute_job(Path('+repr(str(folder))+'))'
            subprocess.run([args.blender_only,'--background','--factory-startup','-t','2','--python-exit-code','1','--python-expr',expression],check=True,timeout=300)
            assessment=completion.assessment({'instructions':completion.CABINET},folder)
            if not assessment['structural_passed']:raise ValueError(str(assessment))
            if args.artifact_dir:
                destination=Path(args.artifact_dir).resolve()
                if destination.exists():raise ValueError('Use a new fixture artifact directory.')
                shutil.copytree(folder,destination)
            print('CABINET_REAL_BLENDER_ONLY_OK '+json.dumps(assessment['measured'])+' reference_sha256='+json.dumps([p['sha256'] for p in metadata]));return
        import codex_runner as runner
        import codex_smoke
        import astra_spend_v2 as spend
        fixture=Fixture(runner,codex_smoke.has_value);protect=spend.protect;count_calls=[]
        def bounded(folder,payload,headers,minimum_output=256):
            payload['max_output_tokens']=min(4096,payload['max_output_tokens'])
            def counter(*_):count_calls.append(True);return 100
            return protect(folder,payload,headers,counter=counter,minimum_output=minimum_output)
        with patch.object(runner.urllib.request,'build_opener',return_value=fixture),patch.object(spend,'protect',bounded),patch.object(spend.legacy,'LEDGER_ROOT',folder/'fixture-ledgers'):
            runner.run(folder,'Synthetic electrical cabinet with devices, rails, ducts, cables and fasteners.',completion.CABINET,
                       'offline-unused-key',threading.Event(),print,binary=root/'tools/codex/codex')
        if references_unchanged(folder,metadata) is not True:raise ValueError('Original ordered fixture images changed.')
        saved=json.loads((folder/'agent-request.json').read_text())
        if saved['instructions']!=completion.CABINET or saved['prompt']!='Synthetic electrical cabinet with devices, rails, ducts, cables and fasteners.':
            raise ValueError('Original fixture prompt or instructions changed.')
        calls=json.loads((folder/'agent-tools.json').read_text())['calls']
        complete=[x['tool'] for x in calls if x['status']=='completed']
        if len(fixture.seen)!=3 or len(count_calls)!=3 or complete[:2]!=['get_modeling_contract','build_model']:
            raise ValueError('First exec did not build without discovery-only round trip.')
        if not completion.assessment({'instructions':completion.CABINET},folder)['structural_passed'] or runner.completed_outcome(folder) is None:
            raise ValueError('Current model was not structurally complete and finished.')
        print('CABINET_FIRST_EXEC_REAL_PIPELINE_OK; real Codex/CodeMode/MCP/Blender; scripted responses; paid quality NOT RUN')
    finally:shutil.rmtree(folder)


if __name__=='__main__':main()
