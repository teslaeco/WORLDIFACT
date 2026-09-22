import assert from 'node:assert/strict'
import test from 'node:test'
import { accountOAuthError } from '../src/lib/accountOAuthError.ts'

test('OAuth diagnostics display fixed actionable guidance for each supported failure', () => {
  const cases = {
    config_unavailable: /Use email or try again later/,
    flow_missing_or_expired: /same tab and browser.*Chrome with site cookies allowed/,
    state_mismatch: /same tab and browser.*Chrome with site cookies allowed/,
    invalid_callback: /Start again with Continue with Google/,
    provider_denied: /cancelled or not approved/,
    rate_limited: /Wait a minute/,
    exchange_failed: /Start a new attempt/,
    service_unavailable: /temporarily unavailable/,
    identity_failed: /could not be verified/,
  }
  for (const [reason, expected] of Object.entries(cases)) assert.match(accountOAuthError(reason), expected)
})

test('unknown, prototype and untrusted OAuth error values never become displayed messages', () => {
  const generic = accountOAuthError(null)
  for (const reason of [undefined, '', 'unknown', '__proto__', 'constructor', 'toString', '<script>private-token</script>', 'state_mismatch\nprivate-token', { reason: 'identity_failed' }]) {
    assert.equal(accountOAuthError(reason), generic)
    assert.doesNotMatch(accountOAuthError(reason), /private-token/)
  }
})
