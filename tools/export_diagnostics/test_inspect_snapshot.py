"""Synthetic snapshots only; no worker imports, network or model generation."""

import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

import inspect_snapshot as diagnostic


JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SECRET = "private fixture prompt token image and log must not be emitted"


def make_image(states=("building",), schema=diagnostic.CREATE_TABLE):
    connection = sqlite3.connect(":memory:")
    connection.execute(schema)
    for index, state in enumerate(states):
        job = "%08x-aaaa-4aaa-8aaa-aaaaaaaaaaaa" % index
        connection.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?)", (job, SECRET, state, SECRET, 1.0, 2.0))
    connection.commit()
    result = connection.serialize()
    connection.close()
    return result


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="export-diagnostic-synthetic-")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "snapshot.sqlite"
        self.image = make_image()
        self.path.write_bytes(self.image)
        self.path.chmod(0o600)
        self.digest = hashlib.sha256(self.image).hexdigest()

    def read(self, **kwargs):
        return diagnostic.read_verified_snapshot(str(self.path), self.digest, offline_verified=True, **kwargs)

    def assertRefused(self, callable_, code=None):
        with self.assertRaises(diagnostic.Refused) as caught:
            callable_()
        if code is not None:
            self.assertEqual(str(caught.exception), code)

    def test_default_inert_does_not_open_input_or_connect(self):
        with mock.patch.object(diagnostic.os, "open", side_effect=AssertionError("file opened")), mock.patch.object(diagnostic.sqlite3, "connect", side_effect=AssertionError("DB opened")), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(diagnostic.main([]), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "inert")

    def test_explicit_offline_attestation_required(self):
        self.assertRefused(lambda: diagnostic.read_verified_snapshot(str(self.path), self.digest), "verified_offline_snapshot_required")

    def test_safe_snapshot_read_preserves_bytes_stat_and_directory(self):
        before = self.path.stat()
        directory_before = self.path.parent.stat()
        self.assertEqual(self.read(), self.image)
        after = self.path.stat()
        self.assertEqual((before.st_atime_ns, before.st_mtime_ns, before.st_ctime_ns), (after.st_atime_ns, after.st_mtime_ns, after.st_ctime_ns))
        self.assertEqual(self.path.parent.stat().st_atime_ns, directory_before.st_atime_ns)
        self.assertEqual(list(self.path.parent.iterdir()), [self.path])

    def test_every_sqlite_connection_is_in_memory(self):
        real_connect = sqlite3.connect
        targets = []
        def connect(target, *args, **kwargs):
            targets.append(target)
            return real_connect(target, *args, **kwargs)
        with mock.patch.object(diagnostic.sqlite3, "connect", side_effect=connect):
            report = diagnostic.inspect_image(self.read())
        self.assertEqual(targets, [":memory:"])
        self.assertEqual(report["nonterminal_count"], 1)

    def test_nonterminal_candidates_never_prove_prior_success(self):
        states = ("queued", "generating", "building", "retrying", "succeeded", "failed", "cancelled")
        report = diagnostic.inspect_image(make_image(states))
        self.assertEqual(report["total_rows"], 7)
        self.assertEqual(report["nonterminal_count"], 4)
        self.assertTrue(all(not row["prior_success_proven"] and row["posthoc_regression"] == "unproven" for row in report["nonterminal_jobs"]))
        self.assertTrue(all(count == 1 for count in report["state_counts"].values()))
        self.assertNotIn(SECRET, json.dumps(report))
        self.assertNotIn("00000000-aaaa", json.dumps(report))

    def test_sha_mismatch(self):
        self.digest = "0" * 64
        self.assertRefused(self.read, "snapshot_digest_mismatch")

    def test_no_sidecar_or_neighbor_is_supported(self):
        for suffix in ("-wal", "-shm", "-journal", "-mj synthetic", ".other"):
            with self.subTest(suffix=suffix):
                sidecar = self.path.with_name(self.path.name + suffix)
                sidecar.touch()
                self.assertRefused(self.read, "snapshot_directory_not_isolated")
                sidecar.unlink()

    def test_wal_header_rejected_without_sidecar(self):
        image = bytearray(self.image)
        image[18:20] = b"\x02\x02"
        self.path.write_bytes(image)
        self.digest = hashlib.sha256(image).hexdigest()
        self.assertRefused(self.read, "sqlite_header_or_journal_mode_unsupported")

    def test_file_symlink_rejected(self):
        target = self.path.parent / "other"
        self.path.rename(target)
        self.path.symlink_to(target)
        self.assertRefused(self.read)

    def test_parent_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            alias = Path(elsewhere) / "alias"
            alias.symlink_to(self.path.parent)
            self.assertRefused(lambda: diagnostic.read_verified_snapshot(str(alias / self.path.name), self.digest, True))

    def test_hardlink_and_permissions_rejected(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            os.link(self.path, Path(elsewhere) / "alias")
            self.assertRefused(self.read, "snapshot_file_unsafe")
        self.path.chmod(0o644)
        self.assertRefused(self.read, "snapshot_file_unsafe")
        self.path.chmod(0o600)
        self.path.parent.chmod(0o755)
        self.assertRefused(self.read, "snapshot_directory_permissions_unsafe")

    def test_fifo_rejected_without_blocking(self):
        self.path.unlink()
        os.mkfifo(self.path, 0o600)
        self.assertRefused(self.read, "snapshot_file_unsafe")

    def test_unsafe_and_relative_paths_rejected(self):
        for path in ("relative.sqlite", str(self.path.parent) + "/../snapshot.sqlite", str(self.path.parent) + "//snapshot.sqlite", "/snapshot.sqlite", str(self.path) + "\x00"):
            self.assertRefused(lambda: diagnostic.read_verified_snapshot(path, self.digest, True))

    def test_oversized_input_rejected_before_read(self):
        with mock.patch.object(diagnostic, "MAX_BYTES", len(self.image) - 1), mock.patch.object(diagnostic, "_read_bytes", side_effect=AssertionError("read occurred")):
            self.assertRefused(self.read, "snapshot_size_unsupported")

    def test_concurrent_write_rejected(self):
        real_read = diagnostic._read_bytes
        calls = []
        def read(fd, size):
            result = real_read(fd, size)
            if not calls:
                calls.append(True)
                with self.path.open("r+b") as output:
                    output.seek(200)
                    output.write(b"changed")
            return result
        with mock.patch.object(diagnostic, "_read_bytes", side_effect=read):
            self.assertRefused(self.read, "snapshot_changed")

    def test_sidecar_appearing_during_read_rejected(self):
        real_read = diagnostic._read_bytes
        def read(fd, size):
            result = real_read(fd, size)
            self.path.with_name(self.path.name + "-wal").touch()
            return result
        with mock.patch.object(diagnostic, "_read_bytes", side_effect=read):
            self.assertRefused(self.read)

    def test_unsupported_runtime_fails_closed(self):
        with mock.patch.object(diagnostic.sys, "version_info", (3, 10)):
            self.assertRefused(self.read, "unsupported_runtime")

    def test_no_atime_denial_has_no_weaker_retry(self):
        with mock.patch.object(diagnostic, "_require_platform"), mock.patch.object(diagnostic.os, "open", side_effect=PermissionError("private path")) as opened:
            self.assertRefused(self.read, "snapshot_open_or_read_refused")
        self.assertEqual(opened.call_count, 1)

    def test_ancestor_traversal_needs_no_owner_or_fowner_capability(self):
        diagnostic._require_platform()
        real_open = os.open
        opened = []
        def open_without_ancestor_noatime(path, flags, *args, **kwargs):
            opened.append((path, flags))
            if flags & os.O_NOATIME and path not in (self.path.parent.name, self.path.name):
                raise PermissionError("simulated non-owner ancestor without CAP_FOWNER")
            return real_open(path, flags, *args, **kwargs)
        with mock.patch.object(diagnostic, "_require_platform"), mock.patch.object(diagnostic.os, "open", side_effect=open_without_ancestor_noatime):
            self.assertEqual(self.read(), self.image)
        self.assertEqual(opened[0][0], "/")
        self.assertTrue(all(flags & os.O_PATH for _, flags in opened[:-2]))
        self.assertTrue(all(flags & os.O_NOATIME for _, flags in opened[-2:]))

    def test_changed_second_read_and_replaced_path_rejected(self):
        with mock.patch.object(diagnostic, "_read_bytes", side_effect=(self.image, self.image[:-1] + b"x")):
            self.assertRefused(self.read, "snapshot_changed")
        real_read = diagnostic._read_bytes
        def read(fd, size):
            result = real_read(fd, size)
            self.path.unlink()
            self.path.write_bytes(self.image)
            self.path.chmod(0o600)
            return result
        with mock.patch.object(diagnostic, "_read_bytes", side_effect=read):
            self.assertRefused(self.read)

    def test_query_budget_rejected(self):
        image = make_image(("building",) * 200)
        with mock.patch.object(diagnostic, "MAX_QUERY_SECONDS", -1):
            self.assertRefused(lambda: diagnostic.inspect_image(image), "sqlite_snapshot_rejected")

    def test_explicit_cli_returns_sanitized_snapshot_report(self):
        args = ["--inspect-verified-offline-snapshot", "--snapshot", str(self.path), "--expected-sha256", self.digest]
        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(diagnostic.main(args), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["status"], "offline_snapshot_inspected")
        self.assertNotIn(str(self.path), output.getvalue())
        self.assertNotIn(SECRET, output.getvalue())

    def test_schema_alteration_and_unknown_state_rejected(self):
        self.assertRefused(lambda: diagnostic.inspect_image(make_image(schema=diagnostic.CREATE_TABLE.replace("state TEXT NOT NULL", "state TEXT"))), "unsupported_jobs_schema")
        self.assertRefused(lambda: diagnostic.inspect_image(make_image((SECRET,))), "invalid_job_metadata")

    def test_views_and_triggers_rejected_before_job_query(self):
        for extra in ("CREATE VIEW leaks AS SELECT prompt FROM jobs", "CREATE TRIGGER surprise AFTER UPDATE ON jobs BEGIN DELETE FROM jobs; END"):
            connection = sqlite3.connect(":memory:")
            connection.deserialize(self.image)
            connection.execute(extra)
            altered = connection.serialize()
            connection.close()
            self.assertRefused(lambda: diagnostic.inspect_image(altered), "unsupported_jobs_schema")

    def test_row_limit_and_corruption_fail_closed(self):
        with mock.patch.object(diagnostic, "MAX_ROWS", 1):
            self.assertRefused(lambda: diagnostic.inspect_image(make_image(("building", "queued"))), "snapshot_row_limit_exceeded")
        self.assertRefused(lambda: diagnostic.inspect_image(b"malformed" * 100))

    def test_authorizer_denies_writes_attach_and_sensitive_columns(self):
        connection = sqlite3.connect(":memory:")
        connection.deserialize(self.image)
        connection.set_authorizer(diagnostic._authorizer)
        for query in ("UPDATE jobs SET state='succeeded'", "DELETE FROM jobs", "ATTACH ':memory:' AS forbidden", "SELECT prompt FROM jobs", "SELECT detail FROM jobs"):
            with self.assertRaises(sqlite3.DatabaseError):
                connection.execute(query)
        connection.close()

    def test_errors_and_arguments_do_not_emit_private_paths_or_values(self):
        for argv in (["--snapshot", SECRET], ["--unknown", SECRET], ["--inspect-verified-offline-snapshot", "--snapshot", SECRET, "--expected-sha256", "0" * 64]):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(diagnostic.main(argv), 2)
            self.assertNotIn(SECRET, output.getvalue())
            self.assertFalse(json.loads(output.getvalue())["results_complete"])


if __name__ == "__main__":
    unittest.main()
