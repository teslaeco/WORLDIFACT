"""Pinned public package checks; no network or SSH in these tests."""
import io
from pathlib import Path
import unittest
from unittest.mock import patch

import cloud_shell_probe as m


class CloudShellTests(unittest.TestCase):
    def values(self): return {n:(Path(__file__).parent/n).read_bytes() for n in m.FILES}

    def test_complete_frozen_package_compiles_and_has_no_install_action(self):
        program = m.remote_program(self.values())
        compile(program, 'remote-probe.py', 'exec')
        self.assertIn('production_acceptance_verified', program)
        self.assertNotIn('systemctl', program)
        self.assertNotIn('curl', program)

    def test_changed_or_extra_file_refuses_before_ssh(self):
        values = self.values()
        with self.assertRaises(ValueError): m.remote_program({**values, 'unexpected.py':b'pass'})
        with self.assertRaises(ValueError): m.remote_program({**values, 'durable_inbox.py':values['durable_inbox.py']+b'\n'})

    def test_download_requires_exact_commit_and_independent_content_hash(self):
        values = self.values()
        name = 'durable_inbox.py'
        with patch.object(m.urllib.request,'urlopen',return_value=io.BytesIO(values[name])) as download:
            self.assertEqual(m.public_file('a'*40,name),values[name])
            self.assertEqual(download.call_args.args[0],m.BASE+'a'*40+'/tools/oracle_admission/'+name)
        for commit in ('main','../main','a'*39):
            with self.assertRaises(ValueError): m.public_file(commit,name)
        with patch.object(m.urllib.request,'urlopen',return_value=io.BytesIO(b'changed')):
            with self.assertRaises(ValueError): m.public_file('a'*40,name)


if __name__ == '__main__': unittest.main()
