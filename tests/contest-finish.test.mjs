import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { ORACLE_WORLD_IDS } from '../server/platform.ts'
import { handle } from '../server/worker.ts'

const post = body => new Request('https://worldifact.test/api/blueprint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://worldifact.test' },
  body: JSON.stringify(body),
})

test('all five WORLDIFACT portal IDs share the validated blueprint endpoint', async () => {
  assert.deepEqual([...ORACLE_WORLD_IDS], [
    'chess-cube-512-ai',
    'terra-fix-iss',
    '8-planets-in-8-days',
    'enchanted-ai-shop',
    'ai-game-lab',
  ])
  for (const worldId of ORACLE_WORLD_IDS) {
    const response = await handle(post({ worldId, prompt: 'Create a small portal-specific test scene.', mode: 'demo' }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.mode, 'DEMO')
    assert.equal(body.provenance, 'MOCK')
    assert.equal(body.assetSpec.make.validationStatus, 'validation-required')
  }
})

test('unknown portal IDs fail before any provider call', async () => {
  let calls = 0
  const response = await handle(post({ worldId: 'sixth-secret-world', prompt: 'Create something.', mode: 'live' }), {}, (async () => { calls++; throw new Error('network must not run') }))
  assert.equal(response.status, 400)
  assert.equal(calls, 0)
  assert.match((await response.json()).error, /five supported WORLDIFACT portal IDs/i)
})

test('portal UI labels LIVE and DEMO truthfully, stays usable when LIVE is gated and exposes no server secrets', async () => {
  const source = await readFile(new URL('../src/components/PortalAstraGenerator.tsx', import.meta.url), 'utf8')
  assert.match(source, /LIVE · GENERATED/)
  assert.match(source, /DEMO · MOCK/)
  assert.match(source, /MAKE: VALIDATION REQUIRED/)
  assert.match(source, /\/api\/blueprint/)
  assert.match(source, /Generate DEMO · no API cost/)
  assert.match(source, /onClick=\{generatePrimary\}/)
  assert.doesNotMatch(source, /disabled=\{busy \|\| !health\.generationReady\}/)
  assert.doesNotMatch(source, /OPENAI_API_KEY|ORACLE_API_TOKEN|CLOUDFLARE_API_TOKEN/)
})

test('Game Lab primary generation action falls back to labelled no-cost DEMO instead of dead-ending', async () => {
  const source = await readFile(new URL('../src/components/P0GameLab.tsx', import.meta.url), 'utf8')
  assert.match(source, /Generate DEMO world · no API cost/)
  assert.match(source, /onClick=\{generatePrimary\}/)
  assert.doesNotMatch(source, /disabled=\{busy \|\| !health\.generationReady\}/)
})

test('contest portal generators are expanded by default for immediate review', async () => {
  const source = await readFile(new URL('../src/pages/PortalPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /<details open className="portal-generator-drawer portal-page">/)
  assert.match(source, /<details open className="portal-generator-drawer">/)
})

test('Fix ISS reuses Terra Observation NASA GIBS Earth source and preserves attribution', async () => {
  const earth = await readFile(new URL('../public/apps/iss/terra-earth.js', import.meta.url), 'utf8')
  const geometry = await readFile(new URL('../public/apps/iss/geometry.js', import.meta.url), 'utf8')
  const licences = await readFile(new URL('../ASSET_LICENSES.md', import.meta.url), 'utf8')
  assert.match(earth, /c91d59eafb87cf9657f8bf78a5e431fb35665849/)
  assert.match(earth, /BlueMarble_ShadedRelief_Bathymetry/)
  assert.match(earth, /VIIRS_SNPP_CorrectedReflectance_TrueColor/)
  assert.match(earth, /gibs\.earthdata\.nasa\.gov/)
  assert.match(geometry, /makeTerraObservationEarth/)
  assert.match(licences, /MIT License/)
  assert.match(licences, /visual backdrop/i)
  assert.match(licences, /not labelled as live scientific observation evidence/i)
})

test('ISS launch copy says sales are coming soon and frames preservation as a simulation concept', async () => {
  const source = await readFile(new URL('../src/pages/PortalPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /Sales starting soon/)
  assert.match(source, /repair simulation created to explore the idea/i)
  assert.match(source, /not NASA endorsement/i)
  assert.match(source, /not proof that preserving the complete station in orbit is technically feasible/i)
  assert.match(source, /We plan to allocate part of future sales revenue/i)
  assert.match(source, /https:\/\/c\.org\/QkbzHd5kWN/)
  assert.doesNotMatch(source, /we donate|we are donating|guaranteed percentage/i)
})

test('Astra portal instructions keep MAKE validation-required instead of claiming production readiness', async () => {
  const source = await readFile(new URL('../server/worker.ts', import.meta.url), 'utf8')
  assert.match(source, /MAKE is always validation-required/)
  assert.match(source, /never a quote, order, production-ready file or manufacturing approval/)
  assert.match(source, /gpt-6-astra/)
  assert.match(source, /api\.openai\.com\/v1\/responses/)
})
