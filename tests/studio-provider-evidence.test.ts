import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStudioProviderEvidence, STUDIO_PROVIDER_EVIDENCE_REVISION } from '../src/lib/studioProviderEvidence.ts'

const selections = [
  ['astra','gpt-6-astra'],
  ['sol','gpt-6.1-sol'],
  ['luna','gpt-6-luna'],
] as const
for (const [model, providerModel] of selections) {
  for (const mode of ['standard','fast'] as const) {
    test(`Oracle evidence distinguishes selected ${model}/${mode} from authenticated provider receipt`, () => {
      const selection = { revision: 'studio-execution-v1', model, mode }
      const correct = { revision: STUDIO_PROVIDER_EVIDENCE_REVISION, model: providerModel,
        mode, source: 'oracle-terminal-budget' }
      assert.equal(isStudioProviderEvidence(correct, selection), true)
      for (const wrong of [
        { ...correct, model: model==='luna'?'gpt-6.1-sol':'gpt-6-luna' },
        { ...correct, mode: mode==='standard'?'fast':'standard' },
        { ...correct, source: 'user-dropdown' },
        { ...correct, source: 'oracle-terminal-budget', forged: true },
        { ...correct, revision: 'untrusted' },
        { ...correct, model: null },
        { ...correct, mode: undefined },
        null,[],{},'gpt-6-astra',
      ]) assert.equal(isStudioProviderEvidence(wrong, selection), false)
      assert.equal(isStudioProviderEvidence(correct, undefined), false)
    })
  }
}
