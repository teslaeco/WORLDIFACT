"""Default-inert, offline-only lifecycle diagnostic. No recovery or live DB access."""

import argparse
import hashlib
import hmac
import json
import math
import os
import re
import sqlite3
import stat
import sys
import time


MAX_BYTES = 64 * 1024 * 1024
MAX_ROWS = 10000
MAX_QUERY_SECONDS = 5
STATES = frozenset(("queued", "generating", "building", "retrying", "succeeded", "failed", "cancelled"))
TERMINAL = frozenset(("succeeded", "failed", "cancelled"))
CREATE_TABLE = "CREATE TABLE jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)"
EVIDENCE_LIMITS = [
    "snapshot_only_not_current_worker_state",
    "no_durable_before_state_receipt_in_legacy_helper",
    "nonterminal_state_does_not_prove_regression_or_idle_worker",
    "glb_and_finished_agent_evidence_do_not_prove_prior_succeeded_state",
    "independent_authoritative_completion_evidence_required",
    "no_repair_or_state_reset_is_implemented",
]


class Refused(Exception):
    """Only fixed, non-sensitive refusal codes leave the diagnostic."""


def _require_platform():
    flags = ("O_NOFOLLOW", "O_DIRECTORY", "O_CLOEXEC", "O_NOATIME", "O_NONBLOCK", "O_PATH")
    if (sys.platform != "linux" or sys.version_info < (3, 11)
            or not all(hasattr(os, name) for name in flags)
            or os.open not in os.supports_dir_fd
            or os.stat not in os.supports_dir_fd
            or os.stat not in os.supports_follow_symlinks
            or os.listdir not in os.supports_fd
            or not hasattr(sqlite3.Connection, "deserialize")
            or not hasattr(sqlite3.Connection, "setlimit")):
        raise Refused("unsupported_runtime")


def _signature(info):
    # atime is deliberately excluded: every descriptor requires O_NOATIME.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
            info.st_uid, info.st_gid, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _read_bytes(fd, expected_size):
    os.lseek(fd, 0, os.SEEK_SET)
    chunks = []
    total = 0
    while True:
        block = os.read(fd, min(1024 * 1024, MAX_BYTES + 1 - total))
        if not block:
            break
        chunks.append(block)
        total += len(block)
        if total > expected_size or total > MAX_BYTES:
            raise Refused("snapshot_size_changed_or_exceeded")
    if total != expected_size:
        raise Refused("snapshot_size_changed_or_exceeded")
    return b"".join(chunks)


def _check_directory(fd, name, expected_signature):
    if _signature(os.fstat(fd)) != expected_signature:
        raise Refused("snapshot_directory_changed")
    # A dedicated directory is mandatory. Reject *all* neighboring files,
    # including WAL, SHM, rollback/super journals, locks and hidden entries.
    if os.listdir(fd) != [name]:
        raise Refused("snapshot_directory_not_isolated")


def read_verified_snapshot(path, expected_sha256, offline_verified=False):
    """Read only an independently verified offline copy; never acquire one here.

    Finite race checks cannot establish that a source is offline. The explicit
    attestation and independently recorded hash are prerequisites, not a claim
    that two matching reads prove live SQLite consistency.
    """
    if offline_verified is not True:
        raise Refused("verified_offline_snapshot_required")
    _require_platform()
    if not isinstance(expected_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise Refused("independent_snapshot_sha256_required")
    if (not isinstance(path, str) or not path.startswith("/")
            or len(path) > 4096 or "\x00" in path
            or any(part in ("", ".", "..") for part in path.split("/")[1:])):
        raise Refused("unsafe_snapshot_path")
    parts = path.split("/")[1:]
    if len(parts) < 2:
        raise Refused("isolated_snapshot_directory_required")
    name = parts[-1]
    descriptors = []
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NOATIME | os.O_NONBLOCK
    try:
        # O_PATH traverses ancestors without opening them for data reads or
        # changing their atime; only our private snapshot directory is listed.
        path_flags = os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_DIRECTORY
        parent = os.open("/", path_flags)
        descriptors.append(parent)
        chain = []
        for index, part in enumerate(parts[:-1]):
            directory_flags = flags | os.O_DIRECTORY if index == len(parts) - 2 else path_flags
            child = os.open(part, directory_flags, dir_fd=parent)
            descriptors.append(child)
            chain.append((parent, part, child))
            parent = child
        directory_info = os.fstat(parent)
        if directory_info.st_mode & 0o077:
            raise Refused("snapshot_directory_permissions_unsafe")
        directory_signature = _signature(directory_info)
        _check_directory(parent, name, directory_signature)
        fd = os.open(name, flags, dir_fd=parent)
        descriptors.append(fd)
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
                or before.st_mode & 0o077):
            raise Refused("snapshot_file_unsafe")
        if not 100 <= before.st_size <= MAX_BYTES:
            raise Refused("snapshot_size_unsupported")
        signature = _signature(before)
        first = _read_bytes(fd, before.st_size)
        _check_directory(parent, name, directory_signature)
        if _signature(os.fstat(fd)) != signature:
            raise Refused("snapshot_changed")
        second = _read_bytes(fd, before.st_size)
        if first != second or _signature(os.fstat(fd)) != signature:
            raise Refused("snapshot_changed")
        _check_directory(parent, name, directory_signature)
        if _signature(os.stat(name, dir_fd=parent, follow_symlinks=False)) != signature:
            raise Refused("snapshot_path_changed")
        for ancestor, part, child in chain:
            actual = os.stat(part, dir_fd=ancestor, follow_symlinks=False)
            held = os.fstat(child)
            if not stat.S_ISDIR(actual.st_mode) or (actual.st_dev, actual.st_ino) != (held.st_dev, held.st_ino):
                raise Refused("snapshot_path_changed")
        if not hmac.compare_digest(hashlib.sha256(first).hexdigest(), expected_sha256):
            raise Refused("snapshot_digest_mismatch")
        # WAL-format images are refused even when a sidecar is currently absent.
        if first[:16] != b"SQLite format 3\x00" or first[18:20] != b"\x01\x01":
            raise Refused("sqlite_header_or_journal_mode_unsupported")
        page_size = int.from_bytes(first[16:18], "big")
        page_size = 65536 if page_size == 1 else page_size
        if (page_size < 512 or page_size > 65536 or page_size & (page_size - 1)
                or len(first) % page_size
                or int.from_bytes(first[28:32], "big") * page_size != len(first)
                or first[24:28] != first[92:96]):
            raise Refused("sqlite_header_inconsistent")
        return first
    except OSError:
        # Do not include OS messages: they can disclose operator paths.
        raise Refused("snapshot_open_or_read_refused") from None
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def _authorizer(action, arg1, arg2, _database, _source):
    if action == sqlite3.SQLITE_SELECT:
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_READ:
        if arg1 == "sqlite_master" and arg2 in ("type", "name", "tbl_name", "sql"):
            return sqlite3.SQLITE_OK
        if arg1 == "jobs" and arg2 in ("id", "state", "created", "updated"):
            return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_PRAGMA:
        if (arg1 == "integrity_check" and arg2 == "1") or (arg1 == "table_xinfo" and arg2 == "jobs"):
            return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def inspect_image(image):
    """Parse already detached bytes in memory, without importing worker code."""
    _require_platform()
    if not isinstance(image, bytes) or not 100 <= len(image) <= MAX_BYTES:
        raise Refused("snapshot_size_unsupported")
    connection = None
    try:
        # This literal is the *only* SQLite connection target in this tool.
        connection = sqlite3.connect(":memory:")
        connection.execute("PRAGMA temp_store=MEMORY")
        connection.execute("PRAGMA trusted_schema=OFF")
        connection.execute("PRAGMA query_only=ON")
        connection.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
        connection.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 4096)
        connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, MAX_BYTES)
        connection.setlimit(sqlite3.SQLITE_LIMIT_COLUMN, 16)
        connection.deserialize(image)
        deadline = time.monotonic() + MAX_QUERY_SECONDS
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        connection.set_authorizer(_authorizer)
        schema = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master").fetchmany(4)
        expected = [
            ("table", "jobs", "jobs", CREATE_TABLE),
            ("index", "sqlite_autoindex_jobs_1", "jobs", None),
        ]
        normalized = [(kind, name, table, re.sub(r"\s+", " ", sql).strip() if sql else sql)
                      for kind, name, table, sql in schema]
        if sorted(normalized) != sorted(expected):
            raise Refused("unsupported_jobs_schema")
        expected_columns = [
            (0, "id", "TEXT", 0, None, 1, 0), (1, "prompt", "TEXT", 1, None, 0, 0),
            (2, "state", "TEXT", 1, None, 0, 0), (3, "detail", "TEXT", 1, None, 0, 0),
            (4, "created", "REAL", 1, None, 0, 0), (5, "updated", "REAL", 1, None, 0, 0),
        ]
        if connection.execute("PRAGMA table_xinfo(jobs)").fetchall() != expected_columns:
            raise Refused("unsupported_jobs_schema")
        if connection.execute("PRAGMA integrity_check(1)").fetchall() != [("ok",)]:
            raise Refused("snapshot_integrity_failed")
        rows = connection.execute("SELECT id,state,created,updated FROM jobs LIMIT ?", (MAX_ROWS + 1,)).fetchall()
        if len(rows) > MAX_ROWS:
            raise Refused("snapshot_row_limit_exceeded")
        counts = dict.fromkeys(sorted(STATES), 0)
        candidates = []
        for job_id, state, created, updated in rows:
            if (not isinstance(job_id, str)
                    or not re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", job_id)
                    or not isinstance(state, str) or state not in STATES
                    or not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0
                               for value in (created, updated)) or updated < created):
                raise Refused("invalid_job_metadata")
            counts[state] += 1
            if state not in TERMINAL:
                candidates.append({
                    "job_ref_sha256": hashlib.sha256(job_id.encode("ascii")).hexdigest(),
                    "observed_state": state,
                    "prior_success_proven": False,
                    "posthoc_regression": "unproven",
                })
        return {
            "status": "offline_snapshot_inspected",
            "snapshot_sha256": hashlib.sha256(image).hexdigest(),
            "total_rows": len(rows), "state_counts": counts,
            "nonterminal_count": len(candidates),
            "nonterminal_jobs": sorted(candidates, key=lambda row: row["job_ref_sha256"]),
            "evidence_limits": EVIDENCE_LIMITS,
        }
    except (sqlite3.Error, ValueError, TypeError, OverflowError):
        raise Refused("sqlite_snapshot_rejected") from None
    finally:
        if connection is not None:
            connection.close()


class _Parser(argparse.ArgumentParser):
    def error(self, _message):
        raise Refused("invalid_arguments")


def main(argv=None):
    parser = _Parser(description=__doc__)
    parser.add_argument("--inspect-verified-offline-snapshot", action="store_true")
    parser.add_argument("--snapshot")
    parser.add_argument("--expected-sha256")
    try:
        args = parser.parse_args(argv)
        if not args.inspect_verified_offline_snapshot:
            if args.snapshot is not None or args.expected_sha256 is not None:
                raise Refused("verified_offline_snapshot_required")
            report = {"status": "inert", "input_opened": False, "evidence_limits": EVIDENCE_LIMITS}
        else:
            image = read_verified_snapshot(args.snapshot, args.expected_sha256, offline_verified=True)
            report = inspect_image(image)
        print(json.dumps(report, sort_keys=True))
        return 0
    except (Refused, MemoryError) as error:
        code = str(error) if isinstance(error, Refused) else "resource_limit_reached"
        print(json.dumps({"status": "refused", "reason": code, "results_complete": False}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
