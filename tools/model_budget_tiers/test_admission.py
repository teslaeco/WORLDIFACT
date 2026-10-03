"""Authenticated patched POST admission: persist exact terms before queue/wake."""
import json
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import test_routes as fixture
from test_routes import JOB, OTHER
import studio_pricing as pricing
import terminal_budget


class AdmissionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.EndpointTests.setUpClass.__func__(cls)
    database = fixture.EndpointTests.database
    files = fixture.EndpointTests.files
    def setUp(self):
        fixture.EndpointTests.setUp(self)
        self.folder.rmdir()
        with self.database() as db:
            db.execute('DROP TABLE jobs')
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY,prompt TEXT,state TEXT,detail TEXT,created REAL,updated REAL)')
        self.pricing_health = patch.object(pricing, 'verified_health', return_value={'studioPricingRevision':pricing.REVISION}).start()
        self.wakes = []
        def wake():
            # Same queue wake the worker uses; binding MUST already be durable.
            with self.database() as db:
                row = db.execute('SELECT id FROM jobs').fetchone()
            self.wakes.append(pricing.job_terms(self.jobs / row['id']))
        env = self.handler.handle_request.__globals__
        env.update(OpenAIServiceError=type('OpenAIServiceError',(RuntimeError,),{}), requested_profile=lambda data: data.get('generationProfile', 'standard'),
            photo_input=SimpleNamespace(validate_photos=lambda photos: photos, metadata=lambda p: p, read_photos=lambda path: []),
            PROMPT_MAX_LENGTH=16000, recoverable_review_scene=lambda *args: None,
            health=lambda: {'ready': True, 'photoInput': True}, STATE=self.root,
            shutil=SimpleNamespace(disk_usage=lambda path: SimpleNamespace(free=10*1024**3)),
            write_json=lambda path, value: Path(path).write_text(json.dumps(value)), WAKE=SimpleNamespace(set=wake),
            read_profile=lambda folder:'standard', model_status=lambda *args:{}, CANCEL={})

    def post(self, terms='default', authorization='Bearer inert-bearer-secret', job=JOB, **extra):
        data = {'id':job, 'prompt':'synthetic object'}
        if terms == 'default': terms = {'revision':pricing.REVISION, **pricing.TIERS[0]}
        if terms != 'absent': data['studioPricing'] = terms
        data.update(extra)
        handler = self.handler.__new__(self.handler)
        handler.path = '/v1/jobs'
        handler.headers = {'Authorization':authorization}
        handler.wfile = io.BytesIO()
        sent = {}
        handler.send_response = lambda code: sent.update(status=code)
        handler.send_header = lambda *args:None
        handler.end_headers = lambda:None
        handler.input = lambda:data
        handler.do_POST()
        sent['body'] = json.loads(handler.wfile.getvalue())
        self.network.assert_not_called(); self.counter.assert_not_called(); self.process.assert_not_called()
        return sent

    def test_authenticated_new_tier_persists_before_enqueue_and_replay_is_immutable(self):
        value = {'revision':pricing.REVISION, **pricing.TIERS[1]}
        self.assertEqual(self.post(value)['status'],202)
        self.assertEqual(self.wakes,[value])
        self.assertEqual(self.post(value)['status'],200)
        self.assertEqual(self.post()['status'],409)
        self.assertEqual(self.post('absent')['status'],409)
        self.assertEqual(pricing.job_terms(self.jobs/JOB),value)
        self.assertFalse((pricing.folder_root(self.jobs/JOB)/terminal_budget.legacy.STATE).exists())

    def test_authentication_and_exact_validation_precede_all_ledger_and_job_writes(self):
        before=self.files()
        for auth in ('', 'Bearer wrong'):
            self.assertEqual(self.post(authorization=auth)['status'],401)
        for bad in (None,{}, {'revision':pricing.REVISION,**pricing.TIERS[0],'maxProviderCents':400},
                    {'revision':pricing.REVISION,**pricing.TIERS[0],'points':True}):
            self.assertEqual(self.post(bad)['status'],400)
        self.assertEqual(self.post(generationProfile='fast')['status'],400)
        self.assertEqual(self.files(),before)
        self.assertEqual(self.wakes,[])

    def test_failed_persistence_never_enqueues_or_wakes_a_provider_job(self):
        with patch.object(pricing.legacy, 'atomic', side_effect=OSError('synthetic disk failure')):
            self.assertEqual(self.post()['status'],500)
        with self.database() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0],0)
        self.assertEqual(self.wakes,[])
        self.assertFalse((pricing.folder_root(self.jobs/JOB)/terminal_budget.legacy.STATE).exists())

    def test_absent_terms_are_legacy_and_cannot_gain_a_higher_tier_by_replay(self):
        self.assertEqual(self.post('absent')['status'],202)
        self.assertEqual(self.wakes,[None])
        self.assertEqual(self.post('absent')['status'],200)
        self.assertEqual(self.post()['status'],409)
        self.assertEqual(pricing.cap_and_revision(pricing.job_terms(self.jobs/JOB)),(1750000,'astra-low-reconciled-v2'))

    def test_new_terms_need_verified_capability_before_admission(self):
        self.pricing_health.return_value = {}
        self.assertEqual(self.post()['status'],503)
        self.assertEqual(self.wakes,[])
        self.assertFalse(self.ledgers.exists())

    def test_maintenance_blocks_even_authenticated_tier_admission(self):
        (self.root/pricing.MAINTENANCE).write_text('{}')
        self.assertEqual(self.post()['status'],503)
        self.assertEqual(self.wakes,[])
        self.assertFalse(self.ledgers.exists())


if __name__ == '__main__': unittest.main()
