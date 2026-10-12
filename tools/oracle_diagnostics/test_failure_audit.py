"""Offline tests for the privacy-safe, strictly read-only SQLite audit."""
import contextlib
import datetime
import io
import pathlib
import sqlite3
import tempfile
import unittest

from failure_audit import run, classify

class FailureAuditTests(unittest.TestCase):
    def test_normalizes_polish_and_json_messages(self):
        self.assertEqual(classify("Przekroczono limit czasu")[2], "TIMEOUT")
        self.assertEqual(classify('{"error":"Timed out", "email":"private@example.com"}')[2], "TIMEOUT")
        self.assertEqual(classify("Blender could not export mesh")[2], "BLENDER_OR_RENDER")
        self.assertEqual(classify(None), ("NULL", "EMPTY", "NO_DETAIL"))

    def test_sanitized_aggregate_output_and_missing_job(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "jobs.sqlite"
            with sqlite3.connect(path) as db:
                db.execute("CREATE TABLE jobs (id TEXT, prompt TEXT, state TEXT, detail TEXT, created REAL)")
                now = datetime.datetime.now(datetime.timezone.utc).timestamp()
                db.executemany("INSERT INTO jobs VALUES(?,?,?,?,?)", [
                    ("secret-job-id-1", "SECRET PROMPT", "failed", "Przekroczono limit czasu", now),
                    ("secret-job-id-2", "SECRET PROMPT", "failed", '{"error":"API timed out", "email":"private@example.com"}', now),
                    ("secret-job-id-3", "SECRET PROMPT", "succeeded", "SECRET RESULT", now),
                ])
            report = io.StringIO()
            with contextlib.redirect_stdout(report):
                self.assertEqual(run(str(path)), 0)
            output = report.getvalue()
            self.assertIn("TIMEOUT 2", output)
            self.assertIn("INTEGRITY ok", output)
            self.assertIn("=== COMPLETE ===", output)
            for secret in ("SECRET PROMPT", "private@example.com", "secret-job-id-1", "API timed out", "SECRET RESULT"):
                self.assertNotIn(secret, output)

    def test_read_only_missing_db(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "not-created.sqlite"
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(run(str(path)), 2)
            self.assertFalse(path.exists())

if __name__ == "__main__":
    unittest.main()
