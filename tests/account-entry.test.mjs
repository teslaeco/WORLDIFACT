import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

test('login entry offers email, gated Google, truthful future providers and an explicit guest route', async () => {
  // Static React rendering only: no listening server, browser, login, or provider request.
  const vite = await createServer({ server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' })
  try {
    const { default: AccountPage } = await vite.ssrLoadModule('/src/pages/AccountPage.tsx')
    const { AccountProvider } = await vite.ssrLoadModule('/src/lib/account.tsx')
    const render = path => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountProvider, null, createElement(AccountPage))))
    const html = render('/login')
    assert.match(html, /WORLDIFAKT/)
    assert.doesNotMatch(html, /WORLDIFACT|Chess Cube|CHESS CUBE/)
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
    assert.match(html, /50 credits per paid generation/)
    // An untrusted OAuth query alone must never render a verified success or grant entry.
    const unverified = render('/login?oauth=success&next=https%3A%2F%2Fattacker.invalid')
    assert.doesNotMatch(unverified, /account-phase-success|Signed in\. Opening|Welcome back/)
    assert.match(unverified, /Connecting…/)
    assert.doesNotMatch(unverified, /href="https:\/\/attacker\.invalid/)
    const failed = render('/login?oauth=error&error_description=SECRET_PROVIDER_DETAILS')
    assert.match(failed, /Google sign-in could not be completed/)
    assert.doesNotMatch(failed, /SECRET_PROVIDER_DETAILS/)
  } finally { await vite.close() }
})
