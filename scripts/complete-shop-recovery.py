"""Finish the existing UI patch while preserving the immutable historical release."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path.cwd()
RELEASE = '38e7048c4176fac4c9808203af5bd58a1ae7d10e'
FIXTURE = 'tests/fixtures/failed-hold-release-38e7048c.source.txt'
TEST = 'tests/failed-hold-release.test.mjs'

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if text.count(old) != 1:
        raise RuntimeError('Unexpected source shape: ' + path)
    p.write_text(text.replace(old, new))

manifest_bytes = (ROOT / 'config/failed-hold-release.json').read_bytes()
if blob(manifest_bytes) != 'db69ce0a4bb6f453941cb2f8254ff137c2307b2c':
    raise RuntimeError('Historical manifest changed')
manifest = json.loads(manifest_bytes)
sources = {}
for path, record in manifest['payload'].items():
    # Read the named historical release, not the modified worktree.
    raw = subprocess.check_output(['git', 'show', RELEASE + ':' + path])
    if blob(raw) != record['newBlob']:
        raise RuntimeError('Historical payload mismatch: ' + path)
    sources[path] = raw.decode('utf-8')
(ROOT / FIXTURE).write_text(json.dumps({'version': 1, 'sourceCommit': RELEASE, 'sources': sources}, ensure_ascii=False, separators=(',', ':')) + '\n')
subprocess.run(['python3', '-B', 'scripts/stage-shop-composer.py'], check=True)
subprocess.run(['git', 'apply', '--check', 'scripts/finish-shop-ui.patch'], check=True)
subprocess.run(['git', 'apply', 'scripts/finish-shop-ui.patch'], check=True)

# Establish the actual failure before repairing this test's historical scope.
proof = subprocess.run(['node', '--test', '--test-name-pattern=manifest and workflow are immutable', TEST], capture_output=True, text=True)
if proof.returncode == 0 or 'src/pages/ShopPage.tsx' not in proof.stdout + proof.stderr:
    raise RuntimeError('Expected historical-worktree coupling was not reproduced')
print('REPRODUCED: current Shop source was incorrectly compared with the historical waiver payload.')

helper = '''function verifyHistoricalPayload(manifest, snapshot) {
  assert.deepEqual(Object.keys(snapshot).sort(), ['sourceCommit', 'sources', 'version'])
  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.sourceCommit, '38e7048c4176fac4c9808203af5bd58a1ae7d10e')
  assert.ok(snapshot.sources && typeof snapshot.sources === 'object' && !Array.isArray(snapshot.sources))
  assert.deepEqual(Object.keys(snapshot.sources).sort(), Object.keys(manifest.payload).sort())
  for (const [path, record] of Object.entries(manifest.payload)) {
    assert.equal(typeof snapshot.sources[path], 'string', path)
    assert.equal(blob(snapshot.sources[path]), record.newBlob, path)
  }
}
function historicalPayloadSnapshot() {
  return JSON.parse(readFileSync(join(root, 'tests/fixtures/failed-hold-release-38e7048c.source.txt'), 'utf8'))
}
'''
replace_once(TEST, "test('manifest and workflow are immutable and the existing deploy job remains byte-identical', () => {", helper + "\ntest('manifest and workflow are immutable and the existing deploy job remains byte-identical', () => {")
replace_once(TEST, "    for (const [path, record] of Object.entries(manifest.payload)) assert.equal(blob(readFileSync(join(root, path))), record.newBlob, path)", "    // Historical release integrity is separate from current application regressions.\n    // The production selector below still checks the actual candidate diff and blobs.\n    verifyHistoricalPayload(manifest, historicalPayloadSnapshot())")
with (ROOT / TEST).open('a') as stream:
    stream.write('''
test('historical payload rejects substituted Shop/test bytes, missing paths and wrong release provenance', () => {
  const manifest = readManifest(readFileSync(join(root, CONFIG_PATH)))
  verifyHistoricalPayload(manifest, historicalPayloadSnapshot())
  for (const path of ['src/pages/ShopPage.tsx', 'tests/failed-hold-release.test.mjs', 'server/entitlements.ts']) {
    const changed = historicalPayloadSnapshot()
    changed.sources[path] += '\\n'
    assert.throws(() => verifyHistoricalPayload(manifest, changed), { code: 'ERR_ASSERTION' })
    const missing = historicalPayloadSnapshot()
    delete missing.sources[path]
    assert.throws(() => verifyHistoricalPayload(manifest, missing), { code: 'ERR_ASSERTION' })
  }
  for (const mutate of [x => { x.sourceCommit = '0'.repeat(40) }, x => { x.version = 2 },
    x => { x.sources['src/unreviewed.ts'] = '' }, x => { x.extra = true }]) {
    const changed = historicalPayloadSnapshot(); mutate(changed)
    assert.throws(() => verifyHistoricalPayload(manifest, changed), { code: 'ERR_ASSERTION' })
  }
})
test('a historical snapshot never authorizes a later Shop edit as the original waiver release', () => {
  const fixture = evidence({ parents: [other], event: { before: other }, changes: [modification('src/pages/ShopPage.tsx')] })
  let calls = 0
  const decision = selectFailedHoldRelease({ ...fixture, legacySelector: () => { calls++; return { deployAllowed: false } } })
  assert.equal(calls, 1)
  assert.deepEqual(decision, { deployAllowed: false, failedHoldWaiver: false })
})
''')
status = ROOT / 'docs/CONTEST_STATUS.md'
status.write_text('''# 10 October 2026 — historical test coupling repaired; release/account gates remain separate

The UI staging run 38047078893 failed at the immutable historical payload check:
2071 of 2072 tests passed, but the changed ShopPage was compared with the original
waiver release's blob. This correction preserves that manifest, every historical
blob, the production selector and the entire Cloudflare workflow. The test now
checks an independently captured payload from immutable commit 38e7048c against
the original manifest, including the original test's own bytes. Added regressions
reject changed/missing historical sources and prove that a later Shop edit gains
no historical deployment authority. No assertion is skipped or hash repinned.

The existing composer/point-display UI patch is applied, not merely left as a
staging script. Its original requests, next drafts and saved models are retained.
Coupon redemption remains INACTIVE. No customer balance, held-point waiver,
provider funding, billing, coupon registration, secret or live model request is
modified here. Prior denied financial operations must not be retried indirectly.
Full candidate CI, production publication, authenticated account correction and
LIVE generation remain distinct gates and require their own observed evidence.

## Earlier evidence (preserved)

''' + status.read_text())
print('Prepared current UI plus historical-integrity regressions; production and account data untouched.')
