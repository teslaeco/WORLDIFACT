import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ITEMS, TASKS, freshState, takeBag, equipSuit, enterZone, selectItem, perform, requirement, restoreState } from '../public/apps/iss/game-state.js'

const polish = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(?:Zapisz|Wczytaj|Torba|Skafander|Zamknij|Nawigacja)\b/u

test('ISS static interface is English and preserves the DOM hooks used by its engine', async () => {
  const html = await readFile(new URL('../public/apps/iss/index.html', import.meta.url), 'utf8')
  const engine = await readFile(new URL('../public/apps/iss/game.js', import.meta.url), 'utf8')
  assert.match(html, /<html lang="en">/)
  assert.doesNotMatch(html, polish)
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must remain unique')
  for (const match of engine.matchAll(/\$\('([^']+)'\)/g))
    assert.ok(ids.includes(match[1]), `Missing engine DOM hook: ${match[1]}`)
  for (const id of ['action', 'joystick', 'load-file', 'missions-dialog', 'help-dialog', 'earth-frame'])
    assert.ok(ids.includes(id))
  assert.match(html, /not ISS operating procedures/)
  assert.match(html, /not a real torque measurement/)
  assert.match(html, /do not represent a list of current ISS failures/)
  assert.match(html, /src="\.\/game.js"/)
})

test('all eight English repair sequences keep tool IDs, consumption and ordering intact', () => {
  assert.deepEqual(ITEMS.map(item => item.id), ['hand','wrench','driver','meter','fuse','parts','patch','filter','connector'])
  assert.deepEqual(TASKS.map(task => task.id), ['rack','filter','seal','bolts','nuts','fuse','connector','solar'])
  assert.deepEqual(TASKS.map(task => task.kind === 'torque' ? task.count : task.steps.length), [3,5,4,4,2,6,5,5])
  assert.doesNotMatch(JSON.stringify({ ITEMS, TASKS }), polish)
  const state = freshState()
  assert.equal(selectItem(state, 'wrench').ok, false)
  assert.equal(state.message, 'Collect the tool bag first.')
  takeBag(state); equipSuit(state)
  for (const task of TASKS) {
    enterZone(state, task.zone)
    for (let count = 0; !state.tasks[task.id].done; count++) {
      assert.ok(count < 10)
      const next = requirement(state, task.id)
      assert.doesNotMatch(next.label, polish)
      selectItem(state, next.tool)
      assert.equal(perform(state, task.id, { distance: 1.6, torque: .75 }).ok, true)
      assert.doesNotMatch(state.message, polish)
    }
  }
  assert.equal(state.used, 6)
  assert.equal(state.version, 2)
  const saved = JSON.parse(JSON.stringify(state))
  saved.message = 'Wczytano postęp.'
  const restored = restoreState(saved)
  assert.deepEqual(restored.tasks, state.tasks)
  assert.deepEqual(restored.items, state.items)
  assert.equal(restored.message, 'Progress loaded. You restart safely inside the station.')
  assert.equal(restored.zone, 'inside')
})
