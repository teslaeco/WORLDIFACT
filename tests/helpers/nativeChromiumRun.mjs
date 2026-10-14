import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Wait for the actual native Chromium outcome, not a virtual-clock snapshot.
// A fixed --dump-dom/--virtual-time-budget can return while native fetch and
// reference-image processing are still resolving, reporting a false RUNNING.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function runNativeChromium(browser, html, prefix) {
  const profile = mkdtempSync(join(tmpdir(), prefix))
  const child = spawn(browser, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--host-resolver-rules=MAP * ~NOTFOUND', '--remote-debugging-port=0',
    '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = '', socket, unexpected = ''
  const stopped = new Promise(resolve => {
    child.once('close', resolve)
    child.once('error', error => { unexpected = error.message; resolve() })
  })
  child.stderr.on('data', value => { stderr = (stderr + value.toString()).slice(-1600) })
  try {
    const deadline = Date.now() + 20_000
    let port = 0
    while (Date.now() < deadline && !port) {
      try {
        const value = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0])
        if (Number.isInteger(value) && value > 0 && value <= 65535) port = value
      } catch { /* Chromium may still be starting */ }
      if (!port) await wait(50)
    }
    if (!port) throw new Error(`Native Chromium debugging endpoint never opened: ${unexpected || stderr}`)
    // Chromium can publish DevToolsActivePort before its HTTP debugger becomes
    // responsive under hosted CI load. Retry ONLY this local read-only target
    // lookup, not any user request or test assertion. No external network.
    const lookupDeadline = Date.now() + 15_000
    let targets = null, lastLookupError = ''
    while (Date.now() < lookupDeadline && !targets) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) {
          lastLookupError = `HTTP ${response.status}`
          await response.body?.cancel()
        } else {
          const parsed = await response.json()
          if (!Array.isArray(parsed)) throw new Error('Invalid native browser targets')
          targets = parsed
        }
      } catch (error) {
        lastLookupError = error instanceof Error ? error.message : String(error)
      }
      if (!targets) await wait(250)
    }
    if (!targets) throw new Error(`Native Chromium target lookup unavailable: ${lastLookupError}`)
    const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    if (!target) throw new Error('Chromium did not expose a page target')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await Promise.race([
      new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true })
        socket.addEventListener('error', () => reject(new Error('Native Chromium debugger connection failed')), { once: true })
      }),
      wait(3000).then(() => { throw new Error('Native Chromium debugger handshake timed out') }),
    ])
    let serial = 0
    const pending = new Map(), exceptions = []
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data)
      if (data.id) {
        const complete = pending.get(data.id)
        pending.delete(data.id)
        complete?.(data)
      } else if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(data.params?.exceptionDetails?.text || 'Unexpected browser exception')
      }
    })
    function send(method, params = {}) {
      const id = ++serial
      return new Promise((resolve, reject) => {
        pending.set(id, data => data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result))
        try { socket.send(JSON.stringify({ id, method, params })) }
        catch (error) { pending.delete(id); reject(error) }
      })
    }
    await send('Page.enable')
    await send('Runtime.enable')
    const frame = await send('Page.getFrameTree')
    // No navigation and no HTTP origin: inert fixture executes in about:blank
    // and cannot accidentally call the production API.
    await send('Page.setDocumentContent', { frameId: frame.frameTree.frame.id, html })
    const finishBy = Date.now() + 20_000
    let lastState = ''
    while (Date.now() < finishBy) {
      const evaluated = await send('Runtime.evaluate', {
        expression: 'document.getElementById("result")?.textContent',
        returnByValue: true,
      })
      lastState = evaluated.result?.value ?? ''
      if (lastState.startsWith('PASS:')) return lastState
      if (lastState.startsWith('FAIL:')) throw new Error(lastState)
      if (exceptions.length) throw new Error(`Chromium script exception: ${exceptions.join('; ')}`)
      await wait(50)
    }
    throw new Error(`Native Chromium scenario did not reach PASS/FAIL (last state: ${lastState || 'missing result'}; ${stderr})`)
  } finally {
    socket?.close()
    if (child.exitCode === null) child.kill()
    await Promise.race([stopped, wait(1500)])
    if (child.exitCode === null) child.kill('SIGKILL')
    rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
  }
}
