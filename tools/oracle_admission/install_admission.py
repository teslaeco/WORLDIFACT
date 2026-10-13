"""Strict preparatory Oracle release installer. Never activates an unverified VM.

Copies only the exact pinned 15-source predecessor into an isolated private
staging directory and builds the reviewed STAGE/START candidate. This is the
first (safe) transaction phase. Service activation is deliberately fail-closed
until separate native gates, current receipts, idle fence and rollback are bound.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile

import patch_server
from read_only_probe import EXPECTED

NEW_FILES = ('server.py', 'durable_inbox.py', 'durable_admission.py')
SOURCE_SET = frozenset(EXPECTED)
MAX_FILE = 2 * 1024 * 1024
PINNED_HELPERS = {
 'durable_inbox.py': 'b2c378c139b8278ce16ec602079136b8ce133fb7e8ba93fc892533c0cee0a6ce',
 'durable_admission.py': '99a775230a01d5d4ec8c3fd98f161c14a56bc5147b84e973f07226c5b909bf21',
}

class Refused(ValueError):
    pass


def read_regular(path):
    path = Path(path).absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise Refused('UNSAFE_PATH')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_FILE:
            raise Refused('INVALID_SOURCE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(MAX_FILE+1)
        if len(data) != info.st_size or os.fstat(fd).st_mtime_ns != info.st_mtime_ns:
            raise Refused('SOURCE_CHANGED')
        return data
    finally:
        os.close(fd)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def validate_source(source):
    source = Path(source).absolute()
    if not source.is_dir() or source.is_symlink():
        raise Refused('SOURCE_REQUIRED')
    originals = {name: read_regular(source / name) for name in SOURCE_SET}
    if {name: sha(raw) for name, raw in originals.items()} != EXPECTED:
        raise Refused('UNREVIEWED_SOURCE')
    for name in NEW_FILES[1:]:
        if os.path.lexists(source / name):
            raise Refused('SOURCE_ALREADY_MODIFIED')
    return originals


def candidate(source):
    originals = validate_source(source)
    here = Path(__file__).resolve().parent
    helpers = {name: read_regular(here / name) for name in NEW_FILES[1:]}
    if {name:sha(raw) for name,raw in helpers.items()} != PINNED_HELPERS:
        raise Refused('UNREVIEWED_HELPER')
    output = {'server.py': patch_server.transform(originals['server.py'], helpers), **helpers}
    for name, raw in output.items():
        compile(raw, name, 'exec')
    return originals, output


def plan(source):
    originals, output = candidate(source)
    return {'phase':'VERIFIED_PREPARATION_ONLY', 'source_files_checked':len(originals),
            'original_sha256':{name:sha(raw) for name,raw in sorted(originals.items())},
            'candidate_sha256':{name:sha(raw) for name,raw in sorted(output.items())},
            'production_activation_verified':False, 'production_changed':False,
            'paid_generation_requested':False, 'receipt_chain_rebound':False,
            'native_cli_mcp_blender_gates_verified':False}


def prepare(source, destination):
    source, destination = Path(source).absolute(), Path(destination).absolute()
    originals, output = candidate(source)
    if (destination == source or source in destination.parents or destination == Path('/')
            or any(p.is_symlink() for p in (destination, *destination.parents))
            or not destination.parent.is_dir() or os.path.lexists(destination)):
        raise Refused('UNSAFE_STAGE_PATH')
    # Temporary private area; no live service, existing receipt or job is touched.
    stage = Path(tempfile.mkdtemp(prefix='.admission-stage-', dir=destination.parent))
    try:
        os.chmod(stage, 0o700)
        for name, raw in {**originals, **output}.items():
            fd = os.open(stage / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as file:
                file.write(raw); file.flush(); os.fsync(file.fileno())
        evidence = plan(source)
        manifest = json.dumps(evidence,sort_keys=True,indent=2).encode()+b'\n'
        fd = os.open(stage/'ADMISSION_STAGE.json', os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as file:
            file.write(manifest); file.flush(); os.fsync(file.fileno())
        dfd=os.open(stage,os.O_DIRECTORY|os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
        if {name:sha(read_regular(stage/name)) for name in output} != evidence['candidate_sha256']:
            raise Refused('STAGE_CHANGED')
        os.rename(stage,destination)
        dfd=os.open(destination.parent,os.O_DIRECTORY|os.O_RDONLY)
        try:os.fsync(dfd)
        finally:os.close(dfd)
        return evidence
    except BaseException:
        if stage.exists():shutil.rmtree(stage)
        raise


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--source',required=True)
    parser.add_argument('--destination')
    action=parser.add_mutually_exclusive_group()
    action.add_argument('--prepare',action='store_true')
    action.add_argument('--activate',action='store_true')
    args=parser.parse_args(argv)
    if args.activate:
        raise Refused('NATIVE_GATES_AND_RECEIPT_REBINDING_NOT_IMPLEMENTED_NO_PRODUCTION_ACTIVATION')
    result=prepare(args.source,args.destination) if args.prepare and args.destination else plan(args.source) if not args.prepare and not args.destination else None
    if result is None:raise Refused('EXACT_PREPARATION_ARGUMENTS_REQUIRED')
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__':
    try:main()
    except (OSError,Refused,ValueError) as exc:
        print(json.dumps({'phase':'NO_GO','code':str(exc),'production_changed':False,'paid_generation_requested':False}),file=sys.stderr)
        raise SystemExit(1)