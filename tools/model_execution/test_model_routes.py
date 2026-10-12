"""Execute the proposed real Gateway with inert provider responses.

Requires the checksum-matching captured installed source. This is not a native
Blender gate and never writes an installed attestation or calls a provider.
"""
import ast
import hashlib
import os
from pathlib import Path
import unittest
import model_routes
import test_require_tools as previous


class ModelRoutes(previous.ExecutionContract):
    @classmethod
    def setUpClass(cls):
        source = Path(os.environ['MODEL_EXECUTION_SOURCE'])
        cls.inputs = {name: (source / name).read_bytes() for name in model_routes.EXPECTED}
        cls.outputs = model_routes.transform(cls.inputs)
        cls.original = cls.inputs['codex_runner.py']
        cls.proposed = cls.outputs['codex_runner.py']
        cls.tree = ast.parse(cls.proposed)

    def setUp(self):
        super().setUp()
        self.outer.execution = None
        self.outer.model = 'gpt-6-astra'
        self.outer.spend = self.policy

    def test_observed_runner_is_exact_and_transform_is_narrow(self):
        self.assertEqual({n: hashlib.sha256(b).hexdigest() for n,b in self.inputs.items()}, model_routes.EXPECTED)
        self.assertEqual(set(self.outputs), set(self.inputs))
        for name in self.inputs:
            for changed in (self.inputs[name] + b'\n', self.outputs[name], b''):
                with self.assertRaises(ValueError): model_routes.transform({**self.inputs, name: changed})

    def test_each_immutable_model_and_mode_reaches_its_guard_and_provider(self):
        for model, provider in [('astra','gpt-6-astra'),('sol','gpt-6.1-sol'),('luna','gpt-6-luna')]:
            for mode in ('standard','fast'):
                self.outer.execution = {'revision':'studio-execution-v1','model':model,'mode':mode}
                self.outer.model = provider
                self.calls.clear(); self.guard_calls.clear()
                self.send({'model':provider, 'service_tier':'default', 'tools':[], 'input':[
                    {'type':'additional_tools','role':'developer','tools':[{'type':'custom','name':'exec','format':{'type':'text'}}]},
                    {'role':'user','content':[{'type':'input_image','image_url':'data:image/jpeg;base64,fixture'}]},
                ]})
                self.assertEqual(self.status, 200)
                self.assertEqual(len(self.calls), 1)
                for payload in (self.calls[0], self.guard_calls[0]):
                    self.assertEqual(payload['model'], provider)
                    self.assertEqual(payload['service_tier'], 'fast' if mode=='fast' else 'default')
                    self.assertEqual(payload['tool_choice'], 'required')
                    self.assertEqual(payload['input'][1]['content'][0]['type'], 'input_image')

    def test_changed_model_is_rejected_before_budget_or_provider(self):
        self.outer.model = 'gpt-6-luna'
        self.send()
        self.assertEqual(self.status, 400)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.guard_calls, [])

    def test_unsettled_selected_model_stops_without_reusing_the_reservation(self):
        self.outer.execution = {'revision':'studio-execution-v1','model':'astra','mode':'standard'}
        self.policy.settle_completed = lambda *_: False
        self.send()
        self.assertEqual(self.outer.error_code, 'WORLDIFACT_MODEL_UNSETTLED')
        self.assertTrue(self.outer.unknown_usage)
        self.send()
        self.assertEqual(len(self.calls), 1)


if __name__ == '__main__': unittest.main()
