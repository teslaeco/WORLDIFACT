import { detailedAssemblyGLBFixture, detailedHealthFixture, detailedGLBFixture } from './detailed-studio-fixture.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioApi, type StudioEnv } from '../server/studio.ts'
import { GenerationBudget, type BudgetStorage } from '../server/budget.ts'
import { AccountEntitlements, entitlementCall, entitlementStatus, type EntitlementStorage } from '../server/entitlements.ts'
import { prepareStudioInput, STUDIO_FAILURE_DETAILS, STUDIO_SUBMISSION_GRACE_MS, type StudioInput, type StudioJob, type StudioReceipt } from '../src/lib/studioProtocol.ts'

const origin = 'https://worldifact.test'
const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const input: StudioInput = { worldId: 'enchanted-ai-shop', prompt: 'A detailed blue chess rook', purpose: 'figurine', textureMaxSize: 4096, photos: [] }
function storage(): EntitlementStorage {
  const values = new Map<string, unknown>(); let queue: Promise<unknown> = Promise.resolve()
  const store: EntitlementStorage = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined },
    async put(key, value) { values.set(key, structuredClone(value)) },
    transaction<T>(callback: (value: EntitlementStorage) => Promise<T>) { const next = queue.then(() => callback(store)); queue = next.catch(() => {}); return next },
  }
  return store
}
function fixture() {
  const env: StudioEnv = { OWNER_ACCESS_TOKEN: 'owner-test-'.repeat(5), ORACLE_ENDPOINT: 'https://worker.trycloudflare.com', ORACLE_API_TOKEN: 'test-oracle',
    PUBLIC_PILOT: 'true', ENABLE_STUDIO_JOBS: 'true', GENERATION_REQUEST_LIMIT: 'unlimited', ENFORCE_ACCOUNT_ENTITLEMENTS: 'true',
    GENERATION_LIMITER: { async limit() { return { success: true } } } }
  const budget = new GenerationBudget({ storage: storage() as BudgetStorage }, env)
  env.GENERATION_BUDGET = { idFromName: name => name, get: () => budget }
  const users = new Map<string, AccountEntitlements>()
  env.ACCOUNT_ENTITLEMENTS = { idFromName: name => name, get(id) { const key = String(id); if (!users.has(key)) users.set(key, new AccountEntitlements({ storage: storage() }, {}, () => Date.now())); return users.get(key)! } }
  let modelStatus: 'draft' | 'reviewed' | undefined, qualityFailure = false
  let quality: Record<string, unknown> = { revision: 6, state: 'succeeded', hasModel: true, modelStatus: 'draft', automaticQualityAccepted: false, agent: {}, agentUsage: { completed: false, error_code: null }, visualReview: { assessment_completed: false, accepted: false, status: 'not_completed' } }
  let qualityReads = 0
  let runtimeOverrides: Record<string, unknown> = {}, invalidModel = false, denseModel = false, failureDetail = '', lastPayload: Record<string, any> | null = null
  let posts = 0, artifacts = 0, loss = false, busy = false, state: StudioJob['state'] = 'succeeded', status404 = false
  let statusFailure: 'http' | 'rate-limit' | 'transport' | 'malformed' | null = null
  let artifactFailure = false, artifactHttpStatus = 0, artifactGate: Promise<void> | undefined
  let artifactResponse: (() => Response) | undefined
  let submissionRejection: { status: number; body: unknown } | undefined
  let healthGate: Promise<void> | undefined, statusGate: Promise<void> | undefined, healthReads = 0, statusReads = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization')
      if (token === 'Bearer alice-token') return Response.json({ id: alice, email: 'alice@example.test' })
      if (token === 'Bearer bob-token') return Response.json({ id: bob, email: 'bob@example.test' })
      return Response.json({}, { status: 401 })
    }
    if (path === '/v1/health') { healthReads++; await healthGate; return Response.json({ ...detailedHealthFixture, ...runtimeOverrides }) }
    if (path === '/v1/jobs') {
      posts++
      lastPayload = JSON.parse(String(init?.body))
      if (loss) throw new Error('Unconfirmed transport acceptance')
      if (busy) return Response.json({ error: 'Serwer wykonuje poprzedni model. Poczekaj na wynik lub anuluj tamto zlecenie.' }, { status: 409 })
      if (submissionRejection) return Response.json(submissionRejection.body, { status: submissionRejection.status })
      return Response.json({ id: JSON.parse(String(init?.body)).id, state: 'building' })
    }
    if (path.endsWith('/quality')) { qualityReads++; return qualityFailure ? Response.json({}, { status: 503 }) : Response.json(quality) }
    if (/\/model$|\/exports\//.test(path)) {
      artifacts++
      await artifactGate
      if (artifactResponse) return artifactResponse()
      if (artifactFailure) throw new TypeError('Simulated artifact transport failure')
      if (artifactHttpStatus) return Response.json({ error: 'Temporary artifact availability' }, { status: artifactHttpStatus })
      const bytes = invalidModel ? new Uint8Array(24) : denseModel ? detailedAssemblyGLBFixture(12,2400,4) : detailedGLBFixture()
      return new Response(bytes, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } })
    }
    statusReads++; await statusGate
    if (statusFailure === 'http') return Response.json({ error: 'Temporarily unavailable' }, { status: 503 })
    if (statusFailure === 'rate-limit') return Response.json({ error: 'Slow down' }, { status: 429 })
    if (statusFailure === 'transport') throw new TypeError('Simulated status transport failure')
    if (statusFailure === 'malformed') return Response.json({ id: 'not-this-job', state: 'building' })
    if (status404) return Response.json({}, { status: 404 })
    return Response.json({ id: path.split('/').pop(), state, detail: failureDetail, ...(modelStatus ? { modelStatus } : {}) })
  }) as typeof fetch
  const call = (path: string, method = 'GET', body?: unknown, ticket?: string, user: 'alice' | 'bob' | null = 'alice') => {
    const jobId = ticket?.split('.')[0]
    return studioApi(new Request(origin + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(ticket ? { 'X-WORLDIFACT-Job': ticket } : {}),
        ...(method === 'POST' && path === '/api/studio/jobs' && jobId ? { 'X-WORLDIFACT-Idempotency-Key': jobId } : {}),
        ...(user ? { Cookie: `__Host-worldifact-access=${user}-token` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, fetcher)
  }
  const prepare = async () => await (await call('/api/studio/prepare', 'POST', input)).json() as { id: string; ticket: string }
  const subscribe = async () => {
    await entitlementCall(env, alice, '/grant', { id: 'in_subscription', credits: 4500, subscriptionId: 'sub_test' })
    await entitlementCall(env, alice, '/subscription', { id: 'sub_test', until: Date.now() + 86400000, active: true, revision: 1, plan: 'pro', grantId: 'in_subscription' })
  }
  return { env, call, prepare, subscribe, setHealth: (overrides: Record<string, unknown>) => { runtimeOverrides = overrides }, sent: () => lastPayload, invalid: () => { invalidModel = true }, dense: () => { denseModel = true }, costFailure: () => { state = 'failed'; failureDetail = 'ASTRA budget guard stopped before another API call. PRIVATE_KEY'; }, posts: () => posts, artifacts: () => artifacts, fail: () => { state = 'failed' },
    quality: (value: Record<string, unknown> = {}) => { modelStatus = 'draft'; quality = { ...quality, ...value } },
    qualityFailure: (value: boolean) => { qualityFailure = value }, qualityReads: () => qualityReads,
    statusFailure: (value: typeof statusFailure) => { statusFailure = value },
    artifactFailure: (value: boolean) => { artifactFailure = value },
    artifactHttpStatus: (value: number) => { artifactHttpStatus = value },
    artifactGate: (value: Promise<void> | undefined) => { artifactGate = value },
    artifactResponse: (value: (() => Response) | undefined) => { artifactResponse = value },
    rejectSubmission: (status: number, body: unknown) => { submissionRejection = { status, body } },
    cancel: () => { state = 'cancelled' },
    healthGate: (value: Promise<void> | undefined) => { healthGate = value }, healthReads: () => healthReads,
    statusGate: (value: Promise<void> | undefined) => { statusGate = value }, statusReads: () => statusReads,
    missing: (value = true) => { status404 = value },
    busy: () => { busy = true }, lose: () => { loss = true; status404 = true } }
}

test('account-bound prepared receipts cannot be submitted or read by another user', async () => {
  const f = fixture()
  assert.equal((await f.call('/api/studio/prepare', 'POST', input, undefined, null)).status, 401)
  const receipt = await f.prepare()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket, 'bob')).status, 401)
  assert.equal(f.posts(), 0)
  await f.subscribe()
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 202)
  // Even a deliberately preclaimed UUID in another namespace cannot turn a
  // shared/stolen ticket into that user's receipt. The HMAC itself binds uid.
  await entitlementCall(f.env, bob, '/reserve', { id: receipt.id, profile: 'fast' })
  await entitlementCall(f.env, bob, '/settle', { id: receipt.id, state: 'completed' })
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
})

test('free accounts cannot start ASTRA SLOW jobs or transfer artifacts', async () => {
  const f = fixture(), receipt = await f.prepare()
  const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(response.status, 429)
  assert.equal(f.posts(), 0)
  assert.equal(f.artifacts(), 0)
  const status = await entitlementStatus(f.env, alice)
  assert.equal(status.subscription.active, false)
  assert.equal(status.credits, 0)
})

test('concurrent repeated SLOW submission holds 250 once; confirmed failure releases the hold without a debit', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  const replies = await Promise.all(Array.from({ length: 5 }, () => f.call('/api/studio/jobs', 'POST', input, receipt.ticket)))
  assert.ok(replies.every(response => response.status === 202)); assert.equal(f.posts(), 1)
  { const status = await entitlementStatus(f.env, alice); assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 250); assert.equal(status.availableCredits, 4250) }
  f.fail()
  await Promise.all([f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket), f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)])
  { const status = await entitlementStatus(f.env, alice); assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 0); assert.equal(status.availableCredits, 4500) }
})

test('an unknown acceptance stays pending briefly, then an explicit Oracle 404 releases the held reservation', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.lose()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  const { job } = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(job.state, 'pending'); assert.equal(f.posts(), 1)
  { const status = await entitlementStatus(f.env, alice); assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 250); assert.equal(status.availableCredits, 4250) }
  const now = Date.now
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    const review = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob; reconciledMissing?: boolean }
    assert.equal(review.job.state, 'failed'); assert.equal(review.reconciledMissing, true)
    { const status = await entitlementStatus(f.env, alice); assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 0) }
    assert.equal(f.posts(), 1, 'recovery never submits another Oracle job')
  } finally { Date.now = now }
})

test('the whole-job watchdog releases an overdue hold even when Oracle status cannot be recovered', async () => {
  for (const failure of ['http', 'rate-limit', 'transport', 'malformed'] as const) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 202)
    f.statusFailure(failure)
    const before = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    assert.ok([429, 502, 503].includes(before.status), `${failure} remains uncertain before the watchdog`)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    const now = Date.now
    try {
      Date.now = () => now() + 36 * 60_000
      assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket, 'bob')).status, 401)
      assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250, 'Another account cannot release this hold')
      const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
      assert.equal(response.status, 200, failure)
      const result = await response.json() as { job: StudioJob }
      assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, 'STUDIO_TIMEOUT')
      const status = await entitlementStatus(f.env, alice)
      assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 0)
      const repeated = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
      assert.equal(repeated.status, 200)
      assert.equal((await repeated.json() as { job: StudioJob }).job.state, 'failed', 'The settled failure remains terminal while Oracle is offline')
      assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0, 'Repeated recovery cannot release the same hold twice')
      f.statusFailure(null)
      const laterSuccess = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
      assert.equal((await laterSuccess.json() as { job: StudioJob }).job.state, 'failed', 'Later Oracle success cannot reopen a terminal failure')
      assert.equal((await entitlementStatus(f.env, alice)).credits, 4500, 'Later Oracle success cannot charge the released hold')
      assert.equal(f.posts(), 1, 'Watchdog reconciliation never submits another Oracle generation')
    } finally { Date.now = now }
  }
})

test('the whole-job watchdog also bounds successful statuses with an unrecoverable model stream', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.artifactFailure(true)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).status, 503)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
  const now = Date.now
  try {
    Date.now = () => now() + 36 * 60_000
    const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, 'STUDIO_TIMEOUT')
    const status = await entitlementStatus(f.env, alice)
    assert.equal(status.credits, 4500); assert.equal(status.reservedCredits, 0)
    f.artifactFailure(false)
    const later = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(later.job.state, 'failed')
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal(f.posts(), 1)
  } finally { Date.now = now }
})

test('an overdue reservation still recovers a verified Oracle success before applying the watchdog', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  const now = Date.now
  try {
    Date.now = () => now() + 36 * 60_000
    const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'succeeded')
    const status = await entitlementStatus(f.env, alice)
    assert.equal(status.credits, 4250); assert.equal(status.reservedCredits, 0)
    assert.equal(f.posts(), 1)
  } finally { Date.now = now }
})

test('a server budget rejection refunds the customer reservation before any Oracle POST', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  f.env.GENERATION_BUDGET = { idFromName: name => name, get: () => ({ async fetch(request) {
    return new URL(request.url).pathname === '/status'
      ? Response.json({ used: 0, limit: null, remaining: null, unlimited: true, enabled: true })
      : Response.json({ allowed: false }, { status: 429 })
  } }) }
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 429)
  assert.equal(f.posts(), 0); assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})

test('Oracle busy 409 restores customer credits immediately instead of creating a fake pending receipt', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.busy()
  const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  assert.equal(response.status, 409)
  const value = await response.json() as { error: string }
  assert.match(value.error, /finishing another model/i)
  assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
})



test('four references and a complete 4,000-character character brief reach Oracle, followed by one model-validated settlement', async () => {
  const f=fixture();await f.subscribe();f.dense()
  const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  const prompt=('An adult woman with silver hair, preserve references, no orb. '+'outfit '.repeat(600)).slice(0,4000)
  const request={...input,prompt,photos:['front','left','right','back'].map((view,i)=>({name:`view-${i}.jpg`,view,dataUrl:jpeg,textureMaxSize:4096}))}
  const prep=await f.call('/api/studio/prepare','POST',request);assert.equal(prep.status,200)
  const receipt=await prep.json() as {id:string;ticket:string}
  const replies=await Promise.all(Array.from({length:4},()=>f.call('/api/studio/jobs','POST',request,receipt.ticket)))
  assert.deepEqual(replies.map(r=>r.status),[202,202,202,202]);assert.equal(f.posts(),1)
  assert.ok(f.sent()!.prompt.startsWith(prompt));assert.ok(f.sent()!.prompt.length<=5000)
  assert.deepEqual(f.sent()!.photos,request.photos.map(photo => photo.view === 'left' || photo.view === 'right' ? {...photo,view:'side'} : photo))
  assert.deepEqual(request.photos.map(photo=>photo.view),['front','left','right','back'],'Original signed input and its view labels are unchanged')
  assert.match(f.sent()!.agentInstructions,/Reference 1: front; Reference 2: left; Reference 3: right; Reference 4: back/)
  assert.ok(f.sent()!.agentInstructions.length <= 12000,'Installed agent instruction limit')
  assert.match(f.sent()!.agentInstructions,/authoritative visual input/)
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4500); assert.equal(status.reservedCredits,250); assert.equal(status.availableCredits,4250) }
  const result=await (await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)).json() as {job:StudioJob}
  assert.equal(result.job.state,'succeeded');assert.equal(f.artifacts(),1)
  await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)
  assert.equal(f.artifacts(),1,'A verified terminal job does not redownload its model on every poll')
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4250); assert.equal(status.reservedCredits,0) }
})

test('cloud current endpoint recovers the exact active Studio job after browser receipt loss without another Oracle POST', async () => {
  const f=fixture();await f.subscribe();const receipt=await f.prepare()
  assert.equal((await f.call('/api/studio/jobs','POST',input,receipt.ticket)).status,202)
  assert.equal(f.posts(),1)
  let status=await entitlementStatus(f.env,alice)
  assert.equal(status.credits,4500);assert.equal(status.reservedCredits,250);assert.equal(status.availableCredits,4250)

  const response=await f.call('/api/studio/current','GET')
  assert.equal(response.status,200)
  const current=await response.json() as {current:{receipt:{id:string;ticket:string;createdAt:string};prompt:string;financialState:string;reservedPoints:number}}
  assert.equal(current.current.receipt.id,receipt.id)
  assert.equal(current.current.prompt,input.prompt)
  assert.equal(current.current.financialState,'reserved')
  assert.equal(current.current.reservedPoints,250)

  const recovered=await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,current.current.receipt.ticket)
  assert.equal(recovered.status,200)
  assert.equal(f.posts(),1,'recovery must never submit another Oracle generation')
  status=await entitlementStatus(f.env,alice)
  assert.equal(status.credits,4250,'the first successful terminal poll commits the existing held charge once')
  assert.equal(status.reservedCredits,0)

  const again=await f.call('/api/studio/jobs','POST',input,current.current.receipt.ticket)
  assert.equal(again.status,202)
  assert.equal(f.posts(),1,'same UUID is idempotent even after browser recovery')
  assert.equal((await entitlementStatus(f.env,alice)).credits,4250)
})

test('a mismatched explicit idempotency key is rejected before reservation or Oracle POST', async () => {
  const f=fixture();await f.subscribe();const receipt=await f.prepare()
  const guardFetcher=(async (url:string|URL|Request)=>{
    if(new URL(String(url)).pathname==='/auth/v1/user')return Response.json({id:alice,email:'alice@example.test'})
    throw new Error('Oracle must not be called')
  }) as typeof fetch
  const response=await studioApi(new Request(origin+'/api/studio/jobs',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-WORLDIFACT-Job':receipt.ticket,'X-WORLDIFACT-Idempotency-Key':'00000000-0000-4000-8000-000000000000',Cookie:'__Host-worldifact-access=alice-token'},body:JSON.stringify(input)}),f.env,guardFetcher)
  assert.equal(response.status,409)
  const status=await entitlementStatus(f.env,alice)
  assert.equal(status.credits,4500);assert.equal(status.reservedCredits,0)
  assert.equal(f.posts(),0)
})

test('missing, stale or changed monetary/output-policy evidence blocks before any point reservation', async () => {
  for(const changed of [{astraBudgetRevision:undefined},{astraBudgetMaxUsd:4},{astraBudgetExpiry:1},{codexReady:false},
    {astraOutputPolicy:undefined},{astraReasoningEffort:'high'},{astraUsageSettlement:'estimated'},{astraMaxOutputTokens:96000}]) {
    const f=fixture();await f.subscribe();f.setHealth(changed)
    const status=await (await f.call('/api/studio/status')).json() as {detailedReady:boolean;reason:string}
    assert.equal(status.detailedReady,false);assert.match(status.reason,/ASTRA_/)
    assert.equal((await f.call('/api/studio/prepare','POST',input)).status,503)
    assert.equal(f.posts(),0);assert.equal((await entitlementStatus(f.env,alice)).credits,4500)
  }
})

test('a succeeded status without a valid actual model refunds once and cannot later be charged again', async () => {
  const f=fixture();await f.subscribe();const receipt=await f.prepare();f.invalid()
  await f.call('/api/studio/jobs','POST',input,receipt.ticket)
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4500); assert.equal(status.reservedCredits,250) }
  const result=await (await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)).json() as {job:StudioJob}
  assert.equal(result.job.state,'failed');assert.equal(result.job.failureCode,'INVALID_MODEL_OUTPUT')
  assert.equal(result.job.downloadAllowed,false);{ const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4500); assert.equal(status.reservedCredits,0) }
  await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)
  assert.equal((await entitlementStatus(f.env,alice)).credits,4500);assert.equal(f.posts(),1)
})

test('cost-limit failure returns points and a fixed customer message, never private upstream details', async () => {
  const f=fixture();await f.subscribe();const receipt=await f.prepare()
  await f.call('/api/studio/jobs','POST',input,receipt.ticket);f.costFailure()
  const response=await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket), body=await response.text()
  assert.match(body,/ASTRA_COST_LIMIT/);assert.doesNotMatch(body,/PRIVATE_KEY/)
  assert.equal((await entitlementStatus(f.env,alice)).credits,4500);assert.equal(f.posts(),1)
})


test('account-bound receipt recovers the exact Oracle job when only the entitlement job row is missing', async () => {
  const f = fixture(); await f.subscribe()
  const receipt = await f.prepare()
  // Deliberately skip /api/studio/jobs POST: the entitlement row is absent,
  // while the fixture Oracle reports this exact signed UUID as succeeded.
  const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  assert.equal(response.status, 200)
  const value = await response.json() as { job: StudioJob }
  assert.equal(value.job.id, receipt.id)
  assert.equal(value.job.state, 'succeeded')
  assert.equal(value.job.reconciliationRequired, true)
  assert.equal(value.job.downloadAllowed, true)
  assert.match(value.job.detail, /account-ledger ownership row is missing/i)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500, 'Recovery never creates a second debit.')

  const artifact = await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket)
  assert.equal(artifact.status, 200)
  assert.equal(f.artifacts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
  assert.equal(f.posts(), 0, 'Recovery never submits another Oracle generation.')
})

test('missing entitlement row plus missing Oracle job becomes terminal after reconciliation window without charging', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare(); f.lose()
  const now = Date.now
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    assert.equal(response.status, 200)
    const value = await response.json() as { job: StudioJob; reconciledMissing?: boolean }
    assert.equal(value.job.state, 'failed')
    assert.equal(value.job.failureCode, 'MISSING_SUBMISSION')
    assert.equal(value.reconciledMissing, true)
    assert.match(value.job.detail, /no matching account reservation or Oracle job/i)
    assert.doesNotMatch(value.job.detail, /points were released|refunded|charged/i)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal(f.posts(), 0)
  } finally { Date.now = now }
})


test('reference-driven electrical cabinet rejects a sparse photo-card model and refunds the 250-point reservation', async () => {
  const f=fixture();await f.subscribe()
  const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  const request:StudioInput={...input,purpose:'object',prompt:'Reconstruct this industrial electrical control cabinet with DIN rails, terminal blocks, circuit breakers, relays and dense wiring.',
    photos:['front','left','right'].map((view,i)=>({name:`cabinet-${i}.jpg`,view:view as 'front'|'left'|'right',dataUrl:jpeg,textureMaxSize:4096}))}
  const prep=await f.call('/api/studio/prepare','POST',request);assert.equal(prep.status,200)
  const receipt=await prep.json() as {id:string;ticket:string}
  assert.equal((await f.call('/api/studio/jobs','POST',request,receipt.ticket)).status,202)
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4500); assert.equal(status.reservedCredits,250) }
  const result=await (await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)).json() as {job:StudioJob}
  assert.equal(result.job.state,'failed')
  assert.equal(result.job.failureCode,'INVALID_MODEL_OUTPUT')
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4500); assert.equal(status.reservedCredits,0) }
  assert.equal(f.posts(),1)
  assert.match(String(f.sent()!.agentInstructions),/INDUSTRIAL ELECTRICAL CABINET — TRUE 3D MODE/)
})

test('dense reference-driven electrical cabinet passes the structural gate without a second generation', async () => {
  const f=fixture();await f.subscribe();f.dense()
  const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,17,8,0,16,0,16,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64')
  const request:StudioInput={...input,purpose:'object',prompt:'Detailed industrial switchgear MCC cabinet with real breakers, contactors, DIN rails and cable bundles.',
    photos:['front','detail'].map((view,i)=>({name:`mcc-${i}.jpg`,view:view as 'front'|'detail',dataUrl:jpeg,textureMaxSize:4096}))}
  const prep=await f.call('/api/studio/prepare','POST',request);const receipt=await prep.json() as {id:string;ticket:string}
  await f.call('/api/studio/jobs','POST',request,receipt.ticket)
  const result=await (await f.call(`/api/studio/jobs/${receipt.id}`,'GET',undefined,receipt.ticket)).json() as {job:StudioJob}
  assert.equal(result.job.state,'succeeded')
  assert.equal(result.job.failureCode,undefined)
  { const status=await entitlementStatus(f.env,alice); assert.equal(status.credits,4250); assert.equal(status.reservedCredits,0) }
  assert.equal(f.posts(),1)
})


test('temporary model HTTP errors preserve the same pending hold and recover without another generation', async () => {
  for (const statusCode of [404, 409, 429, 500, 502, 503]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    f.artifactHttpStatus(statusCode)
    const unavailable = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    assert.ok([404, 409, 429, 502, 503].includes(unavailable.status), `HTTP ${statusCode} is an uncertain read, not terminal invalid geometry`)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    f.artifactHttpStatus(0)
    const recovered = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(recovered.job.state, 'succeeded')
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    assert.equal(f.posts(), 1, 'Recovering the artifact never generates another model')
  }
})

test('a settled cost failure keeps its safe diagnostic on repeated polls and account recovery', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.costFailure()
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, 'ASTRA_COST_LIMIT')
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_KEY/)
  }
  const current = await (await f.call('/api/studio/current')).json() as { current: { failureCode?: string } }
  assert.equal(current.current.failureCode, 'ASTRA_COST_LIMIT')
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
  assert.equal(f.posts(), 1)
})


test('failure categories survive repeat polling and recovery without saving raw worker messages', async () => {
  for (const code of ['INVALID_MODEL_OUTPUT', 'ORACLE_JOB_FAILED', 'ORACLE_JOB_MISSING'] as const) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    if (code === 'INVALID_MODEL_OUTPUT') f.invalid()
    if (code === 'ORACLE_JOB_FAILED') f.fail()
    const now = Date.now
    try {
      if (code === 'ORACLE_JOB_MISSING') { f.lose(); Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000 }
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
        assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, code)
      }
      const current = await (await f.call('/api/studio/current')).json() as { current: { failureCode?: string } }
      assert.equal(current.current.failureCode, code)
      assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
      assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
      assert.equal(f.posts(), 1)
    } finally { Date.now = now }
  }
})

test('interrupted GLB reads before and after the header remain recoverable under the same hold', async () => {
  for (const size of [4, 16]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    const bytes = detailedGLBFixture()
    f.artifactResponse(() => new Response(bytes.subarray(0, size), { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(bytes.length) } }))
    const interrupted = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    assert.ok([502, 503].includes(interrupted.status))
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    f.artifactResponse(undefined)
    const recovered = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(recovered.job.state, 'succeeded')
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
    assert.equal(f.posts(), 1)
  }
})

test('a verified completion stays successful if Oracle later fails, disappears or becomes unavailable', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  for (const disturb of [() => f.fail(), () => f.lose(), () => f.statusFailure('transport')]) {
    disturb()
    const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'succeeded'); assert.equal(result.job.failureCode, undefined)
    assert.doesNotMatch(result.job.detail, /released|failed/)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
    assert.equal(f.artifacts(), 1)
  }
  assert.equal(f.posts(), 1)
})

test('concurrent success and failure polls report the one durable settlement instead of contradictory charges', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  let release!: () => void
  f.artifactGate(new Promise<void>(resolve => { release = resolve }))
  const validating = f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  while (!f.artifacts()) await new Promise(resolve => setImmediate(resolve))
  f.costFailure()
  const failed = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  release()
  const lateSuccess = await (await validating).json() as { job: StudioJob }
  for (const result of [failed, lateSuccess]) {
    assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, 'ASTRA_COST_LIMIT')
    assert.equal(result.job.downloadAllowed, false)
  }
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
  assert.equal(f.posts(), 1)
})

test('local verification contention cannot turn another overdue successful model into a terminal timeout', async () => {
  const a = fixture(), b = fixture(); await a.subscribe(); await b.subscribe()
  const ar = await a.prepare(), br = await b.prepare()
  await a.call('/api/studio/jobs', 'POST', input, ar.ticket)
  await b.call('/api/studio/jobs', 'POST', input, br.ticket)
  let release!: () => void
  a.artifactGate(new Promise<void>(resolve => { release = resolve }))
  const validating = a.call(`/api/studio/jobs/${ar.id}`, 'GET', undefined, ar.ticket)
  while (!a.artifacts()) await new Promise(resolve => setImmediate(resolve))
  const now = Date.now
  try {
    Date.now = () => now() + 36 * 60_000
    const busy = await b.call(`/api/studio/jobs/${br.id}`, 'GET', undefined, br.ticket)
    assert.equal(busy.status, 503)
    assert.equal((await entitlementStatus(b.env, alice)).reservedCredits, 250)
    release(); await validating
    const recovered = await (await b.call(`/api/studio/jobs/${br.id}`, 'GET', undefined, br.ticket)).json() as { job: StudioJob }
    assert.equal(recovered.job.state, 'succeeded')
    assert.equal((await entitlementStatus(b.env, alice)).credits, 4250)
    assert.equal(b.posts(), 1)
  } finally { Date.now = now; release(); await validating }
})

test('lightweight account preparation preserves legacy binding and cannot cross accounts or bypass full validation', async () => {
  const f = fixture(); await f.subscribe()
  const manifest = await prepareStudioInput(input)
  const prepared = await (await f.call('/api/studio/prepare', 'POST', manifest)).json() as StudioReceipt
  const legacy = await f.prepare()
  assert.equal(prepared.ticket.split('.')[2], legacy.ticket.split('.')[2])
  assert.equal(f.posts(), 0)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket, 'bob')).status, 401)
  assert.equal((await f.call('/api/studio/jobs', 'POST', { ...input, prompt: 'Different model' }, prepared.ticket)).status, 409)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
  assert.equal(f.posts(), 0)
  assert.equal((await f.call('/api/studio/jobs', 'POST', input, prepared.ticket)).status, 202)
  assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
})

test('known pre-acceptance rejections persist their exact safe category through polling and cloud recovery', async () => {
  const cases = [
    [409, 'Serwer wykonuje poprzedni model. Poczekaj na wynik lub anuluj tamto zlecenie.', 'ORACLE_BUSY'],
    [409, 'Na serwerze zostalo mniej niz 2 GB wolnego miejsca.', 'STORAGE_FULL'],
    [409, 'Osiagnieto limit 300 zlecen. Zarchiwizuj modele na serwerze przed dalsza praca.', 'JOB_CAPACITY'],
    [409, 'Identyfikator zlecenia jest juz zajety. Sprobuj ponownie.', 'ORACLE_SUBMISSION_REJECTED'],
    [409, 'PRIVATE fixture credential and unknown capacity explanation', 'ORACLE_SUBMISSION_REJECTED'],
    [409, 'PRIVATE'.repeat(2000), 'ORACLE_SUBMISSION_REJECTED'],
    [400, 'Nieprawidlowe dane zadania.', 'ORACLE_SUBMISSION_REJECTED'],
    [422, 'PRIVATE provider explanation', 'ORACLE_SUBMISSION_REJECTED'],
    [429, 'PRIVATE proxy rate limit', 'RATE_LIMITED'],
  ] as const
  for (const [status, message, code] of cases) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    f.rejectSubmission(status, { error: message })
    const rejected = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(rejected.status, status)
    assert.equal((await rejected.json() as { error: string }).error, STUDIO_FAILURE_DETAILS[code])
    for (let repeat = 0; repeat < 2; repeat++) {
      const poll = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
      assert.equal(poll.job.state, 'failed'); assert.equal(poll.job.failureCode, code)
      assert.doesNotMatch(JSON.stringify(poll), /PRIVATE|Serwer|Osiagnieto|Na serwerze/)
    }
    const current = await (await f.call('/api/studio/current')).json() as { current: { failureCode: string; financialState: string } }
    assert.equal(current.current.financialState, 'failed'); assert.equal(current.current.failureCode, code)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    assert.equal(f.posts(), 1)
  }
})

test('failed operator allowance reservation stores a safe cause before any Oracle submission', async () => {
  for (const transport of [false, true]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    f.env.GENERATION_BUDGET = { idFromName: name => name, get: () => ({ async fetch(request) {
      if (new URL(request.url).pathname === '/status') return Response.json({ used: 0, limit: null, remaining: null, unlimited: true, enabled: true })
      if (transport) throw new Error('PRIVATE fixture transport interruption')
      return Response.json({ allowed: false }, { status: 503 })
    } }) }
    assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 503)
    const current = await (await f.call('/api/studio/current')).json() as { current: { failureCode: string } }
    assert.equal(current.current.failureCode, 'STUDIO_ALLOWANCE_UNAVAILABLE')
    const poll = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(poll.job.failureCode, 'STUDIO_ALLOWANCE_UNAVAILABLE')
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal(f.posts(), 0)
  }
})

test('unknown Oracle 503 or transport loss remains uncertain and cannot falsely release a hold', async () => {
  for (const transport of [false, true]) {
    const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
    if (transport) f.lose(); else f.rejectSubmission(503, { error: 'PRIVATE: acceptance unknown' })
    const response = await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
    assert.equal(response.status, 202)
    const result = await response.json() as { job: StudioJob }
    assert.equal(result.job.state, 'pending'); assert.equal(result.job.failureCode, undefined)
    const current = await (await f.call('/api/studio/current')).json() as { current: { financialState: string; failureCode?: string } }
    assert.equal(current.current.financialState, 'reserved'); assert.equal(current.current.failureCode, undefined)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    assert.equal(f.posts(), 1)
  }
})

test('worker cancellation has a durable safe reason and releases the existing hold once', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket); f.cancel()
  for (let repeat = 0; repeat < 2; repeat++) {
    const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(result.job.state, 'failed'); assert.equal(result.job.failureCode, 'ORACLE_CANCELLED')
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
  }
  const current = await (await f.call('/api/studio/current')).json() as { current: { failureCode: string } }
  assert.equal(current.current.failureCode, 'ORACLE_CANCELLED')
  assert.equal(f.posts(), 1)
})

test('missing-submission fence wins against an original POST still awaiting admission and prevents its late paid dispatch', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  let release!: () => void
  f.healthGate(new Promise<void>(resolve => { release = resolve }))
  const previousHealthReads = f.healthReads()
  const lateSubmission = f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  while (f.healthReads() === previousHealthReads) await new Promise(resolve => setImmediate(resolve))
  const now = Date.now
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    f.missing()
    const closed = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(closed.job.state, 'failed'); assert.equal(closed.job.failureCode, 'MISSING_SUBMISSION')
    release()
    const late = await (await lateSubmission).json() as { job: StudioJob }
    assert.equal(late.job.state, 'failed'); assert.equal(late.job.failureCode, 'MISSING_SUBMISSION')
    assert.equal(f.posts(), 0)
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4500)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 0)
    const budget = f.env.GENERATION_BUDGET!.get(f.env.GENERATION_BUDGET!.idFromName('worldifact-generation-budget-v1'))
    assert.equal((await (await budget.fetch(new Request('https://budget.internal/status'))).json() as { used: number }).used, 0)
    assert.deepEqual(await (await f.call('/api/studio/current')).json(), { current: null }, 'Fencing cannot invent or replace the cloud-current pointer')
  } finally { release(); await lateSubmission; Date.now = now }
})

test('a fresh reservation winning during an old receipt Oracle 404 stays pending and can complete exactly once', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  let release!: () => void
  f.missing(); f.statusGate(new Promise<void>(resolve => { release = resolve }))
  const now = Date.now
  let polling: Promise<Response> | undefined
  try {
    Date.now = () => now() + STUDIO_SUBMISSION_GRACE_MS + 1000
    polling = f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
    while (!f.statusReads()) await new Promise(resolve => setImmediate(resolve))
    assert.equal((await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)).status, 202)
    release()
    const observed = await (await polling).json() as { job: StudioJob }
    assert.equal(observed.job.state, 'pending'); assert.equal(observed.job.failureCode, undefined)
    assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
    assert.equal(f.posts(), 1)
    f.missing(false); f.statusGate(undefined)
    const completed = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
    assert.equal(completed.job.state, 'succeeded')
    assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
    assert.equal(f.posts(), 1)
  } finally { release(); await polling; Date.now = now }
})


test('a retained unfinished Oracle draft is never charged as a completed model even when its GLB passes', async () => {
  const f = fixture(); await f.subscribe()
  const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.quality(); f.dense()
  const first = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(first.job.state, 'failed'); assert.equal(first.job.failureCode, 'ORACLE_JOB_INCOMPLETE')
  assert.equal(f.artifacts(), 0); assert.equal(f.posts(), 1); assert.equal(f.qualityReads(), 1)
  const account = await entitlementStatus(f.env, alice)
  assert.equal(account.credits, 4500); assert.equal(account.reservedCredits, 0)
  const repeat = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(repeat.job.failureCode, 'ORACLE_JOB_INCOMPLETE'); assert.equal(f.qualityReads(), 1)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}/model`, 'GET', undefined, receipt.ticket)).status, 403)
})

test('retained draft quality evidence preserves a known cost stop without exposing private diagnostics', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.quality({ agentUsage: { completed: false, error_code: 'WORLDIFACT_ASTRA_COST_GUARD', last_error: 'PRIVATE_PROVIDER_DATA' } })
  const response = await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)
  const text = await response.text(); assert.doesNotMatch(text, /PRIVATE_PROVIDER_DATA/)
  assert.equal(JSON.parse(text).job.failureCode, 'ASTRA_COST_LIMIT')
})

test('unavailable or inconsistent draft evidence remains uncertain until the same job can be verified', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.quality(); f.qualityFailure(true)
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).status, 502)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250)
  f.qualityFailure(false); f.quality({ modelStatus: 'reviewed', automaticQualityAccepted: true })
  assert.equal((await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).status, 502)
  assert.equal((await entitlementStatus(f.env, alice)).reservedCredits, 250); assert.equal(f.posts(), 1)
})


test('an explicitly finished unreviewed standard draft keeps structural model delivery semantics', async () => {
  const f = fixture(); await f.subscribe(); const receipt = await f.prepare()
  await f.call('/api/studio/jobs', 'POST', input, receipt.ticket)
  f.quality({ agent: { finished: true, accepted: false }, agentUsage: { completed: true }, visualReview: { assessment_completed: true, accepted: false, status: 'needs_revision' } })
  const result = await (await f.call(`/api/studio/jobs/${receipt.id}`, 'GET', undefined, receipt.ticket)).json() as { job: StudioJob }
  assert.equal(result.job.state, 'succeeded'); assert.equal(f.artifacts(), 1); assert.equal(f.posts(), 1)
  assert.equal((await entitlementStatus(f.env, alice)).credits, 4250)
})
