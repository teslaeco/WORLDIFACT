import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PORTALS } from '../src/config/portals.ts'
import { foundationForPath } from '../src/config/foundations.ts'
import { REFERENCE_LINKS } from '../src/config/references.ts'
import { DEMO_EXAMPLES } from '../src/lib/demoExamples.ts'
import { PLANET_CAMPAIGN } from '../src/lib/planetCampaign.ts'
import { demoBlueprint, localSceneResult, validateGenerationResult } from '../src/lib/blueprint.ts'

test('WORLDIFACT exposes exactly five primary worlds with unique working routes', () => {
  assert.equal(PORTALS.length, 5)
  assert.equal(new Set(PORTALS.map(portal => portal.id)).size, 5)
  assert.equal(new Set(PORTALS.map(portal => portal.route)).size, 5)
  for (const portal of PORTALS) {
    assert.ok(portal.route.startsWith('/'))
    assert.ok(foundationForPath(portal.route), `missing foundation mapping for ${portal.route}`)
  }
})

test('8 Planets campaign keeps eight unique ordered stages', () => {
  assert.equal(PLANET_CAMPAIGN.length, 8)
  assert.deepEqual(PLANET_CAMPAIGN.map(planet => planet.day), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(new Set(PLANET_CAMPAIGN.map(planet => planet.name)).size, 8)
  assert.ok(PLANET_CAMPAIGN.every(planet => planet.mission.length > 10 && planet.hazard.length > 3))
})

test('three Game Lab examples generate distinct validated no-cost DEMO scenes', () => {
  assert.equal(DEMO_EXAMPLES.length, 3)
  const biomes = new Set<string>()
  for (const example of DEMO_EXAMPLES) {
    const result = localSceneResult(demoBlueprint(example.prompt))
    const validated = validateGenerationResult(result)
    assert.equal(validated.mode, 'DEMO')
    assert.equal(validated.provenance, 'MOCK')
    assert.equal(validated.model, null)
    assert.equal(validated.blueprint.biome, example.expectedBiome)
    assert.equal(validated.assetSpec?.make.validationStatus, 'validation-required')
    assert.ok(validated.blueprint.objects.length >= 4)
    biomes.add(validated.blueprint.biome)
  }
  assert.deepEqual([...biomes].sort(), ['lunar', 'ocean', 'valley'])
})

test('external reference tabs use explicit HTTPS destinations', () => {
  for (const [name, value] of Object.entries(REFERENCE_LINKS)) {
    const url = new URL(value)
    assert.equal(url.protocol, 'https:', `${name} must use HTTPS`)
    assert.ok(url.hostname.length > 3)
  }
  assert.match(REFERENCE_LINKS.gameLabPublic, /forge-studio-public/)
  assert.match(REFERENCE_LINKS.shopLegacy, /forge-studio-public/)
  assert.match(REFERENCE_LINKS.planetsOriginal, /forge-world-builder/)
})

test('Enchanted AI Shop is native, preview-first and wired for real Oracle GLB jobs', async () => {
  const portalPage = await readFile(new URL('../src/pages/PortalPage.tsx', import.meta.url), 'utf8')
  const studio = await readFile(new URL('../src/components/P0GameLab.tsx', import.meta.url), 'utf8')
  const preview = await readFile(new URL('../src/components/OracleModelPreview.tsx', import.meta.url), 'utf8')
  assert.match(portalPage, /nativeShop \? <P0GameLab surface="shop" \/>/)
  assert.match(studio, /Generate DEMO concept · no download/)
  assert.match(studio, /Legacy Forge Studio · brief export only/)
  assert.match(studio, /Generate REAL 3D model · Astra \+ Blender/)
  assert.match(studio, /fetch\('\/api\/oracle\/jobs'/)
  assert.match(studio, /fetch\(`\/api\/oracle\/jobs\/\$\{id\}`/)
  assert.match(studio, /fetch\(`\/api\/oracle\/jobs\/\$\{id\}\/model`/)
  assert.match(studio, /Download REAL generated GLB/)
  assert.match(studio, /MAKE · BLOCKED \/ VALIDATION REQUIRED/)
  assert.match(preview, /GLTFLoader/)
  assert.match(preview, /GENERATED-UNREVIEWED/)
})