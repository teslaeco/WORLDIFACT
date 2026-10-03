"""Read-only diagnostic fixtures; no SSH, systemd, Podman or generation."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import inspect_maintenance as diagnostic


def helpers():
    scope={'__name__':'inert_fixture'}
    exec(compile(diagnostic.REMOTE,'reviewed-readonly-probe','exec'),scope)
    return scope


def tables(extra=''):
    return {'tcp':'HEADER\n0: 0100007F:223D 00000000:0000 0A 0:0 00:0 0 1000 0 222\n'+extra,
            'tcp6':'HEADER\n','udp':'HEADER\n','udp6':'HEADER\n',
            'unix':'HEADER\n000: 2 0 0 0001 03 111 /private/journal-path\n'}


def invisible_probe():
    scope=helpers()
    fail=lambda *args: (_ for _ in ()).throw(OSError('private credential content'))
    with patch.dict(scope,{'unit':fail,'database':fail,'command':fail}):
        return scope['probe']()


class DiagnosticTests(unittest.TestCase):
    def test_stdio_aliases_are_grouped_without_inventing_journal_proof(self):
        classify=helpers()['classify_sockets']
        result=classify({0:'/dev/null',1:'socket:[111]',2:'socket:[111]',3:'socket:[222]'},tables())
        self.assertEqual(len(result),2)
        self.assertEqual(result[0],{'alias':'socket_1','family':'unix','tcp_state':None,
            'known_listener':False,'fd_count':2,'stdio_fds':[1,2],
            'shared_output_error':True,'journal_proven':False})
        self.assertTrue(result[1]['known_listener'])
        encoded=json.dumps(result)
        for private in ('111','222','/private','0100007F','223D'): self.assertNotIn(private,encoded)

    def test_accepted_and_unknown_sockets_remain_visible_and_untrusted(self):
        classify=helpers()['classify_sockets']
        extra='1: 0100007F:223D 0100007F:ABCD 01 0:0 00:0 0 1000 0 333\n'
        result=classify({3:'socket:[222]',7:'socket:[333]',8:'socket:[999]'},tables(extra))
        self.assertEqual([item['family'] for item in result],['tcp','tcp','unknown'])
        self.assertEqual(result[1]['tcp_state'],'01')
        self.assertFalse(result[1]['known_listener'])
        self.assertFalse(result[2]['known_listener'])

    def test_unavailable_visibility_is_unknown_not_empty_or_stable(self):
        result=invisible_probe()
        self.assertEqual(diagnostic.validate(result),result)
        self.assertIsNone(result['changed_or_racy'])
        self.assertFalse(result['resources']['socket_visibility'])
        self.assertIsNone(result['resources']['task_count'])
        self.assertIsNone(result['podman']['containers'])
        self.assertFalse(result['database']['visible'])
        self.assertNotIn('private',json.dumps(result))

    def test_database_is_snapshot_and_does_not_expose_cancelled_id(self):
        import sqlite3
        scope=helpers()
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory);(source/'state').mkdir()
            path=source/'state/jobs.sqlite'
            db=sqlite3.connect(path)
            db.execute('CREATE TABLE jobs (id TEXT, state TEXT, prompt TEXT)')
            db.execute('INSERT INTO jobs VALUES (?,?,?)',('01234567-0123-0123-0123-0123456789ab','cancelled','PRIVATE PROMPT'))
            db.commit();db.close()
            original=path.read_bytes()
            result=scope['database'](source)
            self.assertTrue(result['read_only_snapshot'])
            self.assertTrue(result['single_cancelled_uuid_valid'])
            self.assertEqual(result['counts']['cancelled'],1)
            self.assertEqual(path.read_bytes(),original)
            self.assertNotIn('PRIVATE',json.dumps(result))
            self.assertNotIn('01234567',json.dumps(result))

    def test_private_fields_and_fake_journal_proofs_are_rejected(self):
        result=invisible_probe()
        for changed in ({**result,'path':'/private/token'}, {**result,'read_only':1}):
            with self.assertRaises(diagnostic.DiagnosticError): diagnostic.validate(changed)
        result['resources']['sockets']=helpers()['classify_sockets']({1:'socket:[111]',2:'socket:[111]'},tables())
        result['resources']['sockets'][0]['journal_proven']=True
        with self.assertRaises(diagnostic.DiagnosticError): diagnostic.validate(result)
        result['resources']['sockets'][0]['journal_proven']=False
        result['resources']['sockets'][0]['alias']='PRIVATE INODE'
        with self.assertRaises(diagnostic.DiagnosticError): diagnostic.validate(result)

    def test_launcher_checksum_is_checked_before_import_or_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'oracle_tiers_launch.py'
            marker=Path(directory)/'must-not-exist'
            path.write_text('from pathlib import Path\nPath('+repr(str(marker))+').touch()\n')
            with self.assertRaises(diagnostic.DiagnosticError): diagnostic.launcher_connection(path)
            self.assertFalse(marker.exists())

    def test_remote_private_stdout_is_suppressed_on_failure(self):
        for output,code in (('secret stderr token',1),('{"secret":"private"}',0),('x'*32769,0)):
            target=io.StringIO()
            with patch.object(diagnostic,'launcher_connection',return_value=['INERT']), \
                 patch.object(diagnostic.subprocess,'run',return_value=types.SimpleNamespace(stdout=output,returncode=code)), \
                 contextlib.redirect_stdout(target):
                self.assertEqual(diagnostic.main([]),1)
            self.assertNotIn(output,target.getvalue())

    def test_readonly_transport_prints_only_validated_result(self):
        result=invisible_probe();target=io.StringIO()
        with patch.object(diagnostic,'launcher_connection',return_value=['INERT']), \
             patch.object(diagnostic.subprocess,'run',return_value=types.SimpleNamespace(stdout=json.dumps(result),returncode=0)) as call, \
             contextlib.redirect_stdout(target):
            self.assertEqual(diagnostic.main([]),0)
        self.assertEqual(call.call_args.kwargs['input'],diagnostic.REMOTE)
        self.assertEqual(json.loads(target.getvalue().splitlines()[0]),result)
        self.assertIn('journal identity UNKNOWN',target.getvalue())
        self.assertIn('Sockets: UNKNOWN visibility',target.getvalue())


if __name__=='__main__': unittest.main()
