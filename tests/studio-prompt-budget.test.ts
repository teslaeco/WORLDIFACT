import test from 'node:test'
import assert from 'node:assert/strict'
import { oracleStudioPayload, validateStudioInput, type StudioInput } from '../src/lib/studioProtocol.ts'
import { studioPromptBudget, studioRequestErrorMessage } from '../src/lib/studioPromptBudget.ts'

const draft: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A regular six-wing photovoltaic structure', purpose: 'figurine', textureMaxSize: 4096, photos: [] }

test('regression: a UI-valid 3751-character draft exceeds the 5000-character Oracle payload', () => {
  const input = validateStudioInput({ ...draft, prompt: 'x'.repeat(3751) })
  const before = JSON.stringify(input)
  const budget = studioPromptBudget(input, 5000)
  assert.equal(budget.overhead, 1555)
  assert.equal(budget.total, 5306)
  assert.equal(budget.limit, 3445)
  assert.equal(budget.valid, false)
  assert.match(budget.message, /Remove at least 306/)
  assert.equal(JSON.stringify(input), before, 'Never truncate a design or mutate its submitted input')
})

test('exact effective boundary fits; one extra character is rejected', () => {
  const limit = studioPromptBudget(draft, 5000).limit!
  const exact = { ...draft, prompt: 'x'.repeat(limit) }
  assert.equal(studioPromptBudget(exact, 5000).valid, true)
  assert.equal(oracleStudioPayload('', validateStudioInput(exact)).prompt.length, 5000)
  assert.equal(studioPromptBudget({ ...exact, prompt: exact.prompt + 'x' }, 5000).valid, false)
})

test('budgets follow the actual payload for every purpose, texture and advertised limit', () => {
  for (const purpose of ['figurine', 'object', 'game', 'terrain'] as const) {
    for (const textureMaxSize of [2048, 4096, 8192] as const) {
      for (const workerLimit of [2000, 5000, 8000]) {
        const input = { ...draft, purpose, textureMaxSize }
        const budget = studioPromptBudget(input, workerLimit)
        const exact = { ...input, prompt: 'x'.repeat(budget.limit!) }
        assert.equal(studioPromptBudget(exact, workerLimit).valid, true)
        assert.ok(oracleStudioPayload('', validateStudioInput(exact)).prompt.length <= workerLimit)
        assert.equal(studioPromptBudget({ ...exact, prompt: exact.prompt + 'x' }, workerLimit).valid, false)
      }
    }
  }
})

test('unknown, invalid and insufficient worker limits fail closed without inventing capacity', () => {
  for (const limit of [undefined, null, '5000', 0, -1, NaN, Infinity, 5000.5]) {
    const budget = studioPromptBudget(draft, limit)
    assert.equal(budget.valid, false)
    assert.equal(budget.limit, null)
    assert.match(budget.message, /Refresh availability/)
  }
  assert.equal(studioPromptBudget(draft, 1557).valid, false)
  assert.match(studioPromptBudget(draft, 1557).message, /too small/)
})

test('whitespace normalization and UTF-16 counting match existing server validation', () => {
  const input = { ...draft, prompt: '  photovoltaic ☀️ 🛰️ frame  \n' }
  const budget = studioPromptBudget(input, 5000)
  assert.equal(budget.total, oracleStudioPayload('', validateStudioInput(input)).prompt.length)
  assert.equal(budget.valid, true)
  assert.equal(studioPromptBudget({ ...draft, prompt: ' \n\t ' }, 5000).valid, false)
  assert.equal(studioPromptBudget({ ...draft, prompt: 'ab' }, 5000).valid, false)
  assert.equal(studioPromptBudget({ ...draft, prompt: 'x'.repeat(4001) }, 99999).valid, false)
})

test('long draft can be shortened without changing references or mandatory output rules', () => {
  const long = { ...draft, prompt: 'x'.repeat(3751) }
  assert.equal(studioPromptBudget(long, 5000).valid, false)
  const revised = { ...long, prompt: 'Rebuild the reference as a regular hexagonal photovoltaic structure with exactly six straight radial wings.' }
  assert.equal(studioPromptBudget(revised, 5000).valid, true)
  assert.match(oracleStudioPayload('', revised).prompt, /never label a generated file safe, production-ready/)
  assert.match(oracleStudioPayload('', revised).prompt, /keep explicit physical units/)
  assert.equal(long.prompt.length, 3751)
})

test('server length rejection has actionable feedback instead of a generic try-again loop', () => {
  const message = studioRequestErrorMessage('Shorten the description: the worker accepts 5000 characters including export instructions.')
  assert.match(message, /5000-character limit/)
  assert.match(message, /counter above/)
  assert.match(message, /submit once/)
})

test('unknown errors never expose credentials, receipts, HTML or private endpoints', () => {
  const secret = 'sk-private-example-not-a-real-key'
  const message = studioRequestErrorMessage(`Provider failed at https://private.invalid/?ticket=${secret} <script>alert(1)</script>`)
  assert.doesNotMatch(message, /sk-|private\.invalid|ticket|script/)
  assert.match(message, /recover the existing job/)
})

test('recovery, rate limits and storage failures do not encourage duplicate generation', () => {
  assert.match(studioRequestErrorMessage('A job is already selected. Recover it instead of sending another paid request.'), /Recover this job/)
  assert.match(studioRequestErrorMessage('Please wait before checking or submitting again.'), /Wait a minute/)
  assert.match(studioRequestErrorMessage('The browser could not retain your receipt. No paid request was submitted.'), /do not clear browser data/)
  assert.match(studioRequestErrorMessage('This generation window requires owner access.'), /do not enter an API key/)
})
