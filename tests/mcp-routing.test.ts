import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { handle } from '../server/worker.ts'
import { buildLiveGenerationConfig } from '../scripts/build-live-generation-config.ts'
const base = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))

test('MCP discovery reaches the Worker in both disabled base and live release routing', async () => {
  const live = buildLiveGenerationConfig(base)
  for (const config of [base, live]) {
    const rules: string[] = config.assets.run_worker_first
    for (const path of ['/mcp', '/mcp/oauth-protected-resource', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server', '/oauth/authorize', '/oauth/token']) {
      assert.ok(rules.some(rule => rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : rule === path), `${path} must bypass SPA assets`)
      let assetReads = 0
      const response = await handle(new Request('https://worldifact.test' + path, { headers: { 'Sec-Fetch-Mode': 'navigate' } }), {
        ASSETS: { async fetch() { assetReads++; return new Response('<html>SPA fallback</html>') } },
      }, (async () => { throw new Error('No external calls allowed') }) as typeof fetch)
      assert.match(response.headers.get('content-type') || '', /application\/json/)
      assert.equal(assetReads, 0)
      assert.notEqual(response.status, 200, 'unconfigured OAuth is not a ready connection')
    }
  }
})
