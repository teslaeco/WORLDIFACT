import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleJobApi } from '../server/oracle-jobs.ts';

const owner = 'o'.repeat(40);
const endpoint = 'https://sample-connection.trycloudflare.com';
const oracleToken = 't'.repeat(48);
const env = {
  OWNER_ACCESS_TOKEN: owner,
  ORACLE_ENDPOINT: endpoint,
  ORACLE_API_TOKEN: oracleToken,
  ENABLE_ORACLE_JOBS: 'true',
  GENERATION_LIMITER: { limit: async () => ({ success: true }) },
};
const health = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, characterStandard: 20 };
const id = '123e4567-e89b-42d3-a456-426614174000';

const post = (body: unknown, code = owner, origin = 'https://worldifact.test') => new Request('https://worldifact.test/api/oracle/jobs', {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', 'X-WORLDIFACT-Owner': code, 'CF-Connecting-IP': '203.0.113.9' },
  body: JSON.stringify(body),
});

test('public Oracle job status exposes the safety gate without secrets', async () => {
  const result = await oracleJobApi(new Request('https://worldifact.test/api/oracle/jobs/status'), {
    ...env, ENABLE_ORACLE_JOBS: 'false',
  }, (() => { throw new Error('No network expected'); }) as typeof fetch);
  assert.equal(result.status, 200);
  const text = await result.text();
  assert.match(text, /BLOCKED/);
  assert.match(text, /BLOCKED_UNVERIFIED/);
  assert.ok(!text.includes(endpoint));
  assert.ok(!text.includes(oracleToken));
  assert.ok(!text.includes(owner));
});

test('Oracle writes fail closed while the production gate is disabled', async () => {
  let calls = 0;
  const result = await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build a small rover.' }), {
    ...env, ENABLE_ORACLE_JOBS: 'false',
  }, (async () => { calls++; throw new Error('Unexpected network call'); }) as typeof fetch);
  assert.equal(result.status, 503);
  assert.equal(calls, 0);
});

test('owner-only Oracle writes enforce origin, owner access and limiter before network', async () => {
  const noFetch = (() => { throw new Error('No network expected'); }) as typeof fetch;
  assert.equal((await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build rover.' }, owner, 'https://evil.test'), env, noFetch)).status, 403);
  assert.equal((await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build rover.' }, 'wrong'), env, noFetch)).status, 401);
  assert.equal((await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build rover.' }), {
    ...env, GENERATION_LIMITER: { limit: async () => ({ success: false }) },
  }, noFetch)).status, 429);
});

test('reviewed prompt job checks v33 Astra health then submits only id and prompt', async () => {
  const calls: { url: string; method?: string; body?: string; auth?: string | null }[] = [];
  const fetcher = (async (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined,
      auth: new Headers(init?.headers).get('Authorization') });
    if (calls.length === 1) return Response.json(health);
    return Response.json({ id, state: 'queued' }, { status: 202 });
  }) as typeof fetch;
  const response = await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: '  Build a small rover.  ' }), env, fetcher);
  assert.equal(response.status, 202);
  const body = await response.json() as { worldId: string; connectorVersion: number; job: { id: string; state: string } };
  assert.equal(body.worldId, 'ai-game-lab');
  assert.equal(body.connectorVersion, 33);
  assert.deepEqual(body.job, { id, state: 'queued' });
  assert.equal(calls[0].url, endpoint + '/v1/health');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].url, endpoint + '/v1/jobs');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body || '{}'), { id, prompt: 'Build a small rover.' });
  assert.ok(calls.every(call => call.auth === `Bearer ${oracleToken}`));
});

test('job submission rejects unsupported worlds, images and unreviewed connector metadata', async () => {
  const noFetch = (() => { throw new Error('No network expected'); }) as typeof fetch;
  assert.equal((await oracleJobApi(post({ worldId: 'unknown', id, prompt: 'Build rover.' }), env, noFetch)).status, 400);
  assert.equal((await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build rover.', image: 'not-supported' }), env, noFetch)).status, 400);
  const old = (async () => Response.json({ ...health, connectorVersion: 32 })) as typeof fetch;
  const rejected = await oracleJobApi(post({ worldId: 'ai-game-lab', id, prompt: 'Build rover.' }), env, old);
  assert.equal(rejected.status, 502);
  assert.match((await rejected.json() as { error: string }).error, /not ready/);
});

test('owner can poll an existing Oracle job without exposing connector secrets', async () => {
  const fetcher = (async (input, init) => {
    assert.equal(String(input), endpoint + '/v1/jobs/' + id);
    assert.equal(init?.method, 'GET');
    return Response.json({ id, state: 'building', detail: 'Blender is building geometry.' });
  }) as typeof fetch;
  const request = new Request('https://worldifact.test/api/oracle/jobs/' + id, {
    headers: { 'X-WORLDIFACT-Owner': owner, 'CF-Connecting-IP': '203.0.113.9' },
  });
  const response = await oracleJobApi(request, env, fetcher);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /building/);
  assert.ok(!text.includes(endpoint));
  assert.ok(!text.includes(oracleToken));
});
