"""Process-local verifier ownership; import and construction are inert.

Only a dedicated, single-threaded controller with no existing children may
enter. All children created until close must belong to verification. Linux
adopts orphaned descendants here even after fork/setsid. This does not recover
an intentionally stopped worker after controller SIGKILL.
"""
import ctypes
import math
import os
from pathlib import Path
import select
import signal
import sys
import time


class VerificationRefused(RuntimeError):
    """Fixed, non-sensitive refusal; callers must not infer successful drainage."""

    def __init__(self, code='verification_scope_unproven'):
        self.code = code
        super().__init__(code)


def _prctl(option, argument):
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        libc.prctl.argtypes = (ctypes.c_int, ctypes.c_void_p,
                              ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong)
        libc.prctl.restype = ctypes.c_int
        if libc.prctl(option, argument, 0, 0, 0) != 0:
            raise VerificationRefused()
    except (AttributeError, OSError) as error:
        raise VerificationRefused() from error


def _subreaper(value=None):
    if value is not None:
        _prctl(36, ctypes.c_void_p(value))  # PR_SET_CHILD_SUBREAPER
    current = ctypes.c_int(-1)
    _prctl(37, ctypes.byref(current))  # PR_GET_CHILD_SUBREAPER
    if current.value not in (0, 1) or (value is not None and current.value != value):
        raise VerificationRefused()
    return current.value


def _children():
    """Require the real kernel children interface; no ps/PPid fallback."""
    try:
        tasks = Path('/proc/self/task')
        before = {entry.name for entry in tasks.iterdir()}
        if before != {str(os.getpid())}:
            raise VerificationRefused()
        values = (tasks / str(os.getpid()) / 'children').read_text().split()
        if (len(values) > 4096 or any(not value.isascii() or not value.isdigit()
                                      or int(value) <= 1 for value in values)
                or {entry.name for entry in tasks.iterdir()} != before):
            raise VerificationRefused()
        return {int(value) for value in values}
    except (OSError, ValueError) as error:
        raise VerificationRefused() from error


def _kernel_empty():
    try:
        os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    except ChildProcessError:
        return True
    except OSError as error:
        raise VerificationRefused() from error
    return False  # None also means a live, non-waitable child exists.


def _pidfd_available():
    """Probe actual kernel support before launching any verifier."""
    fd = None
    try:
        fd = os.pidfd_open(os.getpid(), 0)
        signal.pidfd_send_signal(fd, 0)
        try:
            os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        except ChildProcessError:
            return  # Self is deliberately not a child; selector is supported.
        raise VerificationRefused()
    except OSError as error:
        raise VerificationRefused() from error
    finally:
        if fd is not None:
            os.close(fd)


class VerificationScope:
    def __init__(self, *, term_seconds=1.0, kill_seconds=3.0):
        self.term_seconds, self.kill_seconds = term_seconds, kill_seconds
        self._pid = None
        self._previous = None
        self._active = False
        self._closed = False
        self._tainted = False
        self._owned = {}  # PID -> (exact pidfd, signals already sent).

    def start(self):
        if self._active or self._closed:
            raise VerificationRefused('verification_scope_state')
        required = ('pidfd_open', 'waitid', 'P_PIDFD', 'WNOWAIT', 'WNOHANG')
        if (sys.platform != 'linux' or any(not hasattr(os, name) for name in required)
                or not hasattr(signal, 'pidfd_send_signal')
                or signal.getsignal(signal.SIGCHLD) != signal.SIG_DFL
                or any(not isinstance(value, (int, float)) or not math.isfinite(value)
                       or not 0 <= value <= 10 for value in
                       (self.term_seconds, self.kill_seconds)) or self.kill_seconds == 0):
            raise VerificationRefused()
        if _children() or not _kernel_empty():
            raise VerificationRefused('verification_children_preexisting')
        _pidfd_available()
        self._previous = _subreaper()
        self._pid = os.getpid()
        # Record responsibility before the syscall, including interrupted setup.
        self._active = True
        _subreaper(1)
        if _children() or not _kernel_empty():
            self._tainted = True
            raise VerificationRefused('verification_children_preexisting')
        return self

    def _check(self):
        if not self._active or self._pid != os.getpid() or self._tainted:
            raise VerificationRefused('verification_scope_state')
        if _subreaper() != 1 or signal.getsignal(signal.SIGCHLD) != signal.SIG_DFL:
            self._tainted = True
            raise VerificationRefused()

    @staticmethod
    def _wait(pid, fd):
        try:
            info = os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        except ChildProcessError:
            if select.select([fd], [], [], 0)[0]:
                return True  # Already reaped; this exact identity cannot run.
            raise VerificationRefused()  # Live fd is not our child: never signal.
        if info is None:
            return False  # Kernel proved a live child owned by this controller.
        if info.si_pid != pid:
            raise VerificationRefused()
        try:
            reaped = os.waitid(os.P_PIDFD, fd, os.WEXITED | os.WNOHANG)
            if reaped is None or reaped.si_pid != pid:
                raise VerificationRefused()
        except ChildProcessError:
            if not select.select([fd], [], [], 0)[0]:
                raise VerificationRefused()
        return True

    def _sweep(self, signum=None):
        self._check()
        try:
            for pid in _children():
                if pid not in self._owned:
                    try:
                        fd = os.pidfd_open(pid, 0)
                    except ProcessLookupError:
                        continue  # It exited before acquisition; rescan below.
                    try:
                        exited = self._wait(pid, fd)
                    except BaseException:
                        os.close(fd)
                        raise
                    if exited:
                        os.close(fd)
                    else:
                        self._owned[pid] = (fd, set())
            for pid, (fd, sent) in list(self._owned.items()):
                if self._wait(pid, fd):
                    os.close(fd)
                    del self._owned[pid]
                elif signum is not None and signum not in sent:
                    # _wait(P_PIDFD) proved ownership; PID reuse cannot retarget fd.
                    try:
                        signal.pidfd_send_signal(fd, signum)
                    except ProcessLookupError:
                        pass
                    sent.add(signum)
            return not self._owned and not _children() and _kernel_empty()
        except (OSError, ValueError) as error:
            raise VerificationRefused() from error

    def assert_drained(self):
        if self._closed and self._pid == os.getpid() and not self._tainted:
            # Historical verifier attestation, not a claim about later unrelated
            # synchronous controller subprocesses. No verifiers may follow close.
            return
        if not self._sweep():
            raise VerificationRefused('verification_descendants_present')

    def cleanup(self):
        if self._closed:
            return self.assert_drained()
        for signum, seconds in ((signal.SIGTERM, self.term_seconds),
                                (signal.SIGKILL, self.kill_seconds)):
            deadline = time.monotonic() + seconds
            while True:
                if self._sweep(signum):
                    return
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                time.sleep(min(.01, remaining))
        raise VerificationRefused('verification_cleanup_unproven')

    def close(self):
        if self._closed:
            return self.assert_drained()
        self.assert_drained()  # Never restore while any descendant is unresolved.
        _subreaper(self._previous)
        self._active = False
        self._closed = True
