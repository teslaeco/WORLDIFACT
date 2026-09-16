import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PORTALS } from '../src/config/portals.ts'
import { routeForPortal } from '../src/lib/portalRouting.ts'

test('portal ids always resolve to their configured in-app routes', () => {
  for (const portal of PORTALS) assert.equal(routeForPortal(portal.id), portal.route)
  assert.equal(routeForPortal('ai-game-lab'), '/lab')
  assert.equal(routeForPortal('unknown-portal'), '/')
})
