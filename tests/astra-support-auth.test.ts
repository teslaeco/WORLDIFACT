import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVerifiedAccount } from '../server/accounts.ts'
import { quoteGeneration } from '../src/lib/generationQuote.ts'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const request = new Request('https://worldifact.test/api/account/entitlements', { headers: {
  Cookie: '__Host-worldifact-access=synthetic-cookie-value',
  'X-WORLDIFACT-Verified-Email': 'forged@example.invalid',
} })

test('support identity trusts only the authoritative authenticated email confirmation, never user-editable metadata or phone confirmation', async () => {
  const confirmed = '2026-09-01T00:00:00.000Z'
  for (const [extra, expected] of [
    [{ email_confirmed_at: confirmed }, true],
    [{ email_confirmed_at: null, user_metadata: { email_verified: true } }, false],
    [{ confirmed_at: confirmed, phone_confirmed_at: confirmed }, false],
    [{ email_confirmed_at: 'not a date' }, false],
    [{ email_confirmed_at: '2999-01-01T00:00:00.000Z' }, false],
    [{ email_confirmed_at: confirmed, is_anonymous: true }, false],
    [{}, false],
  ] as const) {
    let requests = 0
    const user = await getVerifiedAccount(request, {}, (async (url, init) => {
      requests++
      assert.equal(new URL(String(url)).pathname, '/auth/v1/user')
      assert.equal(new Headers(init?.headers).has('X-WORLDIFACT-Verified-Email'), false)
      return Response.json({ id: owner, email: 'owner@example.invalid', ...extra })
    }) as typeof fetch)
    assert.equal(requests, 1)
    assert.equal(user?.emailVerified, expected)
    assert.equal(user?.email, 'owner@example.invalid')
    assert.equal(JSON.stringify(user).includes('emailVerified'), false, 'Server-only proof is not added to client session JSON')
  }
})

test('a Studio-only support approval cannot advertise the premium Blueprint route as funded', () => {
  const account = { credits: 3000, availableCredits: 3000, generationCosts: { sol: 50, astra: 250 }, billingReview: false,
    subscription: { active: true, plan: 'pro' }, generationAdmission: { astra: { allowed: false, reason: 'PROVIDER_BUDGET_EXHAUSTED' } },
    studioAdmission: { allowed: true }, astraSupportOnce: { available: true, consumed: false, maximumProviderCents: 175 } }
  const billing = { plans: { pro: { checkoutReady: true } } }
  assert.equal(quoteGeneration('astra', account, billing, true).state, 'blocked')
  const detailed = quoteGeneration('astra', account, billing, true, true)
  assert.equal(detailed.state, 'credits')
  assert.equal(detailed.points, 250)
  assert.equal(detailed.after, 2750)
  assert.equal(quoteGeneration('astra', { ...account, studioAdmission: { allowed: true, reason: 'PRIVATE' } }, billing, true, true).state, 'pending')
})
