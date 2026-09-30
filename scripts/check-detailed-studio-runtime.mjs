import { pathToFileURL } from 'node:url'
import { detailedRuntime } from '../src/lib/detailedStudio.ts'
import { checkAstraRuntime } from './check-astra-runtime.mjs'

export async function checkDetailedRuntime(env, fetcher = fetch) {
  let capability = null
  const captured = async (url, init) => {
    const response = await fetcher(url, init)
    // checkAstraRuntime performs the bounded body read and config validation.
    const reader = response.body?.getReader()
    if (!reader || Number(response.headers.get('content-length') || 0) > 16384) throw new Error('DETAILED_RUNTIME_NOT_VERIFIED')
    const decoder = new TextDecoder(); let text = '', size = 0
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break
        size += part.value.byteLength
        if (size > 16384) throw new Error('DETAILED_RUNTIME_NOT_VERIFIED')
        text += decoder.decode(part.value, {stream:true})
      }
      text += decoder.decode()
    } finally { await reader.cancel().catch(()=>{}) }
    if (response.ok) {
      const value = JSON.parse(text)
      capability = { ...detailedRuntime(value), photoInput: value.photoInput === true, promptMaxLength: value.promptMaxLength === 5000 ? 5000 : 2000 }
    }
    return new Response(text, { status: response.status, headers: response.headers })
  }
  const guard = await checkAstraRuntime(env, captured)
  return { ...guard, detailed: capability, verifiedForGuardedRouting: capability?.outputPolicyReady === true && capability?.photoInput === true, paidGenerationRequested: false }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkDetailedRuntime(process.env),null,2)) }
  catch { console.error('DETAILED_RUNTIME_NOT_VERIFIED; no generation requested'); process.exitCode=1 }
}
