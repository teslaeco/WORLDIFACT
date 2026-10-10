import { pathToFileURL } from 'node:url'
export async function checkImageProvider(env, fetcher = fetch) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured in this deployment environment.')
  const models = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']
  for (const model of models) {
    let response
    try {
      response = await fetcher(`https://api.openai.com/v1/models/${model}`, { method: 'GET', redirect: 'error',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(20_000) })
    } catch { throw new Error('The read-only OpenAI model check could not connect.') }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`OpenAI model access is unavailable (HTTP ${response.status}); no image request was sent.`) }
    let value
    try { value = await response.json() } catch { throw new Error('OpenAI model metadata was not valid JSON.') }
    if (value.id !== model) throw new Error('OpenAI returned unexpected model metadata.')
  }
  return { models, modelAccess: 'verified', imageGenerationTested: false, paidRequests: 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkImageProvider(process.env))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
