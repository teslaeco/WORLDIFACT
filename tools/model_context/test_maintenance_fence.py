"""Disposable Linux kernel fixtures and separately mocked service integration.

Never contacts Oracle, invokes systemd/Podman, touches real models, or signals
anything except processes created by these tests (through exact pidfds).
"""
from contextlib import ExitStack
import ast
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import maintenance_fence as fence

CHILD = r'''
import os,sys,time,threading,subprocess,socket,signal
from pathlib import Path
folder=Path(sys.argv[1]);mode=sys.argv[2];done=threading.Event();child=None;sockets=[]
def worker():
 while not done.wait(.005):
  if (folder/'go').exists():
   if mode=='before_spawn':
    subprocess.run([sys.executable,'-c',"from pathlib import Path;import sys;Path(sys.argv[1]).touch()",str(folder/'spawned')],check=True)
   else:(folder/'resumed').touch()
   break
if mode=='blocked_term':signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM})
if mode=='caught_term':signal.signal(signal.SIGTERM,lambda *args:None)
if mode=='ignored_term':signal.signal(signal.SIGTERM,signal.SIG_IGN)
threading.Thread(target=worker,daemon=True).start()
if mode in ('listener','accepted','handler','unknown_socket'):
 listener=socket.socket();listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);listener.bind(('127.0.0.1',8765));listener.listen();sockets.append(listener)
 if mode in ('accepted','handler'):
  client=socket.socket();client.connect(listener.getsockname());accepted,_=listener.accept();sockets.extend([client,accepted])
 if mode=='handler':threading.Thread(target=done.wait,daemon=True).start()
 if mode=='unknown_socket':sockets.append(socket.socket())
if mode=='child':
 child=subprocess.Popen([sys.executable,'-c',"from pathlib import Path;import sys,time;p=Path(sys.argv[1]);n=0\nwhile True:\n n+=1;p.write_text(str(n));time.sleep(.01)",str(folder/'counter')])
print('READY',flush=True)
try:sys.stdin.readline()
finally:
 done.set()
 if child is not None:child.terminate();child.wait(timeout=2)
 for item in sockets:item.close()
'''


class Fixture:
    def __init__(self, mode):
        self.temp = tempfile.TemporaryDirectory(prefix='worldifact-inert-fence-')
        self.path = Path(self.temp.name)
        self.process = subprocess.Popen([sys.executable, '-u', '-c', CHILD, str(self.path), mode],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        if not select.select([self.process.stdout], [], [], 3)[0] or self.process.stdout.readline().strip() != 'READY':
            self.close()
            raise RuntimeError('Disposable fixture failed to start.')
        self.pidfd = os.pidfd_open(self.process.pid)
        self.ticks = fence._proc_stat(self.process.pid)[0]

    def close(self):
        if self.process.poll() is None:
            fd = os.pidfd_open(self.process.pid)
            try:
                signal.pidfd_send_signal(fd, signal.SIGCONT)
                self.process.stdin.write('quit\n')
                self.process.stdin.flush()
                try:
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    signal.pidfd_send_signal(fd, signal.SIGKILL)
                    self.process.wait(timeout=2)
            finally:
                os.close(fd)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()
        if hasattr(self, 'pidfd'):
            os.close(self.pidfd)
        self.temp.cleanup()


@unittest.skipUnless(hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'), 'Linux pidfds required')
class KernelFixtures(unittest.TestCase):
    def fixture(self, mode='idle'):
        fixture = Fixture(mode)
        self.addCleanup(fixture.close)
        return fixture

    def frozen(self, fixture, duration=5):
        guard = fence._Guard(fixture.pidfd, duration=duration)
        self.addCleanup(guard.close)
        guard.freeze(fixture.process.pid, fixture.ticks)
        return guard

    def wait_file(self, path):
        deadline = time.monotonic() + 2
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertTrue(path.exists())

    def test_all_threads_frozen_before_popen_then_exact_resume(self):
        fixture = self.fixture('before_spawn')
        guard = self.frozen(fixture)
        self.assertEqual(len(fence._baseline(fixture.process.pid)), 2)
        (fixture.path / 'go').touch()
        time.sleep(.06)
        self.assertFalse((fixture.path / 'spawned').exists())
        guard.close()
        self.wait_file(fixture.path / 'spawned')

    def test_exceptions_and_interrupts_resume(self):
        for error in (RuntimeError, KeyboardInterrupt, SystemExit):
            with self.subTest(error=error):
                fixture = self.fixture()
                guard = self.frozen(fixture)
                try:
                    raise error('fixture interruption')
                except BaseException:
                    guard.close()
                (fixture.path / 'go').touch()
                self.wait_file(fixture.path / 'resumed')

    def test_active_or_paused_handler_rejected(self):
        fixture = self.fixture('handler')
        self.frozen(fixture)
        with self.assertRaises(fence.FenceRefused) as error:
            fence._baseline(fixture.process.pid)
        self.assertEqual(error.exception.code, 'worker_not_idle')

    def test_accepted_socket_before_thread_start_rejected(self):
        fixture = self.fixture('accepted')
        self.frozen(fixture)
        self.assertEqual(len(fence._baseline(fixture.process.pid)), 2)
        with self.assertRaises(fence.FenceRefused) as error:
            fence._socket_idle(fixture.process.pid)
        self.assertEqual(error.exception.code, 'accepted_or_unknown_socket')

    def test_unidentified_socket_rejected(self):
        fixture = self.fixture('unknown_socket')
        self.frozen(fixture)
        with self.assertRaises(fence.FenceRefused):
            fence._socket_idle(fixture.process.pid)

    def test_unaccepted_backlog_cannot_run_while_origin_is_frozen(self):
        fixture = self.fixture('listener')
        self.frozen(fixture)
        client = socket.create_connection(('127.0.0.1', 8765), timeout=1)
        self.addCleanup(client.close)
        fence._socket_idle(fixture.process.pid)
        self.assertEqual(set(fence._tasks(fixture.process.pid).values()), {'T'})

    def test_child_keeps_running_while_parent_threads_frozen(self):
        fixture = self.fixture('child')
        self.wait_file(fixture.path / 'counter')
        self.frozen(fixture)
        first = (fixture.path / 'counter').read_text()
        time.sleep(.08)
        self.assertNotEqual(first, (fixture.path / 'counter').read_text())
        # The fixture's visible PPid evidence is not substituted for the strict
        # target /proc/task/children + cgroup checks.
        children = []
        for path in Path('/proc').iterdir():
            if path.name.isdigit():
                try:
                    if fence._proc_stat(int(path.name))[1] == fixture.process.pid:
                        children.append(path.name)
                except (FileNotFoundError, ProcessLookupError):
                    pass
        self.assertTrue(children)

    def test_guard_timeout_resumes_without_controller_help(self):
        fixture = self.fixture()
        guard = self.frozen(fixture, duration=.3)
        (fixture.path / 'go').touch()
        self.wait_file(fixture.path / 'resumed')
        self.assertEqual(guard.process.wait(timeout=2), 1)
        guard.close()

    def test_guard_death_controller_recovers_exact_process(self):
        fixture = self.fixture()
        guard = self.frozen(fixture)
        fd = os.pidfd_open(guard.process.pid)
        try:
            signal.pidfd_send_signal(fd, signal.SIGKILL)
            guard.process.wait(timeout=2)
        finally:
            os.close(fd)
        with self.assertRaises(fence.RecoveryRequired):
            guard.close()
        guard.process = None  # Cleanup already verified the explicit failure.
        (fixture.path / 'go').touch()
        self.wait_file(fixture.path / 'resumed')

    def test_controller_sigkill_or_disconnect_independent_resumer(self):
        script = """
import os,sys,time
sys.path.insert(0,sys.argv[1]);import maintenance_fence as f
fd=os.pidfd_open(int(sys.argv[2]));g=f._Guard(fd,duration=3);g.freeze(int(sys.argv[2]),int(sys.argv[3]))
print('FROZEN',flush=True);sys.stdin.readline()
"""
        for death in ('kill', 'disconnect'):
            with self.subTest(death=death):
                fixture = self.fixture()
                controller = subprocess.Popen([sys.executable, '-u', '-c', script,
                    str(Path(fence.__file__).parent), str(fixture.process.pid), str(fixture.ticks)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                self.assertTrue(select.select([controller.stdout], [], [], 3)[0])
                self.assertEqual(controller.stdout.readline().strip(), 'FROZEN')
                self.assertEqual(set(fence._tasks(fixture.process.pid).values()), {'T'})
                (fixture.path / 'go').touch()
                if death == 'kill':
                    fd = os.pidfd_open(controller.pid)
                    try:
                        signal.pidfd_send_signal(fd, signal.SIGKILL)
                    finally:
                        os.close(fd)
                else:
                    controller.stdin.close()
                controller.wait(timeout=2)
                self.wait_file(fixture.path / 'resumed')
                for stream in (controller.stdin, controller.stdout, controller.stderr):
                    stream.close()

    def test_dead_pidfd_cannot_freeze_replacement(self):
        old = self.fixture()
        old.process.stdin.write('quit\n'); old.process.stdin.flush(); old.process.wait(timeout=2)
        replacement = self.fixture()
        with self.assertRaises(ProcessLookupError):
            signal.pidfd_send_signal(old.pidfd, signal.SIGSTOP)
        (replacement.path / 'go').touch()
        self.wait_file(replacement.path / 'resumed')

    def test_unverified_group_stop_times_out_and_resumes(self):
        fixture = self.fixture()
        guard = fence._Guard(fixture.pidfd, duration=3)
        self.addCleanup(guard.close)
        with patch.object(fence, '_tasks', return_value={fixture.process.pid:'R'}):
            with self.assertRaises(fence.FenceRefused) as error:
                guard.freeze(fixture.process.pid, fixture.ticks)
        self.assertEqual(error.exception.code,'freeze_timeout')
        guard.close()
        (fixture.path / 'go').touch()
        self.wait_file(fixture.path / 'resumed')

    def test_guard_start_failure_never_freezes(self):
        fixture = self.fixture()
        with patch.object(fence.subprocess, 'Popen', side_effect=OSError('inert')):
            with self.assertRaises(OSError):
                fence._Guard(fixture.pidfd)
        (fixture.path / 'go').touch()
        self.wait_file(fixture.path / 'resumed')

    def test_nondefault_or_blocked_term_is_refused(self):
        for mode in ('blocked_term', 'caught_term', 'ignored_term'):
            with self.subTest(mode=mode):
                fixture = self.fixture(mode)
                self.frozen(fixture)
                with self.assertRaises(fence.FenceRefused) as error:
                    fence._default_term(fixture.process.pid)
                self.assertEqual(error.exception.code, 'term_disposition_unproven')

    def test_clean_term_targets_only_disposable_pidfd_with_mocked_systemd(self):
        fixture = self.fixture('before_spawn')
        guard = self.frozen(fixture)
        (fixture.path / 'go').touch()
        original = unit(fence.WORKER, fixture.path)
        original['MainPID'] = str(fixture.process.pid)
        tunnel = unit(fence.TUNNEL, fixture.path)
        config = {'source': str(fixture.path), 'files': {}, 'worker': original,
                  'tunnel': tunnel, 'pid': fixture.process.pid, 'ticks': fixture.ticks,
                  'expected_sources': fence.EXPECTED}
        def snapshot(operations, name):
            if name == fence.TUNNEL:
                return tunnel.copy()
            result = original.copy()
            if fixture.process.poll() is not None:
                result.update(ActiveState='inactive', SubState='dead', MainPID='0',
                              ControlGroup='', Result='success', ExecMainCode='2', ExecMainStatus='15')
            return result
        with ExitStack() as stack:
            for name in ('_source', '_same_files', '_same_worker'):
                stack.enter_context(patch.object(fence, name))
            stack.enter_context(patch.object(fence, '_unit', side_effect=snapshot))
            stack.enter_context(patch.object(fence._GuardOperations, 'command', side_effect=AssertionError('No real service commands')))
            fence._guard_stop(config, fixture.pidfd, time.monotonic() + 5)
        self.assertEqual(fixture.process.wait(timeout=1), -signal.SIGTERM)
        self.assertFalse((fixture.path / 'spawned').exists())
        guard.close()


class DatabaseGates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name)
        (self.source / 'state').mkdir()
        self.path = self.source / 'state/jobs.sqlite'
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE jobs(id TEXT,state TEXT)')

    def test_only_succeeded_failed_pass_without_rewriting_history(self):
        for state in ('succeeded', 'failed', 'cancelled', 'queued', 'generating', 'building', 'unknown', None):
            with self.subTest(state=state):
                with sqlite3.connect(self.path) as db:
                    db.execute('DELETE FROM jobs')
                    db.execute('INSERT INTO jobs VALUES (?,?)', ('inert', state))
                if state in ('succeeded', 'failed'):
                    with fence.database_gate(self.source, frozen=True):
                        pass
                else:
                    with self.assertRaises(fence.FenceRefused) as error:
                        with fence.database_gate(self.source, frozen=True):
                            self.fail('Unsafe history was admitted.')
                    self.assertEqual(error.exception.code, 'unsafe_job_history')
                with sqlite3.connect(self.path) as db:
                    self.assertEqual(db.execute('SELECT state FROM jobs').fetchone(), (state,))

    def test_cancel_after_preflight_refused_by_frozen_recheck(self):
        with fence.database_gate(self.source):
            pass
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO jobs VALUES ('inert','cancelled')")
        with self.assertRaises(fence.FenceRefused):
            with fence.database_gate(self.source, frozen=True):
                self.fail('Cancellation raced the preflight.')

    def test_explicit_consent_is_single_identity_bound_and_never_allows_active_or_unknown(self):
        identity='00000000-0000-4000-8000-000000000001'
        for frozen in (False,True):
            for state in ('cancelled','queued','generating','building','retrying','unknown',None):
                with self.subTest(frozen=frozen,state=state):
                    with sqlite3.connect(self.path) as db:
                        db.execute('DELETE FROM jobs'); db.execute('INSERT INTO jobs VALUES (?,?)',(identity,state))
                    before=self.path.read_bytes()
                    if state=='cancelled':
                        with fence.database_gate(self.source,frozen=frozen,allow_cancelled_cleanup=True,expected_cancelled=(identity,)) as bound:
                            self.assertEqual(bound,(identity,))
                    else:
                        with self.assertRaises(fence.FenceRefused):
                            with fence.database_gate(self.source,frozen=frozen,allow_cancelled_cleanup=True,expected_cancelled=(identity,)): pass
                    self.assertEqual(self.path.read_bytes(),before)

    def test_second_or_replaced_cancelled_job_refuses_even_with_consent(self):
        first='00000000-0000-4000-8000-000000000001'; second='00000000-0000-4000-8000-000000000002'
        for identities in ((second,),(first,second)):
            with sqlite3.connect(self.path) as db:
                db.execute('DELETE FROM jobs'); db.executemany('INSERT INTO jobs VALUES (?,?)',[(value,'cancelled') for value in identities])
            with self.assertRaises(fence.FenceRefused) as error:
                with fence.database_gate(self.source,frozen=True,allow_cancelled_cleanup=True,expected_cancelled=(first,)): pass
            self.assertEqual(error.exception.code,'cancelled_scope_changed')

    def test_truthy_nonboolean_consent_is_not_an_override(self):
        for value in (1,'true',None):
            with self.assertRaises(fence.FenceRefused):
                with fence.database_gate(self.source,allow_cancelled_cleanup=value): pass

    def test_lock_contention_refuses_without_modifying_rows(self):
        with sqlite3.connect(self.path) as db:
            db.execute('BEGIN IMMEDIATE')
            with self.assertRaises(fence.FenceRefused) as error:
                with fence.database_gate(self.source, frozen=True, timeout=.01):
                    self.fail('Contended lock was admitted.')
            self.assertEqual(error.exception.code, 'database_unproven')


def unit(name, source):
    value = {key: '' for key in fence.PROPERTIES}
    value.update(Id=name, LoadState='loaded', ActiveState='active', SubState='running',
        MainPID='45678' if name == fence.WORKER else '45679', InvocationID='a'*32,
        Type='simple', Restart='on-failure', RestartUSec='5s' if name == fence.WORKER else '10s', WatchdogUSec='0', RuntimeMaxUSec='infinity',
        KillMode='control-group', KillSignal='15', SendSIGHUP='no', RemainAfterExit='no',
        NeedDaemonReload='no', StopWhenUnneeded='no', WorkingDirectory=str(source),
        ExecStart='{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 ' + str(source/'server.py') + ' ; ignore_errors=no ; start_time=n/a ; }',
        ControlGroup='/synthetic/' + name, FragmentPath='/synthetic/' + name,
        Wants='froge-ollama.service' if name == fence.WORKER else '', NRestarts='0', Result='success', ExecMainCode='0', ExecMainStatus='0')
    if name == fence.TUNNEL:
        executable = str(source / 'bin/cloudflared')
        value['ExecStart'] = '{ path=' + executable + ' ; argv[]=' + executable + ' tunnel --no-autoupdate --protocol http2 --url http://127.0.0.1:8765 --logfile ' + str(source / 'state/tunnel.log') + ' ; ignore_errors=no ; start_time=n/a ; }'
    return value


class MockOperations:
    def __init__(self, home):
        self.home = home
        self.source = home / 'froge-connector'
        (self.source / 'state').mkdir(parents=True)
        with sqlite3.connect(self.source / 'state/jobs.sqlite') as db:
            db.execute('CREATE TABLE jobs(id TEXT,state TEXT)')
        self.units = {name: unit(name, self.source) for name in (fence.WORKER, fence.TUNNEL)}
        self.events = []
        self.failure = None

    def command(self, args, timeout=0):
        self.events.append(tuple(args))
        if self.failure and self.failure(args):
            raise OSError('synthetic command failure')
        if args[0] == 'podman':
            return '[]'
        action, name = args[2:4]
        if action == 'show':
            return '\n'.join(k + '=' + self.units[name][k] for k in fence.PROPERTIES)
        if action == 'stop':
            self.units[name].update(ActiveState='inactive', SubState='dead', MainPID='0', ControlGroup='')
        if action == 'start':
            self.units[name].update(ActiveState='active', SubState='running', MainPID='45680', InvocationID='b'*32)
        return ''

    def assert_verifier_drained(self):
        return True  # Mocked ownership proof; real verification needs a supervisor.

    def state(self, name):
        return self.units[name]['ActiveState']


class MockIntegration(unittest.TestCase):
    """These tests deliberately mock ALL signals, unit calls and resource proof."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.operations = MockOperations(Path(self.temp.name))
        operations = self.operations
        self.closed = False
        self.stop_error = False
        owner = self
        class Guard:
            def __init__(self, pidfd, config):
                self.config = config
                owner.guard_config = config
                operations.events.append(('guard-ready',))
            def freeze(self, pid, ticks):
                operations.events.append(('freeze',))
                if getattr(owner,'after_freeze',None): owner.after_freeze()
            def stop(self):
                operations.events.append(('guard-stop',))
                if owner.stop_error:
                    raise fence.FenceRefused('stop_timeout', 'Synthetic timeout')
                operations.units[fence.WORKER].update(ActiveState='inactive', SubState='dead', MainPID='0', ControlGroup='')
            def close(self):
                owner.closed = True
                operations.events.append(('guard-close',))
                if operations.units[fence.WORKER]['ActiveState'] == 'active' and not owner.stop_error:
                    operations.units[fence.TUNNEL].update(ActiveState='active', MainPID='45679', InvocationID='a'*32)
        self.stack = self.enterContext(ExitStack())
        for name, value in {'_source': None, '_unit_files': {}, '_same_files': None,
                            '_running_identity': (123, 0), '_same_worker': None,
                            '_resources': None, '_dead': True}.items():
            self.stack.enter_context(patch.object(fence, name, return_value=value))
        self.stack.enter_context(patch.object(fence, '_Guard', Guard))
        self.stack.enter_context(patch.object(fence.os, 'pidfd_open', return_value=123456))
        self.stack.enter_context(patch.object(fence.os, 'close'))

    def healthy(self, lease):
        self.operations.command(['systemctl', '--user', 'start', fence.WORKER])
        lease.confirm_healthy(lease.worker_identity())

    def test_yield_only_inactive_lock_released_original_tunnel_preserved(self):
        with fence.quiesce(self.operations) as lease:
            self.assertEqual(self.operations.state(fence.WORKER), 'inactive')
            self.assertEqual(self.operations.state(fence.TUNNEL), 'active')
            # Server startup's unconditional UPDATE can take the write lock.
            with sqlite3.connect(self.operations.source/'state/jobs.sqlite', timeout=.01) as db:
                db.execute('BEGIN IMMEDIATE')
            self.healthy(lease)
        self.assertEqual(self.operations.state(fence.TUNNEL), 'active')
        self.assertTrue(self.closed)

    def test_unsupported_unit_semantics_refuse_before_any_mutation(self):
        for prop, value in [('Restart','always'), ('WatchdogUSec','1min'), ('RuntimeMaxUSec','1h'),
                            ('TriggeredBy','inert.socket'), ('Job','99 inert/start'),
                            ('ExecStop','synthetic-hook'), ('NeedDaemonReload','yes')]:
            with self.subTest(prop=prop):
                original = self.operations.units[fence.WORKER][prop]
                self.operations.units[fence.WORKER][prop] = value
                self.operations.events.clear()
                with self.assertRaises(fence.FenceRefused):
                    with fence.quiesce(self.operations):
                        self.fail('Unsupported semantics admitted.')
                self.assertTrue(all(event[2] == 'show' for event in self.operations.events))
                self.operations.units[fence.WORKER][prop] = original

    def test_cancelled_history_prevents_any_process_mutation(self):
        with sqlite3.connect(self.operations.source/'state/jobs.sqlite') as db:
            db.execute("INSERT INTO jobs VALUES ('inert','cancelled')")
        with self.assertRaises(fence.FenceRefused) as error:
            with fence.quiesce(self.operations):
                self.fail('Cancelled history admitted.')
        self.assertEqual(error.exception.code, 'unsafe_job_history')
        self.assertFalse(self.operations.events)

    def test_explicit_cleanup_consent_reaches_guard_and_preserves_row(self):
        identity='00000000-0000-4000-8000-000000000001'
        self.operations.allow_cancelled_cleanup=True
        path=self.operations.source/'state/jobs.sqlite'
        with sqlite3.connect(path) as db: db.execute('INSERT INTO jobs VALUES (?,?)',(identity,'cancelled'))
        before=path.read_bytes()
        with fence.quiesce(self.operations) as lease:
            self.assertIs(self.guard_config['allow_cancelled_cleanup'],True)
            self.assertEqual(self.guard_config['cancelled_job_ids'],[identity])
            self.assertEqual(self.operations.cancelled_job_ids,(identity,))
            self.healthy(lease)
        self.assertEqual(path.read_bytes(),before)

    def test_enabled_scope_race_resumes_before_stop(self):
        identity='00000000-0000-4000-8000-000000000001'
        self.operations.allow_cancelled_cleanup=True
        path=self.operations.source/'state/jobs.sqlite'
        with sqlite3.connect(path) as db: db.execute('INSERT INTO jobs VALUES (?,?)',(identity,'cancelled'))
        def replace():
            with sqlite3.connect(path) as db: db.execute('UPDATE jobs SET id=?',('00000000-0000-4000-8000-000000000002',))
        self.after_freeze=replace
        with self.assertRaises(fence.FenceRefused) as error:
            with fence.quiesce(self.operations): self.fail('replaced cancellation admitted')
        self.assertEqual(error.exception.code,'cancelled_scope_changed')
        self.assertTrue(self.closed); self.assertNotIn(('guard-stop',),self.operations.events)

    def test_enabled_consent_never_bypasses_resource_rejection(self):
        self.operations.allow_cancelled_cleanup=True
        with patch.object(fence,'_resources',side_effect=fence.FenceRefused('work_survived','fixture')):
            with self.assertRaises(fence.FenceRefused):
                with fence.quiesce(self.operations): self.fail('resource proof bypassed')
        self.assertTrue(self.closed); self.assertNotIn(('guard-stop',),self.operations.events)

    def test_resource_or_identity_refusal_leaves_original_tunnel_untouched(self):
        for gate in ('_resources', '_same_worker'):
            with self.subTest(gate=gate):
                with patch.object(fence, gate, side_effect=fence.FenceRefused('inert_refusal','test')):
                    with self.assertRaises(fence.FenceRefused):
                        with fence.quiesce(self.operations):
                            self.fail('Failed evidence admitted.')
                self.assertEqual(self.operations.state(fence.TUNNEL), 'active')

    def test_uncertain_exit_never_kills_replacement_and_requires_recovery(self):
        self.stop_error = True
        with self.assertRaises(fence.RecoveryRequired) as error:
            with fence.quiesce(self.operations):
                self.fail('Failed stop admitted.')
        self.assertEqual(error.exception.code, 'stop_timeout')
        self.assertEqual(self.operations.state(fence.TUNNEL), 'active')
        self.assertFalse(any(event[:3] == ('systemctl','--user','start') for event in self.operations.events))

    def test_unconfirmed_success_or_error_requires_recovery_without_tunnel_restart(self):
        for raised in (False, True):
            with self.subTest(raised=raised):
                self.operations.units = {name: unit(name, self.operations.source) for name in (fence.WORKER, fence.TUNNEL)}
                with self.assertRaises(fence.RecoveryRequired) as error:
                    with fence.quiesce(self.operations):
                        if raised:
                            raise RuntimeError('Synthetic verification failure')
                self.assertEqual(error.exception.code, 'health_not_confirmed')
                self.assertEqual(self.operations.state(fence.TUNNEL), 'active')

    def test_rollback_health_confirmation_preserves_tunnel_identity(self):
        with fence.quiesce(self.operations) as lease:
            # Installer has restored bytes and then verified rollback health.
            self.healthy(lease)
        self.assertEqual(self.operations.state(fence.TUNNEL), 'active')

    def test_changed_server_alone_is_not_a_reviewed_rollback_manifest(self):
        self.operations.expected_server_sha256 = 'f' * 64
        with self.assertRaises(fence.FenceRefused) as error:
            with fence.quiesce(self.operations):
                self.fail('Server-only ancestry override accepted.')
        self.assertEqual(error.exception.code, 'incomplete_reviewed_manifest')

    def test_full_staged_manifest_is_used_during_refence(self):
        self.operations.expected_source_sha256 = {**fence.EXPECTED, 'server.py':'f'*64,
            'codex_runner.py':'e'*64, 'context_policy.py':'d'*64}
        with fence.quiesce(self.operations) as lease:
            self.healthy(lease)
        self.assertTrue(any(call.kwargs.get('expected_sources') == self.operations.expected_source_sha256
                            for call in fence._source.call_args_list))

    def test_tunnel_identity_loss_after_health_requires_recovery_without_restart(self):
        with self.assertRaises(fence.RecoveryRequired):
            with fence.quiesce(self.operations) as lease:
                self.operations.command(['systemctl','--user','start',fence.WORKER])
                self.operations.units[fence.TUNNEL]['InvocationID'] = 'c'*32
                lease.confirm_healthy(lease.worker_identity())
        self.assertFalse(any(event[:4] == ('systemctl','--user','start',fence.TUNNEL)
                             for event in self.operations.events))

    def test_assert_no_work_rejects_verification_descendants(self):
        with fence.quiesce(self.operations) as lease:
            with patch.object(fence, '_tasks', return_value={123:'R'}), patch.object(Path,'exists',return_value=False), patch.object(Path,'read_text',return_value='789'):
                with self.assertRaises(fence.RecoveryRequired) as error:
                    lease.assert_no_work()
                self.assertEqual(error.exception.code, 'verification_children_present')
            self.healthy(lease)

    def test_committed_but_unconfirmed_health_is_not_overridden(self):
        with fence.quiesce(self.operations) as lease:
            lease.confirm_activation_committed()
            self.assertFalse(lease.healthy)
        self.assertTrue(lease.activation_committed)

    def test_missing_owned_verifier_scope_refuses(self):
        self.operations.assert_verifier_drained = None
        with fence.quiesce(self.operations) as lease:
            with self.assertRaises(fence.RecoveryRequired) as error:
                lease.assert_no_work()
            self.assertEqual(error.exception.code, 'verification_scope_unproven')
            self.healthy(lease)

    def test_health_checked_worker_cannot_be_replaced_before_confirmation(self):
        with self.assertRaises(fence.RecoveryRequired):
            with fence.quiesce(self.operations) as lease:
                self.operations.command(['systemctl','--user','start',fence.WORKER])
                verified = lease.worker_identity()
                self.operations.units[fence.WORKER].update(MainPID='99999',InvocationID='e'*32,NRestarts='1')
                with self.assertRaises(fence.RecoveryRequired) as error:
                    lease.confirm_healthy(verified)
                self.assertEqual(error.exception.code,'health_worker_replaced')

    def test_exact_pinned_ollama_dependency_only(self):
        fence._unit_policy(self.operations.units[fence.WORKER],self.operations.source)
        self.operations.units[fence.WORKER]['Wants']='froge-ollama.service arbitrary.service'
        with self.assertRaises(fence.FenceRefused) as error:
            fence._unit_policy(self.operations.units[fence.WORKER],self.operations.source)
        self.assertEqual(error.exception.code,'unsupported_unit_wants')


class ReadOnlyEvidence(unittest.TestCase):
    def test_missing_or_invalid_podman_evidence_never_means_empty(self):
        for output in ('{}', 'null', '[{"State":"running"}]', 'unavailable'):
            operations = type('Ops', (), {'command': lambda self, args, timeout, result=output: result})()
            with self.assertRaises(fence.FenceRefused):
                fence._podman_empty(operations)

    def test_podman_failure_is_not_empty(self):
        operations = type('Ops', (), {'command': lambda self, args, timeout: (_ for _ in ()).throw(OSError('inert'))})()
        with self.assertRaises(fence.FenceRefused) as error:
            fence._podman_empty(operations)
        self.assertEqual(error.exception.code, 'podman_unproven')

    def test_missing_descendant_visibility_refuses(self):
        with patch.object(Path, 'read_text', side_effect=FileNotFoundError('inert')):
            with self.assertRaises(FileNotFoundError):
                fence._no_children(123, {123: 'T'})

    def test_present_descendant_refuses(self):
        with patch.object(Path, 'read_text', return_value='456'):
            with self.assertRaises(fence.FenceRefused) as error:
                fence._no_children(123, {123: 'T'})
        self.assertEqual(error.exception.code, 'worker_has_children')

    def test_unit_snapshot_rejects_missing_duplicate_and_unknown_properties(self):
        for value in ('MainPID=1', 'MainPID=1\nMainPID=1', 'Extra=true'):
            operations = type('Ops', (), {'command': lambda self, args, timeout, result=value: result})()
            with self.assertRaises(fence.FenceRefused):
                fence._unit(operations, fence.WORKER)


class GuardStateMachine(unittest.TestCase):
    """All process signals and service observations in this class are mocks."""
    def setUp(self):
        source = Path('/synthetic/froge-connector')
        self.worker, self.tunnel = unit(fence.WORKER, source), unit(fence.TUNNEL, source)
        self.config = {'source': str(source), 'files': {}, 'worker': self.worker,
            'tunnel': self.tunnel, 'pid': 45678, 'ticks': 123, 'expected_sources': fence.EXPECTED}
        self.stack = self.enterContext(ExitStack())
        for name in ('_source', '_same_files', '_same_worker', '_default_term', '_same_tunnel'):
            self.stack.enter_context(patch.object(fence, name))
        self.signals = self.stack.enter_context(patch.object(fence.signal, 'pidfd_send_signal'))
        self.stack.enter_context(patch.object(fence, '_dead', return_value=True))
        self.stack.enter_context(patch.object(fence._GuardOperations, 'command', side_effect=AssertionError('No external command')))

    def test_replacement_is_never_signalled(self):
        changed = {**self.worker, 'MainPID':'98765', 'InvocationID':'f'*32, 'NRestarts':'1'}
        with patch.object(fence, '_unit', return_value=changed):
            with self.assertRaises(fence.FenceRefused) as error:
                fence._guard_stop(self.config, 4321, time.monotonic()+5)
        self.assertEqual(error.exception.code, 'worker_replaced')
        self.assertEqual(self.signals.call_args_list, [unittest.mock.call(4321, signal.SIGTERM), unittest.mock.call(4321, signal.SIGCONT)])

    def test_expired_stop_budget_sends_no_termination(self):
        with self.assertRaises(fence.FenceRefused) as error:
            fence._guard_stop(self.config, 4321, time.monotonic()+.1)
        self.assertEqual(error.exception.code, 'freeze_deadline')
        self.signals.assert_not_called()

    def test_bad_exit_status_is_not_success(self):
        stopped = {**self.worker, 'ActiveState':'inactive', 'SubState':'dead', 'MainPID':'0',
                   'ControlGroup':'', 'Result':'signal', 'ExecMainCode':'2', 'ExecMainStatus':'9'}
        with patch.object(fence, '_unit', return_value=stopped):
            with self.assertRaises(fence.FenceRefused) as error:
                fence._guard_stop(self.config, 4321, time.monotonic()+5)
        self.assertEqual(error.exception.code, 'clean_exit_unproven')

    def test_guard_is_disarmed_before_fallback_resume(self):
        events = []
        class Process:
            returncode = None
            def wait(self, timeout):
                events.append('wait')
                if self.returncode is None:
                    self.returncode = -9
                    raise subprocess.TimeoutExpired('inert', timeout)
                return self.returncode
        guard = object.__new__(fence._Guard)
        guard.pidfd, guard.guard_pidfd, guard.process = 100, 101, Process()
        guard.control = guard.reply = None
        def sent(fd, sig):
            events.append((fd, sig))
        with patch.object(fence.signal, 'pidfd_send_signal', side_effect=sent), patch.object(fence.os,'close'):
            with self.assertRaises(fence.RecoveryRequired):
                guard.close()
        self.assertLess(events.index((101, signal.SIGKILL)), events.index((100, signal.SIGCONT)))
        self.assertEqual(events[:3], ['wait', (101, signal.SIGKILL), 'wait'])


class ExactTerminalSource(unittest.TestCase):
    def test_reviewed_worker_terminals_cannot_resume_model_work(self):
        source = Path(os.environ.get('MODEL_COMPLETION_SOURCE', Path(__file__).resolve().parents[2]/'.model-completion-source/oracle_connector'))
        if not source.is_dir() and not os.environ.get('MODEL_CONTEXT_ANCESTOR'):
            self.skipTest('Pinned source fixture required for exact terminal-flow proof.')
        from test_context import before_sources
        raw = before_sources()['server.py']
        self.assertEqual(hashlib.sha256(raw).hexdigest(), fence.EXPECTED['server.py'])
        worker = next(n for n in ast.parse(raw).body if isinstance(n,ast.FunctionDef) and n.name=='worker')
        terminal = []
        def inspect(node):
            for _, value in ast.iter_fields(node):
                if isinstance(value,list):
                    for index,item in enumerate(value):
                        if not isinstance(item,ast.AST):
                            continue
                        if isinstance(item,ast.Expr) and isinstance(item.value,ast.Call):
                            call=item.value
                            if isinstance(call.func,ast.Name) and call.func.id=='status' and len(call.args)>1 and isinstance(call.args[1],ast.Constant) and call.args[1].value in ('succeeded','failed'):
                                kind=call.args[1].value;terminal.append(kind);tail=value[index+1:]
                                if kind=='succeeded':
                                    self.assertTrue(len(tail)==1 and isinstance(tail[0],(ast.Continue,ast.Break)))
                                else:self.assertEqual(tail,[])
                        inspect(item)
                elif isinstance(value,ast.AST):inspect(value)
        inspect(worker)
        self.assertEqual(terminal.count('succeeded'),3)
        self.assertEqual(terminal.count('failed'),2)
        final = next(n for n in worker.body[0].body if isinstance(n,ast.Try)).finalbody
        self.assertEqual(len(final),2)
        self.assertEqual(ast.unparse(final[0].value.args[0]), "folder / 'timing.json'")
        calls={n.func.id if isinstance(n.func,ast.Name) else n.func.attr for stmt in final for n in ast.walk(stmt) if isinstance(n,ast.Call)}
        self.assertEqual(calls,{'write_json','round','monotonic','pop','discard'})


if __name__ == '__main__':
    unittest.main(verbosity=2)
