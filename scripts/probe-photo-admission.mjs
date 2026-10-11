/** Non-billable validation probe. Both ID and prompt are deliberately invalid.
 * Reviewed Oracle v33 validates these before DB/files/job creation or WAKE.
 * No caller-provided job ID, prompt, reference or URL is accepted. */
import { pathToFileURL } from 'node:url'
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgaKKK9w8o/9k= '
export function probeBody(photo, large = false) {
  const original=Buffer.from(JPEG.trim().split(",")[1],"base64");
  // Legal JPEG APP2 metadata segments exercise a ~1.3 MB upload without private pixels.
  const segment=Buffer.alloc(65004,0);segment.set([255,226,253,234]);
  const image=large ? "data:image/jpeg;base64,"+Buffer.concat([original.subarray(0,2),...Array.from({length:20},()=>segment),original.subarray(2)]).toString("base64") : JPEG.trim();
  return { id: 'INVALID-NON-JOB-PHOTO-VALIDATION', prompt: '', agentInstructions: '',
    ...(photo ? { photos: [{ name: 'Synthetic validation fixture', view: 'front', dataUrl: image, textureMaxSize: 2048 }] } : {}) }
}
export async function probe(env, fetcher = fetch) {
  let u
  try { u = new URL(env.ORACLE_ENDPOINT); if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname) || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw Error() } catch { throw Error('CONFIGURATION_UNAVAILABLE') }
  if (!/^[^\s]{32,256}$/.test(env.ORACLE_API_TOKEN ?? '')) throw Error('CONFIGURATION_UNAVAILABLE')
  const results = []
  for (const [photo, large] of [[false,false],[true,false],[true,true]]) {
    const r = await fetcher(u.origin + '/v1/jobs', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(probeBody(photo, large)) })
    const reader = r.body.getReader(); let n = 0, text = ''; const decoder = new TextDecoder()
    try { for (;;) { const p = await reader.read(); if (p.done) break; n += p.value.length; if (n > 4096) throw Error('BOUNDED_RESPONSE_REQUIRED'); text += decoder.decode(p.value, {stream:true}) } } finally { await reader.cancel().catch(()=>{}) }
    let v; try { v = JSON.parse(text + decoder.decode()) } catch { v = {} }
    const codes = {
      'Nieprawidlowe dane zadania.': 'GENERIC_VALIDATION_REJECTED',
      'Nieprawidlowy opis lub identyfikator zlecenia.': 'EXPECTED_INVALID_ID_AND_PROMPT',
      'Nieprawidlowy opis zdjecia.': 'PHOTO_DESCRIPTION_REJECTED',
      'Nieprawidlowe zdjecie JPEG.': 'JPEG_REJECTED',
      'Nieprawidlowe wymiary zdjecia.': 'DIMENSIONS_REJECTED',
      'Brak poprawnych wymiarow JPEG.': 'JPEG_DIMENSIONS_MISSING',
      'Zdjecie jest za duze.': 'IMAGE_SIZE_REJECTED'
    }
    results.push({ photo, large, status:r.status, code: codes[v.error] ?? 'UNRECOGNIZED_RESPONSE' })
    if (r.status !== 400 || !['Nieprawidlowy opis lub identyfikator zlecenia.','Nieprawidlowe dane zadania.'].includes(v.error)) break
  }
  return { invalidAdmissionOnly: true, results }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await probe(process.env))) } catch { console.error('VALIDATION_PROBE_UNAVAILABLE'); process.exitCode=1 }
}
