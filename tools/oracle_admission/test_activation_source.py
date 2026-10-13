"""Bind the release candidate to the exact reconstructed current Oracle source."""
import hashlib
import os
from pathlib import Path
import unittest

import activation_manifest as manifest


class SourceAuthorityTests(unittest.TestCase):
    def test_candidate_hash_and_unchanged_provider_price_modules(self):
        source = Path(os.environ['ORACLE_ADMISSION_SOURCE'])
        original = {n: (source / n).read_bytes() for n in manifest.BEFORE}
        here = Path(__file__).resolve().parent
        helpers = {n: (here / n).read_bytes() for n in manifest.HELPERS}
        candidate = manifest.build_candidate(original, helpers)
        actual = {n: hashlib.sha256(b).hexdigest() for n, b in candidate.items()}
        print('EXACT_DURABLE_SERVER_SHA256=' + actual['server.py'], flush=True)
        self.assertEqual(set(candidate) - set(original), set(manifest.HELPERS))
        self.assertEqual({n for n in original if candidate[n] != original[n]}, {'server.py'})
        self.assertEqual(actual, manifest.final_manifest())



if __name__ == '__main__':
    unittest.main()
