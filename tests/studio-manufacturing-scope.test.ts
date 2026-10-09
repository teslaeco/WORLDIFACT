import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oracleStudioPayload, validateStudioInput, inputDigest, prepareStudioInput, FAST_DRAFT_PROFILE } from '../src/lib/studioProtocol.ts'
import type { StudioInput } from '../src/lib/studioProtocol.ts'
import { STUDIO_PRICING, STUDIO_PRICING_REVISION } from '../src/lib/studioPricing.ts'

const id = '33333333-3333-4333-8333-333333333333'
const base: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'Create a textured globe with continents and oceans.', purpose: 'game', textureMaxSize: 4096, photos: [] }
function payload(input: StudioInput) { return oracleStudioPayload(id, validateStudioInput(input)) }
function instructions(input: StudioInput) {
  const value = payload(input)
  return 'agentInstructions' in value ? value.agentInstructions : value.prompt
}
const physicalConstraints = /1\.5 mm walls|practical splits, keyed joints|cannot survive the intended process/

test('a visual globe, terrain, object and default figurine do not inherit fabrication requirements', () => {
  for (const worldId of ['enchanted-ai-shop', 'ai-game-lab'] as const) {
    for (const purpose of ['game', 'terrain', 'object', 'figurine'] as const) {
      const input = { ...base, worldId, purpose }
      assert.doesNotMatch(instructions(input), physicalConstraints)
      assert.match(instructions(input), /never label.*manufactur.*approved/i)
      assert.match(instructions(input), /preserve.*units.*dimensions/i)
      assert.doesNotMatch(payload(input).prompt, /report open\/non-manifold geometry|thin walls and fragile joints/)
      assert.match(instructions(input), /finish_model/)
      assert.match(instructions(input), /USD 1\.75 guard/)
    }
  }
})

test('explicit fabrication requests retain the full physical rules independently of model-kind labels', () => {
  for (const prompt of [
    'Create a figurine for 3D printing.', 'Prepare a globe for resin printing.',
    'Make a watertight 3D-printable chess piece.', 'Create a bracket for CNC machining.',
    'Design this panel for laser cutting.', 'Create a printable chess knight.', 'Output: MAKE, a miniature vase.', 'Zaprojektuj figurkę do druku 3D.',
    'Przygotuj element do frezowania CNC.', 'Panel do cięcia laserowego.',
  ]) {
    for (const purpose of ['figurine', 'object', 'game'] as const) {
      assert.match(instructions({ ...base, prompt, purpose }), physicalConstraints, prompt)
      assert.match(instructions({ ...base, prompt, purpose }), /never label.*manufactur.*approved/i)
    }
  }
})

test('English make is not the MAKE output path and explicit no-print requests are not fabricated', () => {
  for (const prompt of [
    'Make a realistic globe.', 'A 3D model of a printing press for a game.',
    'A realistic resin-looking glass ornament.', 'Create a 3D model of a laser scanner.',
    'Game only, not for 3D printing.', 'Not 3D-printable: a visual particle cloud.', 'Not printable: a game-only visual effect.',
    'Do not prepare this for resin printing.', 'No CNC machining; this is a game prop.',
    'Nie do druku 3D, tylko model do gry.', 'Bez frezowania CNC, wyłącznie wizualizacja.',
  ]) assert.doesNotMatch(instructions({ ...base, prompt }), physicalConstraints, prompt)
})

test('scoping changes neither original input, receipt digest, references, nor price terms', async () => {
  const image = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  const input = validateStudioInput({ ...base, purpose: 'object', photos: [{ name: 'surface.jpg', view: 'front', dataUrl: image, textureMaxSize: 4096 }] })
  const before = JSON.stringify(input), digest = await inputDigest(input)
  const wire = payload(input)
  assert.ok('agentInstructions' in wire)
  assert.ok(wire.prompt.startsWith(input.prompt + '\n\n'))
  assert.deepEqual(wire.photos, input.photos)
  assert.equal(wire.id, id)
  assert.equal('studioPricing' in wire, false)
  assert.equal(JSON.stringify(input), before)
  assert.equal(await inputDigest(input), digest)
  assert.equal((await prepareStudioInput(input)).inputDigest, digest)
  assert.match(wire.agentInstructions, /REFERENCE-FIDELITY MODE/)
  for (const budgetTier of ['standard', 'extended'] as const) {
    const selected = payload({ ...input, pricingRevision: STUDIO_PRICING_REVISION, budgetTier, acceptedPoints: STUDIO_PRICING[budgetTier].points })
    assert.ok('studioPricing' in selected)
    assert.deepEqual(selected.studioPricing, STUDIO_PRICING[budgetTier])
  }
})

test('FAST keeps the existing profile and limits without imposing physical fabrication on a visual draft', () => {
  const input = { ...base, purpose: 'object' as const, textureMaxSize: 2048 as const, generationProfile: FAST_DRAFT_PROFILE }
  const wire = payload(input)
  assert.equal(wire.generationProfile, FAST_DRAFT_PROFILE)
  assert.doesNotMatch(wire.prompt, physicalConstraints)
  assert.match(wire.prompt, /UNREVIEWED/)
  assert.match(instructions({ ...input, prompt: 'Create a part for 3D printing.' }), physicalConstraints)
})
