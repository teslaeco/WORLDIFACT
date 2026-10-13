#!/usr/bin/env python3
"""WORLDIFACT P0: readonly, privacy-safe Oracle SQLite failure aggregation."""
import collections
import datetime
import json
import os
import re
import sqlite3
import sys
import unicodedata

DB = "/home/opc/froge-connector/state/jobs.sqlite"
RULES = [
    ("TIMEOUT", r"timeout|timed out|przekroczon.{0,30}czas|limit czasu|deadline|uplyn.{0,20}czas"),
    ("ORACLE_MISSING", r"oracle_job_missing|job.{0,15}not found|brak.{0,25}zlecen|nie ma tego zlecenia"),
    ("RATE_OR_BUDGET", r"rate.?limit|quota|budget|koszt|limit (ai|astra)|429|punkt|too many requests"),
    ("NETWORK", r"connection|network|polacz|laczen|reset by peer|upstream|502|503|504|socket"),
    ("DATABASE_OR_DISK", r"sqlite|database|dysk|miejs[ct]|no space|storage|brak wolnego"),
    ("BLENDER_OR_RENDER", r"blender|render|mesh|siatk|uv\b|modelowania|geometry|eksport|export"),
    ("AI_PROVIDER", r"openai|provider|astra|sol\b|luna|prompt|token|api.error"),
    ("VALIDATION", r"validat|nieprawid|invalid|niedozwol|weryfik|schema|format"),
    ("CANCELLED", r"anulowan|cancel"),
]
def ascii_lower(v):
    return "".join(c for c in unicodedata.normalize("NFKD", v.lower())
                   if not unicodedata.combining(c))
def classify(detail):
    if detail is None:
        return "NULL", "EMPTY", "NO_DETAIL"
    if not isinstance(detail, str):
        return "NON_TEXT", "EMPTY", "NO_DETAIL"
    try:
        value = json.loads(detail)
        fmt = "JSON_" + type(value).__name__.upper()
    except (ValueError, TypeError):
        fmt = "PLAIN_TEXT"
    length = "EMPTY" if not detail else "SHORT" if len(detail) <= 128 else "MEDIUM" if len(detail) <= 2048 else "LONG"
    text = ascii_lower(detail)
    return fmt, length, next((label for label, expr in RULES if re.search(expr, text)), "OTHER_OR_UNCLASSIFIED")
def run(path=DB):
    if not os.path.isfile(path):
        print("DATABASE_NOT_FOUND")
        return 2
    conn = sqlite3.connect("file:" + path + "?mode=ro", uri=True, timeout=3)
    conn.execute("PRAGMA query_only=ON")
    try:
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            print("SQLITE_INTEGRITY_NOT_OK")
            return 3
        formats = collections.Counter()
        lengths = collections.Counter()
        causes = collections.Counter()
        states = collections.Counter()
        bins = collections.defaultdict(collections.Counter)
        now = datetime.datetime.now(datetime.timezone.utc).timestamp()
        for state, detail, created in conn.execute("SELECT state, detail, created FROM jobs"):
            if state not in ("succeeded", "failed", "cancelled", "queued", "generating", "retrying", "building"):
                state = "OTHER_STATE"
            states[state] += 1
            if state == "failed":
                fmt, size, reason = classify(detail)
                formats[fmt] += 1
                lengths[size] += 1
                causes[reason] += 1
            # No original timestamps, request IDs, paths, prompts or messages in output.
            if isinstance(created, (int, float)) and 0 <= now - created < 86400:
                bucket = "LAST_24H"
            elif isinstance(created, (int, float)) and 0 <= now - created < 7 * 86400:
                bucket = "LAST_7D_EXCL_24H"
            elif isinstance(created, (int, float)) and 0 <= now - created < 30 * 86400:
                bucket = "LAST_30D_EXCL_7D"
            else:
                bucket = "OLDER_OR_UNKNOWN"
            bins[bucket][state] += 1
        print("=== WORLDIFACT P0 READONLY AGGREGATES ===")
        for title, counter in (("STATES", states), ("DETAIL_FORMATS_FAILED", formats),
                               ("DETAIL_LENGTHS_FAILED", lengths), ("FAILURE_CATEGORIES", causes)):
            print(title)
            for key, value in sorted(counter.items()):
                print(" ", key, value)
        print("TIME_BUCKET_STATE_COUNTS")
        for bucket, values in sorted(bins.items()):
            for key, value in sorted(values.items()):
                print(" ", bucket, key, value)
        print("INTEGRITY ok")
        print("=== COMPLETE ===")
        return 0
    finally:
        conn.close()
if __name__ == "__main__":
    sys.exit(run(sys.argv[1] if len(sys.argv) == 2 else DB))
