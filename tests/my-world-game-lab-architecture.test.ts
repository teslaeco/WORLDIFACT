import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { FOUNDATIONS } from '../src/config/foundations.ts'
import { PORTALS } from '../src/config/portals.ts'
import { blankWorld, validatePrivateWorld } from '../src/lib/privateWorld.ts'
import { DEFAULT_GAME_TUNING } from '../src/lib/gameLabTuning.ts'

const file = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('all existing six foundations and five central 3D portal IDs remain intact', () => {
  assert.deepEqual(FOUNDATIONS.map(item => item.route), ['/chess','/iss','/planets','/shop','/lab','/terra'])
  assert.deepEqual(PORTALS.map(item => item.route), ['/chess','/iss','/planets','/shop','/lab'])
})
test('new playtest is only at Game Lab; legacy builder points to My World', () => {
  const routes = file('src/App.tsx'),workbench=file('src/pages/WorkbenchPage.tsx')
  assert.match(routes, /path="\/lab" element={<GameLabPlaytest \/>}/)
  assert.match(routes, /path="\/account\/worlds" element={<PrivateGameLab \/>}/)
  assert.match(workbench, /<Navigate to="\/account\/worlds" replace \/>/)
})
test('AI Shop creates assets, not a second embedded world generator', () => {
  const portal=file('src/pages/PortalPage.tsx'),shop=file('src/pages/ShopPage.tsx')
  assert.match(portal, /if \(app.route === '\/shop'\) return <ShopPage \/>/)
  assert.doesNotMatch(portal, /worldId="enchanted-ai-shop"/)
  assert.match(shop, /Open My World/)
  assert.match(portal, /Continue to experimental game/)
})
test('My World owns world generation and only Game Lab owns game packaging', () => {
  const world=file('src/pages/PrivateGameLab.tsx'),lab=file('src/pages/GameLabPlaytest.tsx')
  assert.match(world, /<SceneBlueprints onApplyBlueprint={addBlueprintToWorld}/)
  assert.match(world, /Save &amp; test in Game Lab/)
  assert.match(lab, /BLOCKED until that pipeline is tested/)
  assert.match(lab, /Windows \.exe · PLANNED/)
  assert.match(lab, /Android \.apk · PLANNED/)
})
test('gameplay settings survive server-side private world schema validation', () => {
  const original=blankWorld('Playtest')
  const saved=validatePrivateWorld({ ...original, gameplay: { ...DEFAULT_GAME_TUNING, vehicleMode:true, speedKmh:180 } })
  assert.equal(saved.gameplay?.speedKmh,180)
  assert.deepEqual(validatePrivateWorld(saved),saved)
  assert.throws(()=>validatePrivateWorld({ ...original, gameplay:{...DEFAULT_GAME_TUNING,speedKmh:1000} }))
})
