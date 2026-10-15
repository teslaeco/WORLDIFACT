import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const expectedPortalRoutes = ['/chess', '/iss', '/planets', '/shop', '/lab', '/account/worlds']
const portalRoutes = markup => [...markup.matchAll(/href="([^"]+)"/g)].map(match => match[1])

test('login entry preserves safe sign-in and exposes exactly six portals on both landing pages', async () => {
  // Static React rendering only: no listening server, browser, login, or provider request.
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: AccountPage } = await vite.ssrLoadModule('/src/pages/AccountPage.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const render = path => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountProvider, null, createElement(AccountPage))))
    const html = render('/login')
    // Branding belongs to the header; portal names are intentionally visible below it.
    const header = html.split('<header class="account-header">')[1]?.split('</header>')[0]
    assert.ok(header, 'the account header is present')
    assert.match(header, /WORLDIFAKT/)
    assert.doesNotMatch(header, /WORLDIFACT|Chess Cube|CHESS CUBE/)
    assert.ok(html.includes('aria-label="Six WORLDIFACT portals"'))
    const accountPortals = html.split('<nav class="neon-portals"')[1]?.split('</nav>')[0]
    assert.ok(accountPortals, 'the account landing has a dedicated portal navigation')
    assert.deepEqual(portalRoutes(accountPortals), expectedPortalRoutes, 'all six account portals appear exactly once in order')
    assert.ok(html.includes('class="resource-marquee"'))
    assert.ok(html.includes('No partnership or endorsement implied'))
    for (const resource of ['NASA', 'ESA', 'JAXA']) assert.ok(html.includes(resource), `${resource} is visible`)
    const { default: PortalCardsNav } = await vite.ssrLoadModule('/src/components/PortalCardsNav.tsx')
    const worldPortals = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PortalCardsNav)))
    assert.deepEqual(portalRoutes(worldPortals), expectedPortalRoutes, 'the world-page navigation also exposes all six destinations exactly once')
    assert.match(html, /href="\/world"[^>]*>Explore as a guest/)
    assert.match(html, /<input[^>]*type="email"[^>]*required=""/)
    assert.match(html, /<input[^>]*type="password"[^>]*autoComplete="current-password"[^>]*required=""/)
    assert.match(html, /<button[^>]*class="account-google"[^>]*disabled=""/)
    const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0])
    for (const provider of ['Apple', 'Xbox', 'PlayStation', 'Steam']) {
      const button = buttons.find(value => value.includes(`>${provider}</span>`))
      assert.ok(button, `${provider} is visible`)
      assert.match(button, /disabled=""/)
      assert.match(button, /<small lang="pl">wkrótce dostępne<\/small>/)
    }
    assert.match(html, /<details class="account-free-note">/)
    assert.match(html, /Creator SOL: \$29\.99\/month/)
    assert.match(html, /ASTRA at 250 credits per attempt after runtime activation/)
    // An untrusted OAuth query alone must never render a verified success or grant entry.
    const unverified = render('/login?oauth=success&next=https%3A%2F%2Fattacker.invalid')
    assert.doesNotMatch(unverified, /account-phase-success|Signed in\. Opening|Welcome back/)
    assert.match(unverified, /Connecting…/)
    assert.doesNotMatch(unverified, /href="https:\/\/attacker\.invalid/)
    const failed = render('/login?oauth=error&error_description=SECRET_PROVIDER_DETAILS')
    assert.match(failed, /Google sign-in could not be completed/)
    assert.doesNotMatch(failed, /SECRET_PROVIDER_DETAILS/)
    for (const reason of ['flow_missing_or_expired', 'state_mismatch']) {
      const retry = render(`/login?oauth=error&reason=${reason}&error_description=SECRET_PROVIDER_DETAILS`)
      assert.match(retry, /same tab and browser/)
      assert.match(retry, /Chrome with site cookies allowed/)
      assert.doesNotMatch(retry, /SECRET_PROVIDER_DETAILS|account-phase-success/)
    }
    const unknown = render('/login?oauth=error&reason=SECRET_PROVIDER_DETAILS')
    assert.match(unknown, /Google sign-in could not be completed/)
    assert.doesNotMatch(unknown, /SECRET_PROVIDER_DETAILS/)
  } finally { await vite.close() }
})
