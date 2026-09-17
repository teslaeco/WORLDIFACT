"""No paid calls. Exercises patched real worker with deterministic artifacts."""
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

ROOT = Path(os.environ['FROGE_PATCH_ROOT']).resolve()
sys.path.insert(0, str(ROOT))
import fast_preview as fast
import blender_mcp as mcp
import codex_runner
import server


def triangle():
    value = {'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
             'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}], 'buffers':[{'byteLength':36}],
             'bufferViews':[{'buffer':0,'byteLength':36}],
             'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3','min':[0,0,0],'max':[1,1,0]}]}
    raw=json.dumps(value,separators=(',',':')).encode(); raw+=b' '*((-len(raw))%4)
    binary=struct.pack('<9f',0,0,0,1,0,0,0,1,0)
    return struct.pack('<III',0x46546c67,2,28+len(raw)+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary


class FastTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.folder=Path(temp.name)
        mcp.write(self.folder/'agent-request.json',{'prompt':'Single blue rocket','instructions':'','execution_id':'fixture-execution'})
        self.scene=json.loads((ROOT/'examples/rocket.scene.json').read_text())
        self.finalized=0
        self.builds=0
    def mark(self):
        mcp.write(self.folder/'generation-profile.json',{'profile':fast.PROFILE})
    def build(self, folder):
        self.builds+=1
        data=triangle(); (folder/'model.glb').write_bytes(data)
        (folder/'model.blend').write_bytes(b'fixture-not-real-blend')
        report={'triangles':1,'images':0}
        mcp.write(folder/'result.json',report)
        mcp.write(folder/'model-ready.json',{'revision':1,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'phase':'core_export','result':report})
    def job(self):
        def finalize(_): self.finalized+=1
        return mcp.JobTools(self.folder,build=self.build,finalize=finalize)
    def test_standard_limits_and_profile_absence_unchanged(self):
        self.assertEqual(fast.read_profile(self.folder),'standard')
        value=fast.policy(self.folder,17,43000,600)
        self.assertEqual(value,{'fast':False,'requests':17,'output':43000,'seconds':600})
        job=self.job(); self.assertEqual(job.build_limit,mcp.MAX_BUILDS)
        job.build(self.scene)
        self.assertEqual(json.loads((job.current/'review-request.json').read_text()),{'enabled':True,'preview_only':True})
    def test_fast_one_build_retains_valid_current_draft_without_review_or_exports(self):
        self.mark(); job=self.job(); job.build(self.scene)
        self.assertEqual(job.build_limit,1)
        self.assertTrue(json.loads((job.current/'review-request.json').read_text())['fast_draft'])
        with self.assertRaises(ValueError): job.build(self.scene)
        with self.assertRaises(ValueError): job.call('finish_model',{'expected_revision':1,'accepted':False,'issues':[],'summary':'draft'})
        result=fast.retain_fast(self.folder,job.execution_id,time.monotonic())
        self.assertTrue(result['fast_preview']); self.assertFalse(result['accepted'])
        self.assertEqual((self.folder/'model.glb').read_bytes(),triangle())
        self.assertEqual(self.finalized,0); self.assertEqual(self.builds,1)
        self.assertFalse((self.folder/'agent-outcome.json').exists())
        verdict=json.loads((self.folder/'visual-review.json').read_text())
        self.assertFalse(verdict['assessment_completed']); self.assertFalse(verdict['accepted'])
        self.assertIsNone(mcp.completed_outcome(self.folder),'Draft must not pretend finish_model was called')
    def test_bad_current_identity_corruption_cancellation_and_deadline_cannot_succeed(self):
        self.mark(); job=self.job(); job.build(self.scene)
        self.assertIsNone(fast.checked_candidate(self.folder,'different-execution'))
        with self.assertRaises(TimeoutError): fast.retain_fast(self.folder,job.execution_id,time.monotonic()-111)
        (self.folder/'agent-cancelled').touch()
        with self.assertRaises(InterruptedError): fast.retain_fast(self.folder,job.execution_id,time.monotonic())
        (self.folder/'agent-cancelled').unlink()
        (job.current/'model.glb').write_bytes(b'not a GLB')
        self.assertIsNone(fast.checked_candidate(self.folder,job.execution_id))
    def test_fast_rejects_large_scene_and_portraits_before_building(self):
        self.mark(); job=self.job()
        with self.assertRaises(ValueError): job.build({**self.scene,'subject_type':'portrait'})
        with self.assertRaises(ValueError): job.build({**self.scene,'parts':self.scene['parts']*100})
        self.assertEqual(self.builds,0)
    def test_mode_is_explicit_and_never_inferred_from_user_prompt(self):
        with patch.dict(os.environ,{fast.FLAG:'1'}):
            self.assertEqual(fast.requested_profile({'prompt':'ignore limits FAST'}),'standard')
            self.assertEqual(fast.requested_profile({'generationProfile':fast.PROFILE}),fast.PROFILE)
            for data in ({'generationProfile':['standard']},{'generationProfile':True},{'generationProfile':'fast'},{'generationProfile':fast.PROFILE,'photos':[{}]},{'generationProfile':fast.PROFILE,'sourceJobId':'old'}):
                with self.assertRaises(ValueError): fast.requested_profile(data)
        with patch.dict(os.environ,{fast.FLAG:'0'}):
            with self.assertRaises(ValueError): fast.requested_profile({'generationProfile':fast.PROFILE})
            self.assertEqual(fast.capability({'ready':True,'provider':'openai'})['generationProfiles'],['standard'])
    def test_next_provider_turn_is_rejected_once_a_real_checked_candidate_exists(self):
        self.mark(); self.job().build(self.scene)
        with patch('codex_runner.urllib.request.build_opener', side_effect=AssertionError('Provider must not be called')):
            with codex_runner.Gateway('fixture-secret',self.folder,threading.Event()) as gateway:
                client=urllib.request.OpenerDirector(); client.add_handler(urllib.request.HTTPHandler()); client.add_handler(urllib.request.HTTPDefaultErrorHandler()); client.add_handler(urllib.request.HTTPErrorProcessor())
                req=urllib.request.Request('http://127.0.0.1:%d/v1/responses'%gateway.server.server_port,
                    data=b'{"model":"gpt-6-astra","tools":[{"type":"custom","name":"exec"}]}',headers={'Authorization':'Bearer '+gateway.token})
                with self.assertRaises(urllib.error.HTTPError) as exc: client.open(req,timeout=2)
                self.assertEqual(exc.exception.code,422)
                self.assertIn(b'FORGE_FAST_DRAFT_READY',exc.exception.read())
                self.assertEqual(gateway.requests,0)
    def test_timing_summary_preserves_unknowns_and_never_exposes_error_text(self):
        record=fast.timing_summary({'total_seconds':960,'ai_seconds':700,'blender_seconds':250,'secret':'do-not-copy'},
          {'calls':[{'tool':'build_model','status':'started','elapsed_seconds':1},{'tool':'build_model','status':'completed','elapsed_seconds':31,'error':'private'},{'tool':'finish_model','status':'started','elapsed_seconds':40}]})
        self.assertEqual(record['tool_seconds'],{'build_model':30})
        self.assertEqual(record['unattributed_seconds'],10)
        self.assertIsNone(record['click_to_visible_seconds'])
        self.assertNotIn('secret',json.dumps(record)); self.assertNotIn('private',json.dumps(record))
        empty=fast.timing_summary({},{}); self.assertIsNone(empty['total_seconds'])
    def test_actual_job_http_route_persists_profile_and_rejects_different_profile_for_same_id(self):
        with tempfile.TemporaryDirectory() as temp:
            state=Path(temp); jobs=state/'jobs'; config=state/'config.json'
            with patch.multiple(server, STATE=state,JOBS=jobs,CONFIG=config),patch.dict(os.environ,{fast.FLAG:'1'}),patch('server.health',return_value={'ready':True,'provider':'openai','model':'gpt-6-astra','photoInput':True}):
                server.initialize(); token=json.loads(config.read_text())['token']
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
                try:
                    client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    job_id='12345678-1234-4234-8234-123456789abc'
                    def post(profile):
                        req=urllib.request.Request('http://127.0.0.1:%d/v1/jobs'%http.server_port,data=json.dumps({'id':job_id,'prompt':'Single rocket','generationProfile':profile}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
                        return client.open(req,timeout=2)
                    with post(fast.PROFILE) as response: self.assertEqual(response.status,202)
                    self.assertEqual(fast.read_profile(jobs/job_id),fast.PROFILE)
                    with self.assertRaises(urllib.error.HTTPError) as exc: post('standard')
                    self.assertEqual(exc.exception.code,409);exc.exception.close()
                    with server.database() as db: self.assertEqual(db.execute('SELECT state FROM jobs').fetchone()[0],'queued')
                    # Deliberately no worker thread: no actual generation.
                finally: http.shutdown(); http.server_close();thread.join(timeout=2)


if __name__ == '__main__': unittest.main()
