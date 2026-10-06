import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

// Standalone native fetch API regression, NOT a site preview or visual test.
// Only inert data: fixtures are fetched. No Oracle, OpenAI, HTTP or account.
test('native Chromium reproduces the old invocation error and accepts the repaired Studio lifecycle', { timeout: 45_000 }, () => {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)
  const browser = candidates.find(command => spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 3000 }).status === 0)
  assert.ok(browser, 'Chromium/Chrome is required for this browser-specific regression; do not report Node mocks as browser proof.')
  const compile = name => ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/^export /gm, '')
  const protocol = compile('studioProtocol'), draft = compile('studioDraft')
  const client = compile('studioClient').replace(/^import .+ from ['"]\.\/(?:studioProtocol|studioDraft)\.ts['"];?\s*$/gm, '')
  assert.doesNotMatch(protocol + draft + client, /^import /m, 'Unexpected new dependency: update the explicit fixture bundle.')
  const exercise = `
(async () => {
  const result = document.getElementById('result');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    const nativeFetch = globalThis.fetch;
    let rejected = false;
    try { await ({ fetcher: nativeFetch }).fetcher('data:application/json,%7B%7D'); }
    catch (error) { rejected = /Illegal invocation/.test(error.message); }
    check(rejected, 'Native fetch did not reproduce the original wrong-receiver defect');
    const id = '12345678-1234-4234-8234-123456789abc';
    const nextId = '87654321-1234-4234-8234-123456789abc';
    const makeReceipt = value => ({ id: value, createdAt: new Date().toISOString(), ticket: value + '.' + Date.now() + '.' + 'a'.repeat(64) + '.' + 'b'.repeat(64) });
    const receipt = makeReceipt(id), nextReceipt = makeReceipt(nextId);
    const values = new Map(), calls = []; let preparations = 0;
    const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    function fixtureFetch(path, init) {
      calls.push({ path, method: init?.method || 'GET' });
      let body;
      if (path === '/api/studio/prepare') body = preparations++ === 0 ? receipt : nextReceipt;
      else if (path === '/api/studio/jobs') {
        check(!!store.getItem(STUDIO_RECEIPT_KEY), 'Receipt was not saved before submission');
        body = { job: { id: JSON.parse(store.getItem(STUDIO_RECEIPT_KEY)).receipt.id, state: 'building' } };
      } else if (path === '/api/studio/jobs/' + id || path === '/api/studio/jobs/' + nextId) body = { job: { id: path.endsWith(nextId) ? nextId : id, state: 'succeeded' } };
      else {
        check(path.startsWith('/api/studio/jobs/' + id + '/'), 'Unexpected artifact route');
        return nativeFetch.call(this, 'data:application/octet-stream;base64,AQID', { signal: init?.signal });
      }
      return nativeFetch.call(this, 'data:application/json,' + encodeURIComponent(JSON.stringify(body)), { signal: init?.signal });
    }
    globalThis.fetch = fixtureFetch;
    try {
      const current = new StudioCoordinator(store);
      const input = { worldId: 'enchanted-ai-shop', prompt: 'Create a princess figurine', purpose: 'figurine', textureMaxSize: 4096, photos: [] };
      check((await current.start(input, () => {})).state === 'building', 'Submission returned a false pending result');
      const restored = new StudioCoordinator(store);
      check(restored.restore().receipt.id === id, 'Reload changed the job');
      check((await restored.poll()).state === 'succeeded', 'Native status fetch failed');
      for (const format of ['model', 'pbr', 'fbx', 'blend']) check((await restored.artifact(format)).size === 3, 'Native artifact fetch failed: ' + format);
      check(calls.length === 7, 'Unexpected initial request count');
      check(calls.filter(call => call.path === '/api/studio/jobs' && call.method === 'POST').length === 1, 'Duplicate generation intent');
      const next = await restored.start({ ...input, prompt: 'Create a new rook', textureMaxSize: 2048, generationProfile: FAST_DRAFT_PROFILE }, () => {}, '', true);
      check(next.id === nextId && next.state === 'building', 'Explicit next model failed');
      check(JSON.parse(store.getItem(STUDIO_RECEIPT_HISTORY_PREFIX + id)).receipt.id === id, 'Old recovery receipt was lost');
      check((await restored.poll()).id === nextId, 'Recovery selected the wrong new job');
      check(calls.length === 10, 'Next draft performed unexpected transport');
      result.textContent = 'PASS: native old error reproduced; actual client prepared once per explicit job, restored, polled and fetched fixture exports; old receipt preserved; no service calls.';
    } finally { globalThis.fetch = nativeFetch; }
  } catch (error) { result.textContent = 'FAIL: ' + error.message; }
})();`
  const html = '<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre><script>' + protocol + '\n' + draft + '\n' + client + '\n' + exercise + '</script>'
  const profile = mkdtempSync(join(tmpdir(), 'worldifact-native-fetch-'))
  try {
    const run = spawnSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
      '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`, '--dump-dom', '--virtual-time-budget=6000', 'data:text/html;base64,' + Buffer.from(html).toString('base64')],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 })
    assert.equal(run.status, 0, `Browser did not complete: ${run.error?.message || run.stderr.slice(-1500)}`)
    const actual = run.stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1] || 'No browser test result'
    assert.match(actual, /^PASS:/, actual)
    console.log(actual)
  } finally { rmSync(profile, { recursive: true, force: true }) }
})
