import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadProgressOrb } from './shop-render-helper.mjs'
import { JOB_DETAILS } from '../src/lib/studioProtocol.ts'

const Orb = (await loadProgressOrb()).default
const job = state => ({ id: 'selected-job', state, detail: JOB_DETAILS[state] })
const render = props => renderToStaticMarkup(React.createElement(Orb, props))

test('actual orb labels its numeric stage estimate prominently and keeps elapsed time separate', () => {
  const html = render({ job: job('building'), trackedSeconds: 127 })
  assert.match(html, /role="progressbar"/)
  assert.match(html, /aria-valuenow="50"/)
  assert.match(html, /Estimated stage progress/)
  assert.match(html, /not processing or time completed/)
  assert.match(html, /stroke-dasharray:50 50/)
  assert.match(html, />50<span>%<\/span>/)
  assert.match(html, /Elapsed <strong>2:07<\/strong>/)
  assert.match(html, /includes upload and waiting/)
  assert.match(html, /not recorded worker generation time/)
  assert.match(html, /polyhedron-led-poster\.svg/)
})

test('success percentage requires same-job validation and saved evidence', () => {
  const pending = render({ job: job('succeeded') })
  assert.match(pending, /aria-valuenow="75"/)
  assert.match(pending, /3 OF 4 CONFIRMED MILESTONES/)
  assert.doesNotMatch(pending, /aria-valuenow="100"/)
  const complete = render({ job: job('succeeded'), artifact: { jobId: 'selected-job', validated: true, saved: true }, compact: true })
  assert.match(complete, /aria-valuenow="100"/)
  assert.match(complete, /Model saved/)
  assert.match(complete, /visual review needed/)
})

test('failed and unknown statuses never become complete from elapsed time', () => {
  for (const selected of [job('failed'), { ...job('succeeded'), reconciliationRequired: true }]) {
    const html = render({ job: selected, trackedSeconds: 86400 })
    assert.doesNotMatch(html, /aria-valuenow=/)
    assert.match(html, /data-motion="false"/)
    assert.doesNotMatch(html, /Pause animation/)
  }
})


test('visual-only progress has the same accessible admission distinction as the surrounding status', () => {
  const refused = render({ job: { ...job('failed'), failureCode: 'PROVIDER_BUDGET_EXHAUSTED' }, visualOnly: true })
  assert.match(refused, /aria-label="Generation was not started"/)
  assert.doesNotMatch(refused, /Model did not finish/)
  const missing = render({ job: { ...job('failed'), failureCode: 'MISSING_SUBMISSION' }, visualOnly: true })
  assert.match(missing, /aria-label="The upload was not confirmed"/)
})


test('pending requests remain indeterminate even after a long wait', () => {
  const html = render({ job: job('pending'), trackedSeconds: 86400 })
  assert.doesNotMatch(html, /aria-valuenow=/)
  assert.doesNotMatch(html, /Estimated stage progress|[0-9]<span>%/)
  assert.match(html, /No numeric completion estimate is available/)
  assert.match(html, /Awaiting confirmation/)
})
