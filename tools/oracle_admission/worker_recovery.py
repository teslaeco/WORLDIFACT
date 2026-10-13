"""Build-time repair of the reviewed queue loop; no live I/O or execution.

The caller verifies the whole original server SHA-256 before this transform.
Storage faults leave uncertain work for reconciliation, never requeue it. Only
non-authoritative timing output is best-effort; original terminal/cost evidence
and provider invocation code are unchanged.
"""
import ast


def transform(text):
    def once(before, after):
        nonlocal text
        if text.count(before) != 1:
            raise ValueError('Reviewed worker recovery anchor changed.')
        text = text.replace(before, after, 1)

    # Do not advertise a job in memory until its database claim has committed.
    # An ambiguous commit is left as-is, not reset to queued or executed again.
    once("            RUNNING.add(job['id'])\n"
         "            cancelled = CANCEL.setdefault(job['id'], threading.Event())\n", '')
    once("        folder = JOBS / job['id']\n"
         "        folder.mkdir(mode=0o700, exist_ok=True)\n",
         "        with LOCK:\n"
         "            RUNNING.add(job['id'])\n"
         "            cancelled = CANCEL.setdefault(job['id'], threading.Event())\n"
         "        folder = JOBS / job['id']\n")
    once("        first_error=None\n        try:\n",
         "        first_error=None\n        try:\n"
         "            folder.mkdir(mode=0o700, exist_ok=True)\n")
    once("        finally:\n"
         "            write_json(folder/'timing.json',{'total_seconds':round(time.monotonic()-started,2),\n"
         "                'ai_seconds':round(ai_seconds,2),'blender_seconds':round(blender_seconds,2),'last_phase':phase})\n"
         "            with LOCK:\n"
         "                CANCEL.pop(job['id'], None)\n"
         "                RUNNING.discard(job['id'])\n",
         "        finally:\n"
         "            try:\n"
         "                write_json(folder/'timing.json',{'total_seconds':round(time.monotonic()-started,2),\n"
         "                    'ai_seconds':round(ai_seconds,2),'blender_seconds':round(blender_seconds,2),'last_phase':phase})\n"
         "            except (OSError, ValueError, TypeError):\n"
         "                pass  # Diagnostic failure cannot change a model or its cost evidence.\n"
         "            finally:\n"
         "                with LOCK:\n"
         "                    CANCEL.pop(job['id'], None)\n"
         "                    RUNNING.discard(job['id'])\n")

    # A transient disk/database error outside the per-job try must not kill the
    # sole queue thread. The existing two-second wait bounds the next check.
    prefix = 'def worker():\n    while True:\n        WAKE.wait(2)\n        WAKE.clear()\n'
    if text.count(prefix) != 1:
        raise ValueError('Reviewed queue loop changed.')
    start = text.index(prefix)
    tree = ast.parse(text)
    workers = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'worker']
    if len(workers) != 1:
        raise ValueError('One reviewed queue worker is required.')
    lines = text.splitlines(keepends=True)
    end = sum(len(line) for line in lines[:workers[0].end_lineno])
    body = text[start + len(prefix):end]
    indented = ''.join('    ' + line if line.strip() else line for line in body.splitlines(keepends=True))
    if not indented.endswith('\n'):
        indented += '\n'
    replacement = (prefix + '        try:\n' + indented
                   + '        except (OSError, sqlite3.Error):\n'
                     '            continue  # Keep original rows and uncertain provider evidence.\n')
    result = text[:start] + replacement + text[end:]
    ast.parse(result)
    return result
