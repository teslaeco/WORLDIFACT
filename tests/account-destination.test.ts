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
})
