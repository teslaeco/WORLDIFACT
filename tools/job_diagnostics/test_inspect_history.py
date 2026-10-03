"""Synthetic local databases only; no OCI, SSH, provider calls or live signals."""
import contextlib
import ast
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('history',Path(__file__).with_name('inspect_history.py'))
diagnostic=importlib.util.module_from_spec(spec); spec.loader.exec_module(diagnostic)
SCHEMA='CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)'

class CountsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='history-counts-fixture-')
        self.root=Path(self.temp.name); (self.root/'state').mkdir()
        self.path=self.root/'state/jobs.sqlite'
        self.ns={}; exec(diagnostic.REMOTE,self.ns)
        self.ns['EXPECTED']={name:hashlib.sha256(('synthetic '+name).encode()).hexdigest() for name in self.ns['EXPECTED']}
        for name in self.ns['EXPECTED']: (self.root/name).write_bytes(('synthetic '+name).encode())
        self.ns['services']=lambda:{'worker':{'active':'active','sub':'running','pid':123},'tunnel':{'active':'active','sub':'running','pid':456}}
        with sqlite3.connect(self.path) as connection: connection.execute(SCHEMA)

    def tearDown(self): self.temp.cleanup()

    def populate(self,states):
        with sqlite3.connect(self.path) as connection:
            connection.executemany('INSERT INTO jobs VALUES(?,?,?,?,?,?)',[(str(i),'PRIVATE_PROMPT',state,'PRIVATE_DETAIL',1.,2.) for i,state in enumerate(states)])

    def report(self): return self.ns['validate'](self.ns['inspect'](self.root))

    def test_counts_sanitize_states_and_never_claim_safe(self):
        self.populate(['succeeded','failed','cancelled','cancelled','building',None,'PRIVATE_STATE'])
        before=self.path.read_bytes()
        value=self.report()
        self.assertEqual(value['counts']['cancelled'],2)
        self.assertEqual(value['counts']['null'],1)
        self.assertEqual(value['counts']['unknown'],1)
        self.assertEqual(sum(value['counts'].values()),7)
        self.assertIs(value['maintenance_safe'],False)
        self.assertIs(value['sqlite_lock_metadata_may_change'],True)
        self.assertNotIn('PRIVATE',json.dumps(value))
        self.assertEqual(self.path.read_bytes(),before)

    def test_empty_counts_are_not_maintenance_authorization(self):
        value=self.report()
        self.assertEqual(sum(value['counts'].values()),0)
        self.assertFalse(value['maintenance_safe'])

    def test_unknown_source_returns_services_without_opening_database(self):
        (self.root/'server.py').write_bytes(b'different source')
        with patch.object(sqlite3,'connect',side_effect=AssertionError('unexpected database access')):
            value=self.report()
        self.assertEqual(value['refusal_code'],'source_unverified')
        self.assertEqual(value['services_after']['worker']['pid'],123)

    def test_source_change_discards_counts(self):
        original=self.ns['sources']; calls=[]
        def changed(root):
            result=original(root); calls.append(1)
            if len(calls)>1: result['server.py']='different'
            return result
        self.ns['sources']=changed
        value=self.report()
        self.assertIsNone(value['counts']); self.assertEqual(value['refusal_code'],'source_changed')

    def test_ro_connection_is_explicit(self):
        original=sqlite3.connect; targets=[]
        def connect(target,**kwargs):
            targets.append((target,kwargs)); return original(target,**kwargs)
        with patch.object(sqlite3,'connect',side_effect=connect): self.report()
        self.assertEqual(targets,[(self.path.as_uri()+'?mode=ro',{'uri':True,'timeout':1})])

    def test_authorizer_blocks_private_columns_and_writes(self):
        connection=sqlite3.connect(self.path.as_uri()+'?mode=ro',uri=True)
        try:
            connection.set_authorizer(self.ns['authorizer'])
            for sql in ('SELECT prompt FROM jobs','SELECT id FROM jobs','UPDATE jobs SET state="failed"',
                        'PRAGMA journal_mode=WAL','PRAGMA wal_checkpoint','VACUUM',"ATTACH ':memory:' AS extra"):
                with self.subTest(sql=sql),self.assertRaises(sqlite3.Error): connection.execute(sql)
        finally: connection.close()

    def test_malformed_schema_refuses_with_service_state(self):
        with sqlite3.connect(self.path) as connection: connection.execute('CREATE TABLE extra(secret TEXT)')
        value=self.report()
        self.assertIsNone(value['counts']); self.assertEqual(value['refusal_code'],'schema_refused')
        self.assertEqual(value['services_before']['tunnel']['pid'],456)

    def test_view_cannot_replace_jobs(self):
        with sqlite3.connect(self.path) as connection:
            connection.execute('DROP TABLE jobs'); connection.execute('CREATE VIEW jobs AS SELECT "PRIVATE" AS state')
        value=self.report()
        self.assertIsNone(value['counts']); self.assertEqual(value['refusal_code'],'schema_refused')

    def test_lock_contention_is_bounded_and_keeps_observations(self):
        connection=sqlite3.connect(self.path); connection.execute('BEGIN EXCLUSIVE')
        try: value=self.report()
        finally: connection.rollback(); connection.close()
        self.assertIsNone(value['counts'])
        self.assertIn(value['refusal_code'],('database_busy','query_refused'))
        self.assertEqual(value['services_after']['worker']['active'],'active')

    def test_older_python_error_retains_service_observations(self):
        with patch.dict(vars(sqlite3)):
            vars(sqlite3).pop('SQLITE_BUSY',None); vars(sqlite3).pop('SQLITE_LOCKED',None)
            with patch.object(sqlite3,'connect',side_effect=sqlite3.OperationalError('PRIVATE_ERROR')):
                value=self.report()
        self.assertEqual(value['refusal_code'],'query_refused')
        self.assertEqual(value['services_after']['worker']['pid'],123)
        self.assertNotIn('PRIVATE',json.dumps(value))

    def test_wal_read_preserves_application_rows(self):
        connection=sqlite3.connect(self.path)
        try:
            connection.execute('PRAGMA journal_mode=WAL')
            connection.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?)',('fixture','PRIVATE','cancelled','PRIVATE',1.,2.)); connection.commit()
            before=connection.execute('SELECT * FROM jobs').fetchall()
            value=self.report()
            self.assertEqual(value['counts']['cancelled'],1)
            self.assertEqual(connection.execute('SELECT * FROM jobs').fetchall(),before)
        finally: connection.close()

    def test_symlink_hardlink_and_sidecar_aliases_refuse(self):
        original=self.root/'original.sqlite'; self.path.rename(original); self.path.symlink_to(original)
        self.assertEqual(self.report()['refusal_code'],'database_path_refused')
        self.path.unlink(); os.link(original,self.path)
        self.assertEqual(self.report()['refusal_code'],'database_path_refused')
        self.path.unlink(); original.rename(self.path)
        (self.root/'state/jobs.sqlite-shm').symlink_to(self.root/'server.py')
        self.assertEqual(self.report()['refusal_code'],'database_path_refused')

    def test_count_and_query_limits_refuse_without_partial_output(self):
        self.populate(['cancelled']*10001)
        value=self.report()
        self.assertIsNone(value['counts']); self.assertIn(value['refusal_code'],('count_limit','query_refused'))

    def test_output_validator_rejects_private_or_extra_values(self):
        value=self.report(); value['counts']['PRIVATE']=1
        with self.assertRaises(ValueError): self.ns['validate'](value)
        value=self.report(); value['services_after']['worker']['active']='PRIVATE'
        with self.assertRaises(ValueError): self.ns['validate'](value)

    def test_exact_unit_reads_only(self):
        namespace={}; exec(diagnostic.REMOTE,namespace)
        class Result:
            returncode=0; stdout='ActiveState=active\nSubState=running\nMainPID=123\n'
        with patch.object(subprocess_module:=namespace['subprocess'],'run',return_value=Result()) as call:
            value=namespace['services']()
        self.assertEqual(call.call_count,2)
        for args,_ in call.call_args_list:
            self.assertEqual(args[0][:3],['systemctl','--user','show'])
            self.assertEqual(args[0][4],'--property=ActiveState,SubState,MainPID')
        self.assertEqual(value['worker']['pid'],123)

class LauncherTests(unittest.TestCase):
    def test_exact_reviewed_manifest_and_connection_loader(self):
        manifest=Path(os.environ.get('MODEL_CONTEXT_MANIFEST',str(Path(__file__).resolve().parents[1]/'model_context/context_patch.py')))
        tree=ast.parse(manifest.read_text())
        expected=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='EXPECTED' for t in n.targets))
        namespace={}; exec(diagnostic.REMOTE,namespace)
        self.assertEqual(namespace['EXPECTED'],expected)
        loader=manifest.parent.parent/'model_completion/oracle_launch.py'
        self.assertEqual(diagnostic.blob(loader.read_bytes()),diagnostic.LOADER_BLOB)

    def test_default_never_downloads_or_connects(self):
        with patch.object(diagnostic,'loader',side_effect=AssertionError()),patch.object(diagnostic.subprocess,'run',side_effect=AssertionError()),contextlib.redirect_stdout(io.StringIO()) as out:
            diagnostic.main([])
        self.assertIn('PLAN_ONLY',out.getvalue())

    def test_bad_commit_precedes_loader(self):
        with patch.object(diagnostic,'loader',side_effect=AssertionError()):
            with self.assertRaises(ValueError): diagnostic.main(['--inspect-history','--source-commit','main'])

    def test_loader_checks_hash_before_execution(self):
        class Response:
            status=200
            def read(self,n): return b'raise AssertionError("must not execute")'
            def __enter__(self): return self
            def __exit__(self,*args): pass
        class Opener:
            def open(self,*args,**kwargs): return Response()
        with patch.object(diagnostic.urllib.request,'build_opener',return_value=Opener()):
            with self.assertRaises(ValueError): diagnostic.loader('0'*40)

if __name__=='__main__': unittest.main()
