import { createHash } from 'node:crypto'
import { assetSpecForBlueprint, meadowBlueprint } from '../src/lib/blueprint.ts'

export function generation(model = 'gpt-6-sol', requestId = `req_${model}/original:not-a-UUID`) {
  const blueprint = meadowBlueprint()
  return { mode: 'LIVE', provenance: 'GENERATED', model, requestId, blueprint, assetSpec: assetSpecForBlueprint(blueprint),
    limitation: 'A generated specification rendered using local procedural GAME geometry; manufacturing review required.',
    evidence: { providerResponseId: 'resp_fixture_original', receivedAt: '2026-10-02T07:00:00.000Z', blueprintSha256: createHash('sha256').update(JSON.stringify(blueprint)).digest('hex'), inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    delivery: { kind: 'procedural-blueprint', referenceCount: 4, fallbackUsed: false },
  }
}
// Deterministic transactional IndexedDB adapter for the real archive functions.
// It serializes transactions, rolls back failed writes and records notifications.
// It is not a browser/Android storage or quota measurement.
export function archiveStorage() {
  const stores = new Map([['metadata', new Map()], ['models', new Map()]]), waiting = [], transactions = [], events = [], signals = []
  let active = false, holdOpen = false, rejectWrites = false, connectionsClosed = 0
  const begin = () => { if (!active && transactions.length) { active = true; transactions.shift()() } }
  const database = {
    close() { connectionsClosed++ },
    transaction(_names, mode = 'readonly') {
      let working, running = false, complete = false, pumping = false
      const requests = []
      const finish = () => { if (complete) return; complete = true; active = false; begin() }
      const tx = {
        oncomplete: null, onabort: null, onerror: null, aborted: false,
        abort() {
          if (complete || tx.aborted) return
          tx.aborted = true
          queueMicrotask(() => { tx.onabort?.(); if (running) finish() })
        },
        objectStore(name) {
          const request = action => {
            const r = { result: undefined, onsuccess: null, onerror: null }
            requests.push({ action, r }); pump(); return r
          }
          const insert = (value, key, replace) => request(() => {
            if (rejectWrites) throw new DOMException('Device quota exceeded', 'QuotaExceededError')
            const data = working.get(name), id = key ?? value.id
            if (!replace && data.has(id)) throw new DOMException('Duplicate original', 'ConstraintError')
            data.set(id, structuredClone(value)); return id
          })
          return {
            get: key => request(() => structuredClone(working.get(name).get(key))),
            getAll: () => request(() => structuredClone([...working.get(name).values()])),
            add: (value, key) => insert(value, key, false),
            put: (value, key) => insert(value, key, true),
          }
        },
      }
      function pump() {
        if (!running || pumping || complete || tx.aborted) return
        pumping = true
        queueMicrotask(() => {
          pumping = false
          if (tx.aborted || complete) return
          const next = requests.shift()
          if (next) {
            try { next.r.result = next.action(); next.r.onsuccess?.() }
            catch { next.r.onerror?.(); tx.abort(); return }
            pump()
          } else {
            if (mode === 'readwrite') for (const [name, data] of working) stores.set(name, data)
            tx.oncomplete?.(); finish()
          }
        })
      }
      transactions.push(() => {
        running = true
        if (tx.aborted) { finish(); return }
        working = new Map([...stores].map(([name, data]) => [name, new Map(data)]))
        pump()
      })
      queueMicrotask(begin)
      return tx
    },
  }
  const original = new Map(['indexedDB', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const window = new EventTarget()
  window.addEventListener('worldifact:studio-archive-changed', event => events.push(event.detail.id))
  window.localStorage = { setItem: (key, value) => signals.push({ key, value }) }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window })
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() {
    const r = { result: database, onsuccess: null, onerror: null }
    const succeed = () => queueMicrotask(() => r.onsuccess?.())
    if (holdOpen) waiting.push(succeed); else succeed()
    return r
  } } })
  return { stores, events, signals,
    pauseOpen() { holdOpen = true },
    resumeOpen() { holdOpen = false; waiting.splice(0).forEach(fn => fn()) },
    failWrites(value = true) { rejectWrites = value },
    closedConnections: () => connectionsClosed,
    close() { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } },
  }
}
