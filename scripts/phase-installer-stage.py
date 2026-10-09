# Temporary source staging plan; no production access.
# The verified implementation is expanded on the hosted runner, then removed.
from pathlib import Path
import hashlib
import json
import re

root = Path('tools/model_construction')
def edit(name, replacements):
    path = root / name
    value = path.read_text()
    for old, new in replacements:
        if value.count(old) != 1:
            raise RuntimeError('Unexpected pinned predecessor: ' + name)
        value = value.replace(old, new)
    path.write_text(value)

edit('construction_manifest.py', [
 ('MODIFIED = runtime_patch.MODIFIED', '''# Complete initial-edit runtime observed on the owner host. This immutable
# predecessor is not supplied by a receipt, flag, source checkout or caller.
RESPONSE_PHASE_BEFORE = {**INITIAL_EDIT_BEFORE,
 'construction_payload.py': '475e8251a2255775889d00d0611bb8954044cfd7f2dfba27c6735403408c35b8',
 'phased_controller.py': '1825f3cbff6e229799d22001481d8075a8e8b5c567e60b3736a9208126c99d6b',
 'runtime_controller.py': '9188b29c60ac26ab9f63781660db548b1757ee430fc4b33a43930f6868168b0d'}
RESPONSE_PHASE_HELPERS = frozenset(('construction_payload.py',))
MODIFIED = runtime_patch.MODIFIED'''),
 ('return value == EXPECTED or value == after or value == payload_predecessor() or value == initial_edit_predecessor()',
  'return (value == EXPECTED or value == after or value == payload_predecessor()\n                or value == initial_edit_predecessor() or value == response_phase_predecessor())'),
])
p = root / 'construction_manifest.py'
p.write_text(p.read_text() + '''

def response_phase_predecessor():
    """Require the exact already-installed initial-edit runtime, not older code."""
    before, after = RESPONSE_PHASE_BEFORE, final_manifest()
    if (not isinstance(before, dict) or set(before) != health.SOURCES
            or any(not isinstance(value, str) or re.fullmatch('[a-f0-9]{64}', value) is None
                   for value in before.values())
            or {name for name in after if after[name] != before[name]} != RESPONSE_PHASE_HELPERS):
        raise ValueError('Exact response-phase update manifest is not frozen.')
    return dict(before)


def reviewed_response_phase_sources(original):
    if {name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != response_phase_predecessor():
        raise ValueError('Exact installed initial-edit construction source is required.')
    return True


def response_phase_changes(original, helpers):
    reviewed_response_phase_sources(original)
    if not isinstance(helpers, dict) or set(helpers) != RESPONSE_PHASE_HELPERS:
        raise ValueError('Only the reviewed response decoder may change.')
    raw = helpers['construction_payload.py']
    if not isinstance(raw, bytes) or not 0 < len(raw) <= 1048576:
        raise ValueError('Invalid bounded runtime helper.')
    compile(raw, 'construction_payload.py', 'exec')
    changed = {**original, **helpers}
    if {name: hashlib.sha256(value).hexdigest() for name, value in changed.items()} != final_manifest():
        raise ValueError('Response-phase update differs from frozen runtime manifest.')
    return changed
''')
edit('install_construction.py', [
 ('INITIAL_EDIT_WRITES = manifest.INITIAL_EDIT_HELPERS | {policy.RECEIPT}',
  'INITIAL_EDIT_WRITES = manifest.INITIAL_EDIT_HELPERS | {policy.RECEIPT}\nRESPONSE_PHASE_WRITES = manifest.RESPONSE_PHASE_HELPERS | {policy.RECEIPT}'),
 ('''def installed_sources(source):
    original = {name: base.read_regular(source / name) for name in policy.SOURCES}
    manifest.reviewed_installed_sources(original)
    return original


def validate_installed_receipts(source, original):
    manifest.reviewed_installed_sources({name: original[name] for name in policy.SOURCES})
    proof = policy._json(base.read_regular(source / policy.RECEIPT, 16384))
    if (proof.get('sha256') != manifest.initial_edit_predecessor()''',
 '''def installed_sources(source, *, response_phase=False):
    original = {name: base.read_regular(source / name) for name in policy.SOURCES}
    (manifest.reviewed_response_phase_sources if response_phase else manifest.reviewed_installed_sources)(original)
    return original


def installed_predecessor(response_phase=False):
    return manifest.response_phase_predecessor() if response_phase else manifest.initial_edit_predecessor()


def validate_installed_receipts(source, original, *, response_phase=False):
    (manifest.reviewed_response_phase_sources if response_phase else manifest.reviewed_installed_sources)(
        {name: original[name] for name in policy.SOURCES})
    proof = policy._json(base.read_regular(source / policy.RECEIPT, 16384))
    if (proof.get('sha256') != installed_predecessor(response_phase)'''),
 ('def initial_edit_update_receipt(original, changed, evidence, allow_cancelled_cleanup):',
  'def initial_edit_update_receipt(original, changed, evidence, allow_cancelled_cleanup, *, response_phase=False):'),
 ('''    proof['initial_edit_update'] = {
        'revision': 'typed-plan-initial-edit-v1',''',
 '''    proof['response_phase_update' if response_phase else 'initial_edit_update'] = {
        'revision': 'final-answer-selection-v1' if response_phase else 'typed-plan-initial-edit-v1','''),
 ('''        update = getattr(self, 'update_initial_edit', False)
        original = installed_sources(self.source) if update else original_sources(self.source)
        self.source_variant = 'PRICING'
        self.expected_source_sha256 = manifest.initial_edit_predecessor() if update else dict(manifest.EXPECTED)''',
 '''        response_phase = getattr(self, 'update_response_phase', False)
        update = getattr(self, 'update_initial_edit', False) or response_phase
        original = installed_sources(self.source, response_phase=response_phase) if update else original_sources(self.source)
        self.source_variant = 'PRICING'
        self.expected_source_sha256 = installed_predecessor(response_phase) if update else dict(manifest.EXPECTED)'''),
 ('''        (validate_installed_receipts if update else validate_receipts)(self.source, original)''',
 '''        if update:
            validate_installed_receipts(self.source, original, response_phase=response_phase)
        else:
            validate_receipts(self.source, original)'''),
 ('''        if getattr(self, 'update_initial_edit', False):
            validate_installed_receipts(self.source, installed_sources(self.source))
            return self.context_health()''',
 '''        response_phase = getattr(self, 'update_response_phase', False)
        if getattr(self, 'update_initial_edit', False) or response_phase:
            validate_installed_receipts(self.source, installed_sources(self.source, response_phase=response_phase),
                                        response_phase=response_phase)
            return self.context_health()'''),
 ('''def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False, update_initial_edit=False):''',
 '''def install(source, workspace, operations, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False, update_initial_edit=False, update_response_phase=False):'''),
 ('''    if update_payload and update_initial_edit:
        raise Refused('conflicting_update_modes')''',
 '''    if type(update_response_phase) is not bool:
        raise Refused('response_phase_update_mode_invalid')
    if sum((update_payload, update_initial_edit, update_response_phase)) > 1:
        raise Refused('conflicting_update_modes')'''),
 ('''    if update_initial_edit:
        manifest.initial_edit_predecessor()
    absent = frozenset() if update_initial_edit else NEW_FILES
    writes = INITIAL_EDIT_WRITES if update_initial_edit else WRITES
    operations.update_initial_edit = update_initial_edit''',
 '''    update = update_initial_edit or update_response_phase
    if update:
        installed_predecessor(update_response_phase)
    absent = frozenset() if update else NEW_FILES
    writes = RESPONSE_PHASE_WRITES if update_response_phase else INITIAL_EDIT_WRITES if update_initial_edit else WRITES
    operations.update_initial_edit = update_initial_edit
    operations.update_response_phase = update_response_phase'''),
 ('''    original = installed_sources(source) if update_initial_edit else original_sources(source)
    operations.source_variant = 'PRICING'
    operations.expected_source_sha256 = manifest.initial_edit_predecessor() if update_initial_edit else dict(manifest.EXPECTED)
    if update_initial_edit:
        helpers = {name: base.read_regular(HERE / name) for name in manifest.INITIAL_EDIT_HELPERS}
        changed = manifest.initial_edit_changes(original, helpers)''',
 '''    original = installed_sources(source, response_phase=update_response_phase) if update else original_sources(source)
    operations.source_variant = 'PRICING'
    operations.expected_source_sha256 = installed_predecessor(update_response_phase) if update else dict(manifest.EXPECTED)
    if update:
        names = manifest.RESPONSE_PHASE_HELPERS if update_response_phase else manifest.INITIAL_EDIT_HELPERS
        helpers = {name: base.read_regular(HERE / name) for name in names}
        changed = (manifest.response_phase_changes if update_response_phase else manifest.initial_edit_changes)(original, helpers)'''),
 ('''    original.update({name: base.read_regular(source / name, 16384) for name in RECEIPTS | ({policy.RECEIPT} if update_initial_edit else set())})
    (validate_installed_receipts if update_initial_edit else validate_receipts)(source, original)''',
 '''    original.update({name: base.read_regular(source / name, 16384) for name in RECEIPTS | ({policy.RECEIPT} if update else set())})
    if update:
        validate_installed_receipts(source, original, response_phase=update_response_phase)
    else:
        validate_receipts(source, original)'''),
 ('''            if update_initial_edit:
                receipts = initial_edit_update_receipt(original, changed, evidence, allow_cancelled_cleanup)
                base.atomic_write(workspace / 'INITIAL_EDIT_UPDATE_GENERIC_EVIDENCE.json', evidence.generic_receipt)''',
 '''            if update:
                receipts = initial_edit_update_receipt(original, changed, evidence, allow_cancelled_cleanup,
                                                       response_phase=update_response_phase)
                witness = 'RESPONSE_PHASE_UPDATE_GENERIC_EVIDENCE.json' if update_response_phase else 'INITIAL_EDIT_UPDATE_GENERIC_EVIDENCE.json'
                base.atomic_write(workspace / witness, evidence.generic_receipt)'''),
 ('''    updates.add_argument('--update-initial-edit', action='store_true')''',
 '''    updates.add_argument('--update-initial-edit', action='store_true')
    updates.add_argument('--update-response-phase', action='store_true')'''),
 ('''    if args.update_initial_edit:
        manifest.initial_edit_predecessor()
    frozen_dependencies()''',
 '''    if args.update_initial_edit or args.update_response_phase:
        installed_predecessor(args.update_response_phase)
    frozen_dependencies()'''),
 ('''                        expected_cancelled_job=args.expected_cancelled_job, update_initial_edit=args.update_initial_edit)''',
 '''                        expected_cancelled_job=args.expected_cancelled_job, update_initial_edit=args.update_initial_edit,
                        update_response_phase=args.update_response_phase)'''),
])
edit('oracle_construction_launch.py', [
 ('''            (['--update-initial-edit'] if UPDATE_INITIAL_EDIT else []),''',
 '''            (['--update-initial-edit'] if UPDATE_INITIAL_EDIT else []) +
            (['--update-response-phase'] if UPDATE_RESPONSE_PHASE else []),'''),
 ('''def script(payload, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False, update_initial_edit=False):''',
 '''def script(payload, approved=False, allow_cancelled_cleanup=False, expected_cancelled_job=None, update_payload=False, update_initial_edit=False, update_response_phase=False):'''),
 ('''    if type(update_payload) is not bool or type(update_initial_edit) is not bool:
        raise LaunchError('Explicit update modes must be boolean.')
    if update_payload and update_initial_edit:raise LaunchError('Conflicting update modes; no connection made.')''',
 '''    if any(type(mode) is not bool for mode in (update_payload, update_initial_edit, update_response_phase)):
        raise LaunchError('Explicit update modes must be boolean.')
    if sum((update_payload, update_initial_edit, update_response_phase)) > 1:raise LaunchError('Conflicting update modes; no connection made.')'''),
 ("+'\\nUPDATE_PAYLOAD='+repr(update_payload)+'\\nUPDATE_INITIAL_EDIT='+repr(update_initial_edit)+'\\nAPPROVED=True",
  "+'\\nUPDATE_PAYLOAD='+repr(update_payload)+'\\nUPDATE_INITIAL_EDIT='+repr(update_initial_edit)+'\\nUPDATE_RESPONSE_PHASE='+repr(update_response_phase)+'\\nAPPROVED=True"),
 ('''    updates.add_argument('--update-initial-edit', action='store_true')''',
 '''    updates.add_argument('--update-initial-edit', action='store_true')
    updates.add_argument('--update-response-phase', action='store_true')'''),
 ('''                     expected_cancelled_job=args.expected_cancelled_job, update_initial_edit=args.update_initial_edit)
    print('Running the exact reviewed initial-edit update. No paid model request.' if args.update_initial_edit''',
 '''                     expected_cancelled_job=args.expected_cancelled_job, update_initial_edit=args.update_initial_edit,
                     update_response_phase=args.update_response_phase)
    print('Running the exact reviewed response decoder update. No paid model request.' if args.update_response_phase
          else 'Running the exact reviewed initial-edit update. No paid model request.' if args.update_initial_edit'''),
])
p = root / 'oracle_construction_launch.py'
s = p.read_text()
for name in ('construction_manifest.py', 'install_construction.py'):
    raw = (root / name).read_bytes()
    sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    pattern = "( '" + name + "': \\('tools/model_construction/" + name + "',\\n?\\s*')[0-9a-f]{40}('\\))"
    s, count = re.subn(pattern, lambda m: m.group(1) + sha + m.group(2), s)
    if count != 1:
        raise RuntimeError('Missing exact launcher pin')
p.write_text(s)
(root / 'test_response_phase_update.py').write_bytes(Path('scripts/phase-installer-test.source').read_bytes())
Path('docs/RESPONSE_PHASE_INSTALL_20261009.md').write_bytes(Path('scripts/phase-installer-guide.source').read_bytes())
p = Path('docs/CONTEST_STATUS.md')
p.write_text(p.read_text() + '''

## Decoder update delivery — 9 October 2026

All six pull-request workflows on `71ccc84d4dca71a19e2ac3583c05a4563ce7e3a3`
completed successfully, including construction run 37965169861's native Blender
job and Verify WORLDIFACT run 37965169576. These results cover the decoder source
correction, not a production installation or an accepted new paid model.

The installation gap is now addressed with a separate explicit
`--update-response-phase` mode. It requires the entire frozen already-installed
initial-edit source map and its valid receipt chain. It writes only the decoder
and the top construction receipt, preserving previous initial-edit evidence and
all older receipts. Existing idle fences, four offline gates, rollback protection
and activation checks remain required. The owner-run checksum-pinned launcher
passes this new mode explicitly; retired modes and conflicting flags refuse.
No implicit update, secret export, broader SSH grant, job cancellation, financial
change or paid generation is introduced. New transaction regressions cover the
exact two-file write set, permissions/history preservation, failures before and
after writes, gate failures, active/cancelled work and ambiguous activation.

The original restricted GitHub maintenance grant supports fixed historical
operations, not arbitrary SSH commands. Its stored credentials are not missing
by definition, but they do not authorize new source bytes without a reviewed
grant update. No such grant or account change is made by this repair. The
[installation handoff](RESPONSE_PHASE_INSTALL_20261009.md) uses the original
owner's existing SSH connection instead. The new installation mode must pass
its exact-head hosted tests before delivery; their outcome is recorded in the
PR. No Oracle installation or production-restored claim is made by this commit.
''')
expected = {
 'docs/CONTEST_STATUS.md': '5c34e5958f452eef30c5a362e690c70b2b133cc855e17b1050223f9d4437cadb',
 'docs/RESPONSE_PHASE_INSTALL_20261009.md': 'a7b368d916254c1d3c373bc366ce7dbf14e9edcf475a67a69b170a8c568d7822',
 'tools/model_construction/construction_manifest.py': '41a8fe5f766a010139b1bc354a9216be104f133377eaaed719758f4a705c6fad',
 'tools/model_construction/install_construction.py': 'a5001b0fd92ff408e9c9a1f7b42cf0ef7e3cb223272a374a8ef7f3feac1c03e3',
 'tools/model_construction/oracle_construction_launch.py': '8bfa682b53721404e8a0e82fd4b25b7c3b17b0d2b93b1377fa5f31273f2328d7',
 'tools/model_construction/test_response_phase_update.py': 'fa158780cfc8ee4a887383297fdd7a3353f0488221195fec6a1711acec8de1a5'}
for name, sha in expected.items():
    if hashlib.sha256(Path(name).read_bytes()).hexdigest() != sha:
        raise RuntimeError('Candidate differs from reviewed local bytes: ' + name)
print('Six exact source files staged; no runtime service or provider accessed.')
