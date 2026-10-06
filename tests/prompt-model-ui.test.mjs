import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderShopMarkup, loadShopComponent } from './shop-render-helper.mjs'
import { loadCostNotice } from './shop-render-helper.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

test('historical mode cards and one visible model picker precede cost, prompt and delivery', async () => {
  const html = await renderShopMarkup()
  const modes = html.indexOf('class="shop-generation-modes"')
  const picker = html.indexOf('class="shop-model-picker"')
  const select = html.indexOf('id="studio-mode"')
  const cost = html.indexOf('aria-label="Selected model and cost for the next generation"')
  const prompt = html.indexOf('id="studio-prompt"')
  const delivery = html.indexOf('id="studio-deliverable"')
  const generate = html.indexOf('class="native-shop-generate"')
  assert.ok(modes >= 0 && picker > modes && select > picker && cost > select && prompt > cost && delivery > prompt && generate > delivery)
  assert.equal((html.match(/id="studio-mode"/g) || []).length, 1)
  assert.equal((html.match(/class="shop-generation-mode"/g) || []).length, 2)
  assert.match(html, /SLOW · QUALITY/)
  assert.match(html, /FAST · DRAFT/)
  assert.doesNotMatch(html.slice(picker, select), /\bhidden(?:=|>|\s)/)
  assert.match(html, /AI model · Model AI/)
  assert.match(html, /GPT-6 ASTRA — 250 points/)
  assert.match(html, /GPT-6\.1 SOL — 50 points/)
})
test('cost notice has readable light text on an explicit dark surface', async () => {
  const css = await readFile(new URL('../src/components/GenerationCostNotice.css', import.meta.url), 'utf8')
  function lum(hex) { const a = hex.match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return a[0]*.2126+a[1]*.7152+a[2]*.0722 }
  assert.ok((lum('f4fbff')+.05)/(lum('18333f')+.05) > 7)
  assert.match(css, /background:#18333f;color:#f4fbff/)
  assert.match(css, /max-width:1024px/)
})

test('compact funding notice keeps exact refusal and price visible with read-only availability details in native details', async () => {
  const CostNotice = (await loadCostNotice()).default
  const refusal = 'Not enough unreserved API funding for this model. No Oracle generation was submitted.'
  const accountQuote = { quote: { state: 'blocked', reason: 'PROVIDER_BUDGET_EXHAUSTED', message: refusal, points: 250, after: null }, checking: false, canRefresh: true, refresh() { throw new Error('Rendering must not refresh') } }
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(CostNotice, { model: 'astra', detailed: true, accountQuote })))
  const [visible, disclosure] = html.split('<details>')
  assert.match(visible, /Next generation: 250 points/)
  assert.match(visible, /Unreserved API funding is currently unavailable for the next generation/)
  assert.match(visible, /Reason: PROVIDER_BUDGET_EXHAUSTED/, 'The exact refusal reason stays above the closed disclosure')
  assert.doesNotMatch(visible, /No Oracle generation was submitted/)
  assert.doesNotMatch(visible, /Account funding unavailable|No eligible earlier model reservations/)
  assert.match(visible, /type="button"[^>]*>Refresh availability/)
  assert.match(disclosure, /<summary>Model details and billing<\/summary>/)
  assert.match(disclosure, /reads your current allowance; it does not check or return funding from earlier models/)
  assert.doesNotMatch(html, /Earlier models were checked|No eligible earlier model reservations|unused funding was (?:confirmed|returned)/i)
  assert.match(disclosure, /incurred or uncertain costs remain reserved/)
  assert.match(disclosure, /existing Blender worker/)
  assert.match(disclosure, /<a href="\/account\/generation-funding" target="_blank" rel="noopener noreferrer">Read-only funding details · opens in a new tab<\/a>/, 'The standalone page bypasses normal account hooks while a new tab preserves the in-memory Shop draft')
})

test('historical SLOW is the detailed default and native mode changes never submit a paid request', async () => {
  const html = await renderShopMarkup()
  assert.match(html, /<option value="detailed-mesh" selected=""/)
  assert.doesNotMatch(html, /<option value="procedural-blueprint" selected=""/)
  assert.match(html, /<button type="button" class="shop-generation-mode" aria-label="Select GPT-6 Astra, 250 points per generation" aria-pressed="true"/)
  assert.match(html, /<select id="studio-deliverable"/)

  // Execute the real restored mode handlers without mounting effects. These
  // gestures only edit a draft; neither a click nor a repeated click may POST.
  const slots = [], calls = []
  let cursor = 0
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useMemo(create) { cursor++; return create() },
    useCallback(callback) { cursor++; return callback },
    useEffect() { cursor++ },
  }
  const Shop = await loadShopComponent({ react: hooks,
    adapters: { 'react-router-dom': { useLocation: () => ({ pathname: '/shop', state: null }) } },
    globals: { fetch: (...args) => { calls.push(args); throw new Error('Mode changes must not request generation') } },
  })
  const render = () => {
    cursor = 0
    const nodes = []
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (React.isValidElement(node)) { nodes.push(node); walk(node.props.children) }
    }
    walk(Shop()); return nodes
  }
  let nodes = render()
  const byId = id => nodes.find(node => node.props.id === id)
  byId('studio-prompt').props.onChange({ target: { value: 'Keep this detailed castle draft' } })
  byId('studio-deliverable').props.onChange({ target: { value: 'procedural-blueprint' } })
  nodes = render()
  assert.equal(byId('studio-deliverable').props.value, 'procedural-blueprint')
  const slow = nodes.find(node => node.props['aria-label']?.startsWith('Select GPT-6 Astra'))
  assert.equal(slow.props.type, 'button')
  slow.props.onClick(); slow.props.onClick(); nodes = render()
  assert.equal(byId('studio-deliverable').props.value, 'detailed-mesh')
  assert.equal(byId('studio-mode').props.value, 'standard')
  assert.equal(byId('studio-prompt').props.value, 'Keep this detailed castle draft')
  const fast = nodes.find(node => node.props['aria-label']?.startsWith('Select GPT-6.1 Sol'))
  assert.equal(fast.props.type, 'button')
  assert.equal(fast.props.disabled, true, 'Unverified Sol readiness keeps FAST unavailable')
  fast.props.onClick(); nodes = render()
  assert.equal(byId('studio-mode').props.value, 'standard', 'Even a retained unavailable FAST handler cannot change the draft route')
  assert.deepEqual(calls, [])
})
