import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PORTALS } from '../src/config/portals.ts'
import { REFERENCE_LINKS } from '../src/config/references.ts'

const sourceUrl = new URL('../src/pages/ShopPage.tsx', import.meta.url)
const cssUrl = new URL('../src/pages/ShopPage.css', import.meta.url)
const expectedUrl = 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/'

// Compile and render the checked-in TSX. A minimal hook adapter lets tests call
// its real reload handler; this is not browser, cookie or generation evidence.
async function shopHarness(confirm = () => false) {
  const source = await readFile(sourceUrl, 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(sourceUrl),
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const localRequire = createRequire(sourceUrl)
  const jsxRuntime = localRequire('react/jsx-runtime')
  const module = { exports: {} }, state = [], effects = []
  let cursor = 0, nodes = []
  const browser = new Proxy({ confirm }, {
    get(target, property) {
      if (property === 'confirm') return target.confirm
      throw new Error(`Unexpected browser access: ${String(property)}`)
    },
  })
  const capture = fn => (type, props, key) => {
    nodes.push({ type, props, key })
    return fn(type, props, key)
  }
  runInNewContext(compiled, {
    module, exports: module.exports, window: browser,
    require(id) {
      if (id === '../config/portals') return { PORTALS }
      if (id === '../config/references') return { REFERENCE_LINKS }
      if (id === './ShopPage.css') return {}
      if (id === 'react') return {
        ...React,
        useEffect: effect => effects.push(effect),
        useState(initial) {
          const index = cursor++
          if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
        },
      }
      if (id === 'react/jsx-runtime') return { ...jsxRuntime, jsx: capture(jsxRuntime.jsx), jsxs: capture(jsxRuntime.jsxs) }
      if (id === 'react-router-dom') return localRequire(id)
      throw new Error(`Unreviewed Shop dependency: ${id}`)
    },
  }, { filename: fileURLToPath(sourceUrl), timeout: 1000 })
  return {
    render() {
      cursor = 0; nodes = []
      const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/shop'] }, React.createElement(module.exports.default)))
      return {
        html, effects,
        frame: nodes.find(node => node.type === 'iframe'),
        reload: nodes.find(node => node.props?.['data-testid'] === 'reload-studio').props.onClick,
      }
    },
  }
}

test('Shop keeps the exact Studio inside the page with a return link outside and before its frame', async () => {
  const { html, frame } = (await shopHarness()).render()
  assert.equal((html.match(/<iframe\b/g) || []).length, 1)
  assert.equal(frame.props.src, expectedUrl)
  assert.match(html, /<a[^>]*data-testid="return-to-worldifact"[^>]*href="\/"/)
  assert.ok(html.indexOf('return-to-worldifact') < html.indexOf('<iframe'))
  assert.ok(html.indexOf('</header>') < html.indexOf('<iframe'))
  assert.match(frame.props.title, /3D model generator/)
  assert.match(html, /WORLDIFACT stays open here/)
})

test('sign-in fallback opens only a separate safe tab and cannot replace WORLDIFACT', async () => {
  const { html } = (await shopHarness()).render()
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0])
  const external = links.filter(link => /href="https:\/\//.test(link))
  assert.equal(external.length, 1)
  assert.ok(external[0].includes(`href="${expectedUrl}"`))
  assert.match(external[0], /target="_blank"/)
  assert.match(external[0], /rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /target="_(top|parent|self)"/)
  assert.match(html, /does not guarantee that your browser will share its session/)
})

test('embedded Studio cannot navigate the host; normal app and user-initiated storage features remain allowed', async () => {
  const { frame } = (await shopHarness()).render()
  const sandbox = new Set(frame.props.sandbox.split(/\s+/))
  for (const permission of ['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-downloads', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-storage-access-by-user-activation']) assert.ok(sandbox.has(permission))
  assert.ok(![...sandbox].some(value => value.startsWith('allow-top-navigation')))
  assert.equal(frame.props.credentialless, undefined)
  assert.equal(frame.props.srcDoc, undefined)
  assert.equal(frame.props.referrerPolicy, 'no-referrer')
  assert.doesNotMatch(frame.props.allow, /camera|geolocation|payment/)
})

test('render/re-render neither navigates nor changes a running frame or claims authentication success', async () => {
  const harness = await shopHarness(() => { throw new Error('Unexpected reload dialog') })
  const first = harness.render(), second = harness.render()
  assert.equal(first.frame.key, second.frame.key)
  assert.equal(first.frame.props.src, second.frame.props.src)
  assert.equal(first.effects.length, 0)
  assert.equal(first.frame.props.onLoad, undefined)
  assert.equal(first.frame.props.onError, undefined)
  assert.doesNotMatch(first.html, /CONNECTED|LIVE VERIFIED|Opening the original generator in the full browser window/)
})

test('cancelling reload preserves the same frame and unsent work', async () => {
  let prompts = 0
  const harness = await shopHarness(message => {
    prompts++
    assert.match(message, /Unsent text or selected photos/)
    return false
  })
  const first = harness.render()
  first.reload()
  assert.equal(harness.render().frame.key, first.frame.key)
  assert.equal(prompts, 1)
})

test('confirmed reload replaces only the frame, keeping the exact destination and return link', async () => {
  let prompts = 0
  const harness = await shopHarness(() => { prompts++; return true })
  const first = harness.render()
  first.reload()
  const after = harness.render()
  assert.notEqual(after.frame.key, first.frame.key)
  assert.equal(harness.render().frame.key, after.frame.key)
  assert.equal(after.frame.props.src, expectedUrl)
  assert.match(after.html, /Back to WORLDIFACT/)
  assert.equal(prompts, 1)
})

test('all five world links and explicit model-review boundaries remain available', async () => {
  const { html } = (await shopHarness()).render()
  for (const portal of PORTALS) assert.ok(html.includes(`href="${portal.route}"`))
  assert.match(html, /External tool/)
  assert.match(html, /MAKE\/manufacturing approval is separate/)
  assert.doesNotMatch(html, /forge-studio-public|FORGE-projekt|3D result appears here/)
})

test('wrapper has no native generation, credential transfer, navigation effect or automatic reload', async () => {
  const source = await readFile(sourceUrl, 'utf8'), css = await readFile(cssUrl, 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|\/api\/oracle|\/api\/blueprint|localStorage|sessionStorage|document\.cookie|\.click\s*\(/)
  assert.doesNotMatch(source, /useEffect|setTimeout|setInterval|onLoad=|onError=|postMessage|window\.open|window\.location|window\.top|window\.parent/)
  assert.doesNotMatch(source, /webgl-fallback|OracleModelPreview|P0GameLab/)
  assert.doesNotMatch(css, /position\s*:\s*(absolute|fixed)|inset\s*:/)
  assert.match(css, /\.froge-shop-controls\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s)
  assert.match(css, /\.froge-shop-frame\s*\{[^}]*position:\s*static;/s)
  assert.match(css, /@media\s*\(max-width:\s*760px\)/)
  assert.match(css, /min-height:\s*44px/)
  assert.doesNotMatch((await shopHarness()).render().html, /<form|<textarea|download=|disabled=/)
})
