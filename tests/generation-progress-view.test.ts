import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTrackedElapsed, generationProgressView } from '../src/lib/generationProgressView.ts'
import { JOB_DETAILS, type StudioJob } from '../src/lib/studioProtocol.ts'

const job = (state: StudioJob['state']): StudioJob => ({ id: 'selected-job', state, detail: JOB_DETAILS[state] })

test('only confirmed milestones set estimated progress, independent of elapsed time', () => {
  for (const state of ['pending', 'queued', 'generating', 'retrying', 'building'] as const) {
    for (const trackedSeconds of [0, 7, 60, 3600, 86400]) {
      const view = generationProgressView({ job: job(state), trackedSeconds })
      assert.equal(view.percent, state === 'pending' ? null : state === 'queued' ? 25 : 50)
      assert.equal(view.kind, 'active')
      assert.equal(view.detail, JOB_DETAILS[state])
    }
  }
})

test('worker succeeded is insufficient for 100%; require same validated saved artifact', () => {
  for (const artifact of [undefined, { jobId: 'selected-job', validated: false, saved: true }, { jobId: 'selected-job', validated: true, saved: false }, { jobId: 'previous-job', validated: true, saved: true }]) {
    const view = generationProgressView({ job: job('succeeded'), artifact })
    assert.equal(view.percent, 75)
    assert.equal(view.kind, 'review')
  }
  const view = generationProgressView({ job: job('succeeded'), artifact: { jobId: 'selected-job', validated: true, saved: true } })
  assert.equal(view.percent, 100)
  assert.equal(view.kind, 'complete')
  assert.match(view.detail, /manufacturing is not approved/)
})

test('failed, cancelled and reconciliation states cannot show successful progress', () => {
  const artifact = { jobId: 'selected-job', validated: true, saved: true }
  for (const state of ['failed', 'cancelled'] as const) {
    const view = generationProgressView({ job: job(state), artifact })
    assert.equal(view.kind, 'failed')
    assert.equal(view.percent, null)
  }
  const review = generationProgressView({ job: { ...job('succeeded'), reconciliationRequired: true }, artifact })
  assert.equal(review.percent, null)
  assert.equal(review.kind, 'review')
})

test('restricted downloads do not claim that browser validation or saving happened', () => {
  const view = generationProgressView({ job: { ...job('succeeded'), downloadAllowed: false } })
  assert.equal(view.percent, 75)
  assert.equal(view.stage, 'Access required')
})

test('elapsed formatting rejects bad values and does not wrap hours', () => {
  assert.equal(formatTrackedElapsed(0), '0:00')
  assert.equal(formatTrackedElapsed(61.9), '1:01')
  assert.equal(formatTrackedElapsed(3601), '1:00:01')
  assert.equal(formatTrackedElapsed(86400), '24:00:00')
  for (const seconds of [undefined, -1, NaN, Infinity, Number.MAX_VALUE]) assert.equal(formatTrackedElapsed(seconds), null)
})

test('the next-generation availability has no input into a saved request’s progress', () => {
  const view = generationProgressView({ job: job('building'), trackedSeconds: 72 })
  assert.equal(view.stage, 'Building or exporting')
  assert.equal(view.elapsed, '1:12')
  assert.equal(generationProgressView({ job: null }).kind, 'idle')
})


test('admission refusals and missing submissions do not claim generation started', () => {
  const refused = generationProgressView({ job: { ...job('failed'), failureCode: 'PROVIDER_BUDGET_EXHAUSTED' } })
  assert.equal(refused.title, 'Generation was not started')
  assert.equal(refused.percent, null)
  const missing = generationProgressView({ job: { ...job('failed'), failureCode: 'MISSING_SUBMISSION' } })
  assert.equal(missing.title, 'The upload was not confirmed')
  assert.equal(missing.kind, 'review')
})


test('stage estimates follow retries and backward states without smoothing or a remembered maximum', () => {
  const sequence = ['queued', 'generating', 'building', 'retrying', 'queued', 'pending', 'succeeded', 'failed'] as const
  assert.deepEqual(sequence.map(state => generationProgressView({ job: job(state), trackedSeconds: 86400 }).percent), [25, 50, 50, 50, 25, null, 75, null])
  assert.equal(generationProgressView({ job: null, trackedSeconds: 86400 }).percent, null)
})
