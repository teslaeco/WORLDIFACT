"""Offline quality-profile and durable-export boundaries; no AI/GPU requests."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/runpod_worker'))
from contracts import Rejected,QUALITY_REVISION,validate_job,fingerprint
from engine import (prepare,inference_options,resolution_evidence,
                    require_quality_memory,blender,EXPORT_CHECKPOINTS)

FIX=json.loads((ROOT/'tests/fixtures/runpod/contract.json').read_text())

def quality_job():
    job=copy.deepcopy(FIX['job'])
    job['revision']=QUALITY_REVISION
    job['settings'].update(resolution=1536,textureSize=4096,targetFaces=1000000)
    job['budget'].update(maxGpuMicroUsd=2100000,rateMicroUsdPerSecond=834,
                         executionSeconds=1800,coldStartAllowanceSeconds=600,
                         idleSeconds=5,expiresAt=FIX['nowMs']+3600000)
    return job


class QualityContract(unittest.TestCase):
    def test_legacy_fingerprint_and_limits_stay_unchanged(self):
        legacy=copy.deepcopy(FIX['job'])
        self.assertEqual(fingerprint(validate_job(legacy,FIX['nowMs'])),FIX['fingerprint'])
        for field,value in [('targetFaces',1000000),('targetFaces',True)]:
            bad=copy.deepcopy(legacy);bad['settings'][field]=value
            with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])
        legacy['budget']['executionSeconds']=901
        with self.assertRaises(Rejected):validate_job(legacy,FIX['nowMs'])

    def test_quality_is_an_explicit_bounded_profile(self):
        self.assertEqual(validate_job(quality_job(),FIX['nowMs']),quality_job())
        for field,value in [('resolution',1024),('textureSize',2048),
                            ('targetFaces',999999),('targetFaces',1000001),('seed',-1)]:
            with self.subTest(field=field,value=value):
                bad=quality_job();bad['settings'][field]=value
                with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])
        bad=quality_job();bad['settings']['samplingSteps']=1000
        with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])

    def test_quality_cannot_expand_time_cost_rate_or_expiry(self):
        for field,value in [('maxGpuMicroUsd',2100001),('executionSeconds',1801),
                            ('coldStartAllowanceSeconds',601),('idleSeconds',6),
                            ('rateMicroUsdPerSecond',835),('expiresAt',FIX['nowMs']+3600001)]:
            with self.subTest(field=field):
                bad=quality_job();bad['budget'][field]=value
                with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])
        bad=quality_job();bad['budget']['maxGpuMicroUsd']=2000000
        with self.assertRaisesRegex(Rejected,'GPU_BUDGET_EXCEEDED'):validate_job(bad,FIX['nowMs'])
        bad=quality_job();bad['budget']['expiresAt']=FIX['nowMs']+1800000
        with self.assertRaisesRegex(Rejected,'INSUFFICIENT_JOB_TTL'):validate_job(bad,FIX['nowMs'])

    def test_quality_keeps_source_planner_and_job_binding(self):
        for mutate in (lambda j:j['reference'].update(key='unrelated/reference.png'),
                       lambda j:j['planner'].update(referenceSha256='0'*64)):
            bad=quality_job();mutate(bad)
            with self.assertRaises(Rejected):validate_job(bad,FIX['nowMs'])
        one=quality_job();two=quality_job();two['settings']['seed']+=1
        self.assertNotEqual(fingerprint(one),fingerprint(two))

    def test_sampling_is_bounded_and_does_not_invent_text_conditioning(self):
        options=inference_options(quality_job())
        self.assertEqual(options['pipeline_type'],'1536_cascade')
        self.assertEqual(options['max_num_tokens'],65536)
        for stage in ('sparse_structure','shape_slat','tex_slat'):
            self.assertEqual(options[stage+'_sampler_params'],{'steps':24})
        # No changed guidance and no text, prompt, retry or user-supplied code.
        self.assertEqual(len(options),5)
        self.assertEqual(len(inference_options(FIX['job'])),1)

    def test_downshift_is_reported_as_actual_resolution(self):
        result=resolution_evidence(1536,1/1280)
        self.assertEqual(result,{'requestedResolution':1536,'effectiveResolution':1280,
                                 'resolutionReduced':True})
        self.assertFalse(resolution_evidence(1536,1/1536)['resolutionReduced'])
        for size in (0,-1,float('nan'),float('inf'),1/2048):
            with self.assertRaises(Rejected):resolution_evidence(1536,size)

    def test_smaller_gpu_rejected_before_high_detail_inference(self):
        for memory in (24_000_000_000,48_000_000_000,74_999_999_999):
            with self.assertRaisesRegex(Rejected,'QUALITY_CUDA_80GB_REQUIRED'):
                require_quality_memory(memory)
        require_quality_memory(80_000_000_000)

    def test_1536_input_keeps_complete_mask_without_stretch_or_source_change(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);reference=root/'reference.png';mask_path=root/'mask.png'
            image=Image.new('RGB',(1536,1200),'black')
            draw=ImageDraw.Draw(image)
            draw.rectangle((0,0,35,1199),fill='red')
            draw.rectangle((1500,0,1535,1199),fill='blue')
            image.save(reference);Image.new('L',image.size,255).save(mask_path)
            originals=(reference.read_bytes(),mask_path.read_bytes())
            result=prepare(reference,mask_path,1536)
            self.assertEqual(result.size,(1536,1536))
            self.assertEqual(result.getpixel((0,768)),(255,0,0))
            self.assertEqual(result.getpixel((1535,768)),(0,0,255))
            self.assertEqual(result.getpixel((768,0)),(0,0,0))
            self.assertEqual(prepare(reference,mask_path).size,(1024,1024))
            self.assertEqual((reference.read_bytes(),mask_path.read_bytes()),originals)


class DurableBlenderProcess(unittest.TestCase):
    """A real short-lived fixture process verifies ack/timeout sequencing only."""
    def fixture(self,root,names,*,pause=False,bad_hash=False):
        binary=root/'fixture-blender'
        code='''import hashlib,json,os,sys,time
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+2])
assert '--checkpoint-acks' in sys.argv
(out/'child.pid').write_text(str(os.getpid()))
markers=out/'.checkpoints';markers.mkdir()
for name in NAMES:
    path=out/name;path.write_bytes(('OFFLINE FIXTURE '+name).encode())
    checksum=hashlib.sha256(path.read_bytes()).hexdigest()
    if BAD_HASH:checksum='0'*64
    marker=markers/(name+'.ready')
    temporary=markers/(name+'.tmp')
    temporary.write_text(json.dumps({'filename':name,'bytes':path.stat().st_size,'sha256':checksum}))
    temporary.replace(marker)
    while not (markers/(name+'.ack')).exists():time.sleep(.005)
    if PAUSE:time.sleep(10)
'''
        binary.write_text('#!'+sys.executable+'\n'+
            'NAMES='+repr(names)+'\nPAUSE='+repr(pause)+'\nBAD_HASH='+repr(bad_hash)+'\n'+code)
        binary.chmod(0o700)
        return binary

    def assert_reaped(self,out):
        pid=int((out/'child.pid').read_text())
        with self.assertRaises(ProcessLookupError):os.kill(pid,0)

    def test_each_file_is_durable_before_next_render_is_started(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);out=root/'outputs';saved=[]
            names=['game.glb','source.blend','qa.initial.json']+sorted(EXPORT_CHECKPOINTS-{'game.glb','source.blend','qa.initial.json'})
            binary=self.fixture(root,names)
            def persist(path):
                self.assertFalse((out/'.checkpoints'/(path.name+'.ack')).exists())
                saved.append(path.name)
                index=names.index(path.name)
                if index+1<len(names):self.assertFalse((out/names[index+1]).exists())
            with patch.dict(os.environ,{'BLENDER_BIN':str(binary)}):
                blender(root/'source.glb',out,8,preserve=persist)
            self.assertEqual(saved,names)
            self.assert_reaped(out)

    def test_deadline_keeps_early_model_and_reaps_renderer(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);out=root/'outputs';saved=[]
            binary=self.fixture(root,['game.glb','source.blend'],pause=True)
            with patch.dict(os.environ,{'BLENDER_BIN':str(binary)}):
                with self.assertRaises(subprocess.TimeoutExpired):
                    blender(root/'source.glb',out,.5,preserve=lambda path:saved.append(path.name))
            self.assertEqual(saved,['game.glb']);self.assert_reaped(out)

    def test_failed_upload_is_not_acked_and_terminates_renderer(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);out=root/'outputs'
            binary=self.fixture(root,['game.glb','source.blend'])
            def fail(_):raise RuntimeError('OFFLINE_UPLOAD_FAILURE')
            with patch.dict(os.environ,{'BLENDER_BIN':str(binary)}):
                with self.assertRaisesRegex(RuntimeError,'OFFLINE_UPLOAD_FAILURE'):
                    blender(root/'source.glb',out,3,preserve=fail)
            self.assertFalse((out/'.checkpoints/game.glb.ack').exists())
            self.assertFalse((out/'source.blend').exists());self.assert_reaped(out)

    def test_changed_checkpoint_is_not_uploaded(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);out=root/'outputs';saved=[]
            binary=self.fixture(root,['game.glb'],bad_hash=True)
            with patch.dict(os.environ,{'BLENDER_BIN':str(binary)}):
                with self.assertRaisesRegex(Rejected,'EXPORT_CHECKPOINT_MISMATCH'):
                    blender(root/'source.glb',out,3,preserve=lambda path:saved.append(path.name))
            self.assertEqual(saved,[]);self.assert_reaped(out)


if __name__=='__main__':unittest.main(verbosity=2)
