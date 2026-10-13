"""Source identity evidence only; no installation, receipt or provider call."""
import hashlib
import os
from pathlib import Path
import unittest

import patch_server


class CandidateIdentityTests(unittest.TestCase):
    def test_reviewed_source_transform_reports_its_exact_identity(self):
        source = Path(os.environ['ORACLE_ADMISSION_SOURCE']) / 'server.py'
        original = source.read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(), patch_server.BEFORE)
        here = Path(__file__).resolve().parent
        helpers = {name: (here / name).read_bytes() for name in patch_server.HELPERS}
        transformed = patch_server.transform(original, helpers)
        compile(transformed, 'candidate-server.py', 'exec')
        print('EXACT_DURABLE_SERVER_SHA256=' + hashlib.sha256(transformed).hexdigest(), flush=True)
        self.assertNotEqual(transformed, original)


if __name__ == '__main__':
    unittest.main()
