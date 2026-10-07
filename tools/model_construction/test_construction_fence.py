"""Real disposable Linux pidfd guardian checks; no service or live process."""
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest

import construction_fence as fence


CHILD = '''
import sys,threading
from pathlib import Path
folder=Path(sys.argv[1]);done=threading.Event()
def worker():
 while not done.wait(.005):
  if (folder/'go').exists():
   (folder/'resumed').touch();break
threading.Thread(target=worker,daemon=True).start()
print('READY',flush=True)
try:sys.stdin.readline()
finally:done.set()
'''


@unittest.skipUnless(hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'), 'Linux pidfds required')
class KernelGuardTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='construction-pidfd-')
        self.folder = Path(self.temporary.name)
        self.child = subprocess.Popen([sys.executable, '-B', '-u', '-c', CHILD, str(self.folder)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        self.assertTrue(select.select([self.child.stdout], [], [], 3)[0])
        self.assertEqual(self.child.stdout.readline().strip(), 'READY')
        self.pidfd = os.pidfd_open(self.child.pid)
        self.ticks = fence._proc_stat(self.child.pid)[0]

    def tearDown(self):
        if self.child.poll() is None:
            signal.pidfd_send_signal(self.pidfd, signal.SIGCONT)
            self.child.stdin.write('quit\n'); self.child.stdin.flush()
            try: self.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                signal.pidfd_send_signal(self.pidfd, signal.SIGKILL); self.child.wait(timeout=2)
        for stream in (self.child.stdin, self.child.stdout, self.child.stderr): stream.close()
        os.close(self.pidfd)
        self.temporary.cleanup()

    def resumed(self):
        deadline = time.monotonic() + 3
        while not (self.folder / 'resumed').exists() and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertTrue((self.folder / 'resumed').exists())

    def test_guard_timeout_resumes_exact_frozen_process(self):
        guard = fence._Guard(self.pidfd, duration=.3)
        try:
            guard.freeze(self.child.pid, self.ticks)
            self.assertEqual(set(fence._tasks(self.child.pid).values()), {'T'})
            (self.folder / 'go').touch(); self.resumed()
            self.assertEqual(guard.process.wait(timeout=2), 1)
        finally: guard.close()

    def test_guard_sigkill_is_recovery_required_and_resumes_worker(self):
        guard = fence._Guard(self.pidfd, duration=3)
        guard.freeze(self.child.pid, self.ticks)
        signal.pidfd_send_signal(guard.guard_pidfd, signal.SIGKILL)
        guard.process.wait(timeout=2)
        with self.assertRaises(fence.RecoveryRequired): guard.close()
        (self.folder / 'go').touch(); self.resumed()

    def test_controller_sigkill_or_disconnect_cannot_strand_worker(self):
        script = '''
import os,sys
sys.path.insert(0,sys.argv[1]);import construction_fence as f
fd=os.pidfd_open(int(sys.argv[2]));g=f._Guard(fd,duration=3);g.freeze(int(sys.argv[2]),int(sys.argv[3]))
print('FROZEN',flush=True);sys.stdin.readline()
'''
        for death in ('kill','disconnect'):
            with self.subTest(death=death):
                # A separate synthetic worker is used for each death condition.
                if death == 'disconnect':
                    self.tearDown(); self.setUp()
                controller = subprocess.Popen([sys.executable, '-B', '-u', '-c', script,
                    str(Path(fence.__file__).parent), str(self.child.pid), str(self.ticks)],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertTrue(select.select([controller.stdout], [], [], 3)[0])
                    self.assertEqual(controller.stdout.readline().strip(), 'FROZEN')
                    self.assertEqual(set(fence._tasks(self.child.pid).values()), {'T'})
                    (self.folder / 'go').touch()
                    if death == 'kill':
                        descriptor = os.pidfd_open(controller.pid)
                        try: signal.pidfd_send_signal(descriptor, signal.SIGKILL)
                        finally: os.close(descriptor)
                    else: controller.stdin.close()
                    controller.wait(timeout=2); self.resumed()
                finally:
                    if controller.poll() is None:
                        descriptor = os.pidfd_open(controller.pid)
                        try: signal.pidfd_send_signal(descriptor, signal.SIGKILL)
                        finally: os.close(descriptor)
                        controller.wait(timeout=2)
                    for stream in (controller.stdin, controller.stdout, controller.stderr): stream.close()


if __name__ == '__main__': unittest.main()
