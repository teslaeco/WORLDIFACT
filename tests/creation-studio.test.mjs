import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadCreationProgress, renderShopMarkup } from './shop-render-helper.mjs'

test('unknown provider progress remains indeterminate; confirmed stages are explicitly labelled', async () => {
  const { default: Progress } = await loadCreationProgress()
  const waiting = renderToStaticMarkup(React.createElement(Progress, { active: true, label: 'Creating your image' }))
  assert.match(waiting, /role="progressbar"/)
  assert.doesNotMatch(waiting, /aria-valuenow=/)
  assert.match(waiting, /completion percentage is unavailable/)
  const stages = renderToStaticMarkup(React.createElement(Progress, { active: true, label: 'Building your 3D model', percent: 50 }))
  assert.match(stages, /aria-valuenow="50"/)
  assert.match(stages, /not time remaining/)
  const idle = renderToStaticMarkup(React.createElement(Progress))
  assert.doesNotMatch(idle, /role="progressbar"|aria-valuenow=/)
})

test('preview precedes prompt in DOM; models and four-reference input are outside advanced settings', async () => {
  const html = await renderShopMarkup()
  const preview = html.indexOf('class="native-shop-preview"')
  const prompt = html.indexOf('id="studio-prompt"')
  const model = html.indexOf('id="studio-mode"')
  const photos = html.indexOf('id="studio-photos"')
  const settings = html.indexOf('class="shop-settings"')
  assert.ok(preview >= 0 && preview < prompt && prompt < model && model < photos && photos < settings)
  assert.match(html, /Interface style/)
  assert.match(html, /type="range" min="0" max="100" step="50"/)
  assert.match(html, /Up to 4 images/)
  assert.match(html, /\/account\/images/)
})
