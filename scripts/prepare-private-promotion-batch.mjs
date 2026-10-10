import { createHash } from 'node:crypto'
import { realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const fail = () => { throw new Error('PRIVATE_BATCH_INVALID') }
const hash = value => createHash('sha256').update(value).digest('hex')
export function preparePrivateBatch(input, now = Date.now()) {
  if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'accountId,codes,startsAt' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.accountId ?? '') ||
    !Number.isSafeInteger(now) || !Number.isSafeInteger(input.startsAt) || input.startsAt < now - 300000 ||
    input.startsAt > now + 86400000 || !Array.isArray(input.codes) || input.codes.length !== 10 ||
    input.codes.some(code => typeof code !== 'string' || !/^[A-Za-z0-9_-]{12,128}$/.test(code)) ||
    new Set(input.codes).size !== 10) fail()
  const definitions = input.codes.map(code => {
    const sha256 = hash(code)
    // Stable identity: rerunning preparation must not mint replacement claim IDs.
    const h = hash(`worldifact-private-batch-v1:${input.accountId}:${sha256}`)
    const id = `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`
    return { id, sha256, accountId: input.accountId, points: 1000, startsAt: input.startsAt,
      expiresAt: input.startsAt + 30 * 86400000, maxRedemptions: 1, purpose: 'tester' }
  })
  return { WORLDIFACT_PROMOTION_DEFINITIONS: JSON.stringify(definitions), WORLDIFACT_PROMOTIONS_ENABLED: 'true' }
}

// Offline preparation only. Original codes enter via stdin, never CLI arguments.
// Output contains private account-bound hashes and must stay outside the repository.
export async function writePrivateBatch(input, outputPath) {
  const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)))
  const parent = await realpath(dirname(resolve(outputPath)))
  if (parent === repo || parent.startsWith(repo + sep)) fail()
  const result = preparePrivateBatch(input)
  await writeFile(resolve(outputPath), JSON.stringify(result), { flag: 'wx', mode: 0o600 })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) fail()
    let text = ''
    for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > 16384) fail() }
    await writePrivateBatch(JSON.parse(text), process.argv[2])
    console.log('PRIVATE_BATCH_PREPARED_OFFLINE: 10 single-use codes; 1000 points each; not activated.')
  } catch { console.error('PRIVATE_BATCH_NOT_PREPARED: input/output invalid; private values suppressed.'); process.exitCode = 1 }
}
