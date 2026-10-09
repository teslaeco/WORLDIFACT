"""The retired parser update never expands to the new three-helper authority."""
from contextlib import redirect_stdout
import io
from pathlib import Path
import unittest
from unittest.mock import patch

import test_construction_transaction as original

installer, manifest = original.installer, original.manifest


class HistoricalPayloadBoundary(unittest.TestCase):
    def test_historical_mode_is_inert_without_approval_and_refuses_with_it(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')), \
             patch.object(installer, 'frozen_dependencies', side_effect=AssertionError('package read')):
            with redirect_stdout(io.StringIO()):
                installer.main(['--update-payload'])
            with self.assertRaisesRegex(installer.Refused, 'payload_update_requires_historical_package'):
                installer.main(['--update-payload', '--approve-service-maintenance'])
            with self.assertRaisesRegex(installer.Refused, 'payload_update_requires_historical_package'):
                installer.install(Path('/unused'), Path('/unused-backup'), object(),
                                  approved=True, update_payload=True)

    def test_historical_and_new_mode_are_mutually_exclusive(self):
        with patch.object(installer.base, 'read_regular', side_effect=AssertionError('target read')):
            with self.assertRaisesRegex(installer.Refused, 'conflicting_update_modes'):
                installer.install(Path('/unused'), Path('/unused-backup'), object(),
                                  approved=True, update_payload=True, update_initial_edit=True)
            with self.assertRaises(SystemExit):
                installer.main(['--update-payload', '--update-initial-edit', '--approve-service-maintenance'])
            for value in (1, None, 'true'):
                with self.assertRaisesRegex(installer.Refused, 'payload_update_mode_invalid'):
                    installer.install(Path('/unused'), Path('/unused-backup'), object(),
                                      approved=True, update_payload=value)

    def test_historical_target_is_still_exactly_the_parser_only_upgrade(self):
        before = manifest.payload_predecessor()
        self.assertEqual({name for name in before if before[name] != manifest.PAYLOAD_AFTER[name]},
                         {'construction_payload.py'})
        self.assertEqual(manifest.PAYLOAD_AFTER['construction_payload.py'],
                         '3b7e5af5192724af4d7eb2943a09230c952fbd44905ec955f2ae2d7a6ec03a84')
        self.assertNotEqual(manifest.PAYLOAD_AFTER, manifest.final_manifest())


if __name__ == '__main__': unittest.main()
