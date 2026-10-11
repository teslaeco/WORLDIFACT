import test from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { STUDIO_READBACK_EXAMPLE, STUDIO_READBACK_GUIDE } from '../src/lib/studioReadbackGuide.ts'
import { oracleStudioPayload, validateStudioInput, studioPendingPointsDetail } from '../src/lib/studioProtocol.ts'

test('readback example uses a valid bounded summary call and retains exact geometry outside printed history', async () => {
  const scene = { parts: [{ name: 'Original 🟢 object', coordinates: [1, 2, 3] }] }
  const snapshot = { revision: 2, scene, edits: 'original edit', report: { errors: ['Never conceal this'] }, completion_contract: { structural_passed: false }, inspected_views: ['front'], sections: { scene: { inline: true, sha256: 'a'.repeat(64) }, edits: { inline: true } } }
  const stored = new Map(), output: unknown[] = [], calls: unknown[] = []
  await runInNewContext(`(async()=>{${STUDIO_READBACK_EXAMPLE}})()`, { revision: 2,
    tools: { mcp__blender__get_current_model: async (args: unknown) => { calls.push(JSON.parse(JSON.stringify(args))); return { content: [{ type: 'text', text: JSON.stringify(snapshot) }] } } },
    store: (key: string, value: unknown) => stored.set(key, value), text: (value: unknown) => output.push(value) })
  assert.deepEqual(calls, [{ section: 'summary', expected_revision: 2 }])
  assert.deepEqual(JSON.parse(JSON.stringify(stored.get('current_model'))), snapshot)
  const printed = JSON.parse(JSON.stringify(output[0]))
  assert.equal(printed.scene, null); assert.equal(printed.edits, null)
  assert.deepEqual(printed.report, snapshot.report); assert.deepEqual(printed.completion_contract, snapshot.completion_contract)
  assert.deepEqual(printed.inspected_views, snapshot.inspected_views)
  assert.equal(printed.sections.scene.sha256, snapshot.sections.scene.sha256)
})
test('readback example preserves tool errors and never prints false success or invokes more tools', async () => {
  const failure = { isError: true, content: [{ type: 'text', text: 'fixture revision conflict' }] }, output: unknown[] = []
  await assert.rejects(runInNewContext(`(async()=>{${STUDIO_READBACK_EXAMPLE}})()`, { revision: 2,
    tools: { mcp__blender__get_current_model: async () => failure }, store: () => assert.fail('must not store error as model'), text: (value: unknown) => output.push(value) }), /read failed/)
  assert.deepEqual(output, [failure])
})
test('corrected guidance reaches text and reference jobs with original inputs and safety obligations intact', () => {
  const dataUrl = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  for (const photos of [[], [{ name: 'fixture.jpg', view: 'detail' as const, dataUrl, subject: 'Synthetic transformer reference', textureMaxSize: 2048 }]]) {
    const input = validateStudioInput({ worldId: 'enchanted-ai-shop', prompt: 'An industrial transformer as a digital model', purpose: 'object', textureMaxSize: 2048, photos })
    const before = JSON.stringify(input), wire = oracleStudioPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', input)
    assert.ok('agentInstructions' in wire && wire.agentInstructions.endsWith(STUDIO_READBACK_GUIDE))
    assert.match(wire.agentInstructions, /USD 1\.75 guard/); assert.match(wire.agentInstructions, /finish_model/)
    assert.match(wire.agentInstructions, /1 to 16000 inclusive/)
    assert.equal(JSON.stringify(input), before)
    if (photos.length) assert.equal(wire.photos?.[0].dataUrl, dataUrl)
  }
})
test('known failure reason remains visible while held points are explicitly unresolved', () => {
  for (const code of ['MODEL_BUDGET_EXCEEDED', 'ASTRA_COST_LIMIT'] as const) {
    const text = studioPendingPointsDetail(250, code)
    assert.match(text, /provider budget stopped/); assert.match(text, /250 points remain held/)
    assert.doesNotMatch(text, /points were released|refunded|completed successfully/)
  }
  assert.match(studioPendingPointsDetail(250, 'ORACLE_JOB_MISSING'), /missing record does not establish zero/)
})
