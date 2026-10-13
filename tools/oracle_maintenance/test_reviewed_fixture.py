"""A missing or altered historical input must fail, never fall back to HEAD."""
from pathlib import Path
import tempfile
import unittest

import reviewed_fixture


class ReviewedFixtureTests(unittest.TestCase):
    def test_all_frozen_inputs_verify(self):
        for name in reviewed_fixture.PINS:
            with self.subTest(name=name):
                self.assertTrue(reviewed_fixture.read(name))

    def test_missing_modified_and_symlink_inputs_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            name = 'oracle_construction_launch.py'
            path = root / (name + '.source')
            with self.assertRaises(ValueError):
                reviewed_fixture.read(name, root)
            raw = reviewed_fixture.read(name)
            path.write_bytes(raw + b'\n')
            with self.assertRaisesRegex(ValueError, 'integrity'):
                reviewed_fixture.read(name, root)
            path.unlink()
            path.symlink_to(reviewed_fixture.ROOT / path.name)
            with self.assertRaises(ValueError):
                reviewed_fixture.read(name, root)

    def test_unknown_input_refuses(self):
        with self.assertRaisesRegex(ValueError, 'unreviewed_fixture'):
            reviewed_fixture.read('../dispatcher.py')
