import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APPROVAL, APPROVAL_ENV, CAP_USD, CHARACTER_PROMPT, JOB_ID, buildInput } from '../scripts/approved-terraforming-heroine-test.mjs'

test('approved heroine job is one fixed bounded Astra character request',()=>{
  assert.equal(APPROVAL,'worldifact-terraforming-heroine-20261001-once')
  assert.equal(APPROVAL_ENV,'ASTRA175_TERRAFORMING_HEROINE_ONCE')
  assert.match(JOB_ID,/^[a-f0-9-]{36}$/)
  assert.equal(CAP_USD,1.75)
  const input=buildInput()
  assert.equal(input.worldId,'ai-game-lab')
  assert.equal(input.purpose,'game')
  assert.equal(input.textureMaxSize,8192)
  assert.deepEqual(input.photos,[])
  assert.equal(input.prompt,CHARACTER_PROMPT)
  assert.ok(input.prompt.length>=2000&&input.prompt.length<=4000)
  assert.match(input.prompt,/Remove the glowing orb/i)
  assert.match(input.prompt,/full-body adult female sci-fi heroine/i)
  assert.match(input.prompt,/GLB/)
  assert.doesNotMatch(input.prompt,/manufacturing-approved/i)
})
