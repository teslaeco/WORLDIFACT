"""Disposable kernel fixtures, with an explicit fixture-only visibility shim.

This executor lacks /proc/self/task/TID/children. PPid enumeration below lets
us exercise adoption and pidfd cleanup; it is NEVER target admission evidence.
The production reader is separately required to refuse missing visibility.
No services, model/provider calls, real assets, or package installation.
"""
import importlib.util
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import verification_scope as scope


def fixture_children():
    children = set()
    for path in Path('/proc').iterdir():
        if path.name.isdigit():
            try:
                fields = (path / 'stat').read_text().rsplit(')', 1)[1].split()
                if int(fields[1]) == os.getpid():
                    children.add(int(path.name))
            except (FileNotFoundError, ProcessLookupError):
                pass
    return children


# stdin/stdout are replaced so detached descendants do not hold the controller
# test runner's capture pipes. Synchronization uses only a disposable directory.
FORKER = r'''
import os,signal,sys,time
from pathlib import Path
root=Path(sys.argv[1]);mode=sys.argv[2]
if mode!='direct':
 if os.fork():os._exit(0)
 os.setsid()
 if os.fork():os._exit(0)
if mode=='on_term':
 def term(*args):
  if os.fork()==0:
   signal.signal(signal.SIGTERM,signal.SIG_IGN)
   (root/'late').write_text(str(os.getpid()))
   while True:time.sleep(.01)
  os._exit(0)
 signal.signal(signal.SIGTERM,term)
else:signal.signal(signal.SIGTERM,signal.SIG_IGN)
(root/'ready').write_text(str(os.getpid()))
while not (root/'exit').exists():time.sleep(.005)
os._exit(0)
'''


class ContractTests(unittest.TestCase):
    def test_import_and_construction_are_inert(self):
        with patch.object(scope.ctypes, 'CDLL', side_effect=AssertionError('prctl')):
            spec = importlib.util.spec_from_file_location('inert_scope', scope.__file__)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.VerificationScope()

    def test_missing_children_visibility_refuses_before_prctl(self):
        with patch.object(Path, 'read_text', side_effect=FileNotFoundError), \
                patch.object(scope, '_subreaper') as prctl:
            with self.assertRaises(scope.VerificationRefused) as raised:
                scope.VerificationScope().start()
            self.assertEqual(raised.exception.code, 'verification_scope_unproven')
            prctl.assert_not_called()

    def test_unstarted_scope_cannot_attest(self):
        guard = scope.VerificationScope()
        for operation in (guard.assert_drained, guard.close, guard.cleanup):
            with self.assertRaises(scope.VerificationRefused):
                operation()

    def test_kernel_live_child_is_not_empty(self):
        with patch.object(scope.os, 'waitid', return_value=None):
            self.assertFalse(scope._kernel_empty())

    def test_missing_waitid_visibility_has_fixed_refusal(self):
        with patch.object(scope.os, 'waitid', side_effect=PermissionError):
            with self.assertRaisesRegex(scope.VerificationRefused,
                                        '^verification_scope_unproven$'):
                scope._kernel_empty()

    def test_missing_pidfd_kernel_support_refuses_before_subreaper_change(self):
        with patch.object(scope, '_children', return_value=set()), \
                patch.object(scope, '_kernel_empty', return_value=True), \
                patch.object(scope.os, 'pidfd_open', side_effect=OSError), \
                patch.object(scope, '_subreaper') as prctl:
            with self.assertRaisesRegex(scope.VerificationRefused,
                                        '^verification_scope_unproven$'):
                scope.VerificationScope().start()
            prctl.assert_not_called()

    def test_missing_prctl_has_fixed_refusal(self):
        with patch.object(scope.ctypes, 'CDLL', side_effect=OSError):
            with self.assertRaisesRegex(scope.VerificationRefused,
                                        '^verification_scope_unproven$'):
                scope._subreaper()


@unittest.skipUnless(sys.platform == 'linux' and hasattr(os, 'fork')
                     and hasattr(os, 'pidfd_open') and hasattr(os, 'P_PIDFD')
                     and hasattr(signal, 'pidfd_send_signal'), 'Linux pidfds required')
class KernelFixtures(unittest.TestCase):
    def setUp(self):
        self.previous = scope._subreaper()
        self.temp = tempfile.TemporaryDirectory(prefix='worldifact-inert-subreaper-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.visibility = patch.object(scope, '_children', fixture_children)
        self.visibility.start()
        self.addCleanup(self.visibility.stop)
        self.guard = None
        self.addCleanup(self.finish)

    def finish(self):
        if self.guard is not None and self.guard._active:
            self.guard.cleanup()
            self.guard.close()
        self.assertEqual(scope._subreaper(), self.previous)

    def start(self):
        self.guard = scope.VerificationScope(term_seconds=.08, kill_seconds=2)
        return self.guard.start()

    def child(self, mode='direct'):
        process = subprocess.Popen([sys.executable, '-B', '-c', FORKER,
                                    str(self.root), mode], stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Scope cleanup reaps using pidfds; avoid Popen's later destructor wait.
        self.addCleanup(lambda: process.poll())
        self.wait_file('ready')
        if mode != 'direct':
            process.wait(timeout=2)
        return process

    def wait_file(self, name):
        deadline = time.monotonic() + 2
        path = self.root / name
        while not path.exists() and time.monotonic() < deadline:
            time.sleep(.005)
        self.assertTrue(path.exists(), name)
        return path

    def wait_drained(self):
        deadline = time.monotonic() + 2
        while True:
            try:
                self.guard.assert_drained()
                return
            except scope.VerificationRefused as error:
                if error.code != 'verification_descendants_present' or time.monotonic() >= deadline:
                    raise
                time.sleep(.005)

    def test_empty_scope_restores_previous_flag(self):
        self.start()
        self.assertEqual(scope._subreaper(), 1)
        self.guard.assert_drained()
        self.guard.close()
        self.assertEqual(scope._subreaper(), self.previous)
        self.guard.assert_drained()
        self.guard.close()

    def test_already_set_subreaper_is_preserved(self):
        scope._subreaper(1)
        try:
            self.start().close()
            self.assertEqual(scope._subreaper(), 1)
        finally:
            scope._subreaper(self.previous)

    def test_preexisting_child_refused_and_not_signalled(self):
        child = self.child()
        try:
            with self.assertRaises(scope.VerificationRefused) as raised:
                self.start()
            self.assertEqual(raised.exception.code, 'verification_children_preexisting')
            self.assertIsNone(child.poll())
            self.assertEqual(scope._subreaper(), self.previous)
        finally:
            (self.root / 'exit').touch()
            child.wait(timeout=2)

    def test_normal_child_exit_is_reaped_before_success(self):
        self.start()
        child = self.child()
        (self.root / 'exit').touch()
        self.wait_drained()
        self.assertTrue(scope._kernel_empty())
        self.assertFalse(fixture_children())
        child.poll()

    def test_double_fork_setsid_orphan_is_adopted_and_reaped(self):
        self.start()
        self.child('orphan')
        orphan = int((self.root / 'ready').read_text())
        self.assertIn(orphan, fixture_children())
        (self.root / 'exit').touch()
        self.wait_drained()
        self.assertTrue(scope._kernel_empty())

    def test_survivor_refuses_success_and_close_then_cleanup_kills(self):
        self.start()
        self.child('orphan')
        orphan = int((self.root / 'ready').read_text())
        with self.assertRaisesRegex(scope.VerificationRefused,
                                    '^verification_descendants_present$'):
            self.guard.assert_drained()
        with self.assertRaises(scope.VerificationRefused):
            self.guard.close()
        self.assertEqual(scope._subreaper(), 1)
        self.guard.cleanup()
        self.guard.close()
        self.assertFalse((Path('/proc') / str(orphan)).exists())

    def test_cleanup_accounts_for_newly_reparented_descendant(self):
        self.start()
        self.child('on_term')
        self.guard.cleanup()
        late = int(self.wait_file('late').read_text())
        self.assertFalse((Path('/proc') / str(late)).exists())
        self.guard.close()

    def test_pid_exit_before_pidfd_open_is_rescanned(self):
        self.start()
        child = self.child()
        real_open = os.pidfd_open
        first = True
        def raced(pid, flags=0):
            nonlocal first
            if first:
                first = False
                (self.root / 'exit').touch()
                child.wait(timeout=2)
                raise ProcessLookupError()
            return real_open(pid, flags)
        with patch.object(scope.os, 'pidfd_open', side_effect=raced):
            self.guard.assert_drained()
        self.guard.close()

    def test_nonchild_pidfd_is_never_signalled(self):
        self.start()
        # A stale/reused or malicious snapshot points to the controller, which
        # is live but cannot pass waitid(P_PIDFD)'s child-ownership check.
        with patch.object(scope, '_children', return_value={os.getpid()}), \
                patch.object(scope.signal, 'pidfd_send_signal') as send:
            with self.assertRaises(scope.VerificationRefused):
                self.guard.cleanup()
            send.assert_not_called()
        self.assertFalse(self.guard._owned)
        self.guard.close()

    def test_lost_subreaper_remains_tainted_after_flag_returns(self):
        self.start()
        scope._subreaper(0)
        with self.assertRaises(scope.VerificationRefused):
            self.guard.assert_drained()
        scope._subreaper(1)
        with self.assertRaises(scope.VerificationRefused):
            self.guard.close()
        self.assertTrue(self.guard._tainted)
        self.assertFalse(self.guard._closed)
        # No fixture was launched. Restore test state directly; production
        # cannot clear uncertainty or claim lost descendants were drained.
        self.assertTrue(scope._kernel_empty())
        scope._subreaper(self.previous)
        self.guard = None

    def test_visibility_failure_does_not_restore_or_attest(self):
        self.start()
        self.child('orphan')
        with patch.object(scope, '_children', side_effect=scope.VerificationRefused()):
            for operation in (self.guard.assert_drained, self.guard.cleanup, self.guard.close):
                with self.assertRaises(scope.VerificationRefused):
                    operation()
        self.assertEqual(scope._subreaper(), 1)
        self.assertFalse(self.guard._closed)
        self.guard.cleanup()
        self.guard.close()

    def test_cleanup_timeout_does_not_falsely_attest_or_restore(self):
        self.start()
        self.child('orphan')
        self.guard.term_seconds = self.guard.kill_seconds = .01
        with patch.object(scope.signal, 'pidfd_send_signal'):
            with self.assertRaisesRegex(scope.VerificationRefused,
                                        '^verification_cleanup_unproven$'):
                self.guard.cleanup()
        with self.assertRaises(scope.VerificationRefused):
            self.guard.close()
        self.assertEqual(scope._subreaper(), 1)
        # Test-only mocked signals were not sent; clear their mock bookkeeping.
        for _, sent in self.guard._owned.values():
            sent.clear()
        self.guard.kill_seconds = 2
        self.guard.cleanup()
        self.guard.close()

    def test_closed_attestation_ignores_later_synchronous_children(self):
        self.start().close()
        child = self.child()
        try:
            self.guard.assert_drained()
            self.assertIsNone(child.poll())
        finally:
            (self.root / 'exit').touch()
            child.wait(timeout=2)


if __name__ == '__main__':
    unittest.main()
