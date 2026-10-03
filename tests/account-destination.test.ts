import test from 'node:test'
import assert from 'node:assert/strict'
import { safeAccountDestination } from '../src/lib/accountDestination.ts'

test('sign-in return paths reject external destinations and preserve only known payment return fields', () => {
  for (const value of [undefined, '//evil.test', 'https://evil.test', '/\\evil.test', '/api/account/logout', '/login', '/world\n', '/%2f%2fevil.test']) assert.equal(safeAccountDestination(value), '/world')
  assert.equal(safeAccountDestination('/world?next=https://evil.test'), '/world')
  assert.equal(safeAccountDestination('/account/credits?paypal=return&token=ABC123456789&PayerID=someone&next=//evil.test'), '/account/credits?paypal=return&token=ABC123456789')
  assert.equal(safeAccountDestination('/account/credits?paypal=return&token=%3Cscript%3E'), '/account/credits?paypal=return')
  assert.equal(safeAccountDestination('/account/credits?billing=processing'), '/account/credits?billing=processing')
  assert.equal(safeAccountDestination('/account/credits?paypal=cancelled'), '/account/credits?paypal=cancelled')
  assert.equal(safeAccountDestination('/account/credits#secret'), '/account/credits')
  assert.equal(safeAccountDestination('/oauth/consent?authorization_id=11111111-1111-4111-8111-111111111111'), '/oauth/consent?authorization_id=11111111-1111-4111-8111-111111111111')
  assert.equal(safeAccountDestination('/oauth/consent?authorization_id=bad'), '/world')
  assert.equal(safeAccountDestination('/oauth/consent?authorization_id=11111111-1111-4111-8111-111111111111&next=https://evil.test'), '/world')
})

test('MCP sign-in returns only to a single opaque server-side continuation', () => {
  const id = 'a'.repeat(43)
  const path = '/oauth/authorize?continuation=' + id
  assert.equal(safeAccountDestination(path), path)
  assert.equal(safeAccountDestination('/integrations/openai'), '/integrations/openai')
  for (const value of [path + '&continuation=' + id, path + '&redirect_uri=https://evil.test', path + '#x',
    '/oauth/authorize?continuation=short', '/oauth/authorize?client_id=any', '/integrations/openai?next=//evil.test'])
    assert.equal(safeAccountDestination(value), '/world')
})
