"""Inert systemctl/SSH replies only; no live service or network calls."""
import ast
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('units',Path(__file__).with_name('inspect_units.py'))
diagnostic=importlib.util.module_from_spec(spec); spec.loader.exec_module(diagnostic)
FENCE=Path(os.environ.get('MODEL_CONTEXT_FENCE',str(Path(__file__).resolve().parents[1]/'model_context/maintenance_fence.py')))

class UnitTests(unittest.TestCase):
    def setUp(self):
        self.ns={}; exec(diagnostic.REMOTE,self.ns)
        self.root=Path('/synthetic/froge-connector')
        test_tree=ast.parse(FENCE.with_name('test_maintenance_fence.py').read_text())
        factory=next(n for n in test_tree.body if isinstance(n,ast.FunctionDef) and n.name=='unit')
        scope={'fence':types.SimpleNamespace(PROPERTIES=self.ns['PROPERTIES'],WORKER='froge-worker.service',TUNNEL='froge-tunnel.service')}
        exec(compile(ast.Module(body=[factory],type_ignores=[]),'reviewed-unit-fixture','exec'),scope)
        self.values={name:scope['unit'](name,self.root) for name in ('froge-worker.service','froge-tunnel.service')}
        self.calls=[]; self.ns['command']=self.command

    def command(self,args):
        self.calls.append(args)
        if args==['systemctl','--version']: return 'systemd 252 (PRIVATE_DISTRIBUTION_DETAIL)\nPRIVATE_FEATURES\n'
        if args==['systemctl','--user','show','--property=Version','--value']: return '252.39-PRIVATE\n'
        self.assertEqual(args[:3],['systemctl','--user','show'])
        self.assertIn(args[3],self.values)
        self.assertEqual(args[4],'--property='+','.join(self.ns['PROPERTIES']))
        self.assertIn(args[5:],([],['--all']))
        return '\n'.join(k+'='+v for k,v in self.values[args[3]].items())

    def report(self): return self.ns['validate'](self.ns['inspect'](self.root))

    def test_exact_property_list_and_pinned_loader_match_frozen_source(self):
        tree=ast.parse(FENCE.read_text())
        expected=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PROPERTIES' for t in n.targets))
        self.assertEqual(self.ns['PROPERTIES'],expected)
        loader=FENCE.parent.parent/'model_completion/oracle_launch.py'
        self.assertEqual(diagnostic.blob(loader.read_bytes()),diagnostic.LOADER_BLOB)

    def test_complete_pinned_units_match_and_version_suffixes_are_private(self):
        report=self.report()
        self.assertEqual(report['systemctl_major'],252); self.assertEqual(report['manager_major'],252)
        for name in ('worker','tunnel'):
            self.assertEqual(report[name]['missing_normal'],[]); self.assertEqual(report[name]['missing_all'],[])
            self.assertEqual(report[name]['policy_mismatches'],{})
            self.assertEqual(report[name]['active'],'active'); self.assertTrue(report[name]['policy_matches']['Type'])
        self.assertNotIn('PRIVATE',json.dumps(report)); self.assertNotIn('/synthetic',json.dumps(report))
        self.assertFalse(report['maintenance_safe'])

    def test_unsupported_properties_stay_missing_even_with_all(self):
        for unit in self.values.values(): del unit['Upholds']; del unit['OnSuccess']
        report=self.report()
        for name in ('worker','tunnel'):
            self.assertEqual(set(report[name]['missing_normal']),{'Upholds','OnSuccess'})
            self.assertEqual(set(report[name]['missing_all']),{'Upholds','OnSuccess'})
            self.assertNotIn('Upholds',report[name]['empty_properties'])

    def test_empty_suppression_is_distinguished_from_unsupported(self):
        original=self.command
        def command(args):
            raw=original(args)
            return '\n'.join(line for line in raw.splitlines() if line!='ExecStartPre=') if '--all' not in args else raw
        self.ns['command']=command
        report=self.report()
        self.assertIn('ExecStartPre',report['worker']['missing_normal'])
        self.assertNotIn('ExecStartPre',report['worker']['missing_all'])
        self.assertIn('ExecStartPre',report['worker']['empty_properties'])

    def test_raw_commands_environment_paths_and_errors_never_leave_projection(self):
        for unit in self.values.values():
            unit['ExecStart']='{ PRIVATE_COMMAND --token=PRIVATE_SECRET }'
            unit['WorkingDirectory']='/PRIVATE_PATH'
            unit['ExecStop']='PRIVATE_HOOK'
            unit['Type']='PRIVATE_TYPE'; unit['Restart']='PRIVATE_RESTART'
            unit['Requires']='PRIVATE_DEPENDENCY --api-key=PRIVATE_CREDENTIAL'
        original=self.command
        def command(args):
            raw=original(args)
            is_unit=args[:3]==['systemctl','--user','show'] and len(args)>4 and args[3] in self.values
            return raw+'\nEnvironment=PRIVATE_ENV\nPRIVATE_ERROR_LINE\nExecStart=PRIVATE_DUPLICATE' if is_unit else raw
        self.ns['command']=command
        report=self.report(); text=json.dumps(report)
        self.assertNotIn('PRIVATE',text)
        self.assertTrue(report['worker']['normal_malformed'])
        self.assertTrue(report['worker']['normal_duplicate_property'])
        self.assertTrue(report['worker']['normal_unexpected_property'])
        self.assertEqual(report['worker']['policy_mismatches']['ExecStart'],'structured')
        self.assertFalse(report['worker']['policy_matches']['Type'])

    def test_command_failure_retains_other_safe_unit_observation(self):
        original=self.command
        def command(args):
            if 'froge-worker.service' in args: raise OSError('PRIVATE_FAILURE')
            return original(args)
        self.ns['command']=command
        report=self.report()
        self.assertFalse(report['worker']['normal_available']); self.assertIsNone(report['worker']['pid'])
        self.assertEqual(report['tunnel']['active'],'active'); self.assertNotIn('PRIVATE',json.dumps(report))

    def test_no_service_mutation_command_or_property_query_outside_allowlist(self):
        self.report()
        self.assertEqual(len(self.calls),6)
        for args in self.calls:
            self.assertTrue(args==['systemctl','--version'] or args[:3]==['systemctl','--user','show'])
            self.assertFalse(set(args)&{'stop','start','restart','kill','set-property','daemon-reload'})
            self.assertFalse(any('Environment' in arg for arg in args))

    def test_fixed_mismatch_shape_and_safe_numeric_projection(self):
        for unit in self.values.values():
            unit['KillSignal']='9'; unit['RootDirectory']='/PRIVATE_ROOT'
            unit['MainPID']='99999999999999999'; unit['RestartUSec']='PRIVATE_DURATION'
        report=self.report(); item=report['worker']
        self.assertEqual(item['policy_mismatches']['KillSignal'],'integer')
        self.assertEqual(item['policy_mismatches']['RootDirectory'],'text')
        self.assertIsNone(item['pid']); self.assertNotIn('PRIVATE',json.dumps(report))
        self.values['froge-worker.service']['MainPID']='PRIVATE_PID'
        report=self.report(); self.assertIsNone(report['worker']['pid'])
        self.assertEqual(report['worker']['policy_mismatches']['MainPID'],'text')
        self.assertNotIn('PRIVATE',json.dumps(report))

    def test_unicode_or_overlong_pid_does_not_discard_other_observations(self):
        for value in ('²','9'*10000):
            with self.subTest(value_kind='unicode' if len(value)==1 else 'overlong'):
                self.values['froge-worker.service']['MainPID']=value
                report=self.report()
                self.assertIsNone(report['worker']['pid'])
                self.assertFalse(report['worker']['policy_matches']['MainPID'])
                self.assertEqual(report['tunnel']['active'],'active')
                self.assertEqual(report['manager_major'],252)

    def test_output_validator_rejects_unapproved_strings_keys_and_numbers(self):
        for key,value in (('active','PRIVATE'),('pid',True),('policy_matches',999),('missing_all',['PRIVATE'])):
            report=self.report(); report['worker'][key]=value
            with self.assertRaises(ValueError): self.ns['validate'](report)
        report=self.report(); report['worker']['raw']='PRIVATE'
        with self.assertRaises(ValueError): self.ns['validate'](report)

    def test_time_and_output_limits_are_fixed(self):
        namespace={}; exec(diagnostic.REMOTE,namespace)
        result=types.SimpleNamespace(returncode=0,stdout='x'*65537)
        with patch.object(namespace['subprocess'],'run',return_value=result) as call:
            with self.assertRaises(ValueError): namespace['command'](['systemctl','--version'])
        self.assertEqual(call.call_args.kwargs['timeout'],3)
        self.assertEqual(call.call_args.kwargs['stderr'],namespace['subprocess'].DEVNULL)

class LauncherTests(unittest.TestCase):
    def test_default_is_inert_and_invalid_commit_precedes_download(self):
        with patch.object(diagnostic,'loader',side_effect=AssertionError()),patch.object(diagnostic.subprocess,'run',side_effect=AssertionError()),contextlib.redirect_stdout(io.StringIO()) as output:
            diagnostic.main([])
            with self.assertRaises(ValueError): diagnostic.main(['--inspect-units','--source-commit','main'])
        self.assertIn('PLAN_ONLY',output.getvalue())

    def test_loader_checks_hash_before_any_source_execution(self):
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
