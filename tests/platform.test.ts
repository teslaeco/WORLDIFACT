import test from 'node:test';
import assert from 'node:assert/strict';
import { ORACLE_WORLD_IDS, platformApi, oracleOrigin } from '../server/platform.ts';

const token = 'owner_'.padEnd(40, 'x');
const env = { OWNER_ACCESS_TOKEN: token, OPENAI_API_KEY: 'secret-key', ORACLE_ENDPOINT: 'https://sample-connection.trycloudflare.com',
  ORACLE_API_TOKEN: 'private-oracle-credential', GENERATION_LIMITER: { limit: async () => ({ success: true }) } };
const request = (code = token, origin = 'https://worldifact.test') => new Request('https://worldifact.test/api/platform/check', {
  method: 'POST', headers: { Origin: origin, 'X-WORLDIFACT-Owner': code },
});

const oracleHealth = { ready: true, provider: 'openai', model: 'gpt-6-astra', connectorVersion: 33, characterStandard: 20 };

test('public status does not contact providers or disclose credentials and endpoints', async () => {
  const r = await platformApi(new Request('https://worldifact.test/api/platform'), env, (() => { throw Error('No network expected'); }) as typeof fetch);
  const text = await r.text();
  for (const secret of [token, env.OPENAI_API_KEY, env.ORACLE_API_TOKEN, env.ORACLE_ENDPOINT]) assert.ok(!text.includes(secret));
  assert.equal(JSON.parse(text).openai, 'KEY_CONFIGURED');
});

test('one read-only Oracle health check is shared across all five worlds', async () => {
  const paths: string[] = [];
  const limiterKeys: string[] = [];
  const fetcher = (async (input, init) => {
    paths.push(String(input));
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, `Bearer ${env.ORACLE_API_TOKEN}`);
    return Response.json(oracleHealth);
  }) as typeof fetch;
  const response = await platformApi(new Request('https://worldifact.test/api/platform/oracle-worlds', {
    headers: { 'CF-Connecting-IP': '203.0.113.7' },
  }), { ...env, GENERATION_LIMITER: { limit: async ({ key }) => { limiterKeys.push(key); return { success: true }; } } }, fetcher);
  assert.equal(response.status, 200);
  const result = await response.json() as { oracle: string; connectorVersion: number; characterStandard: number; provider: string; model: string; worlds: { id: string; oracle: string }[]; evidence: string };
  assert.equal(result.oracle, 'CONNECTOR_READY');
  assert.equal(result.connectorVersion, 33);
  assert.equal(result.characterStandard, 20);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-6-astra');
  assert.deepEqual(result.worlds.map(item => item.id), [...ORACLE_WORLD_IDS]);
  assert.ok(result.worlds.every(item => item.oracle === 'CONNECTOR_READY'));
  assert.deepEqual(paths, [env.ORACLE_ENDPOINT + '/v1/health']);
  assert.deepEqual(limiterKeys, ['oracle-worlds:203.0.113.7']);
  assert.match(result.evidence, /No generation, render or job was requested/);
});

test('five-world Oracle bridge fails closed without secrets or limiter', async () => {
  const noFetch = (() => { throw Error('No network expected'); }) as typeof fetch;
  const missing = await platformApi(new Request('https://worldifact.test/api/platform/oracle-worlds'), {}, noFetch);
  assert.equal(missing.status, 503);
  const body = await missing.json() as { worlds: { id: string; oracle: string }[] };
  assert.deepEqual(body.worlds.map(item => item.id), [...ORACLE_WORLD_IDS]);
  assert.ok(body.worlds.every(item => item.oracle === 'NOT_CONFIGURED'));
  assert.equal((await platformApi(new Request('https://worldifact.test/api/platform/oracle-worlds'), { ...env, GENERATION_LIMITER: undefined }, noFetch)).status, 503);
  assert.equal((await platformApi(new Request('https://worldifact.test/api/platform/oracle-worlds'), { ...env, GENERATION_LIMITER: { limit: async () => ({ success: false }) } }, noFetch)).status, 429);
});

test('owner checks reject missing configuration, bad access, wrong origin and exhausted limiter', async () => {
  const noFetch = (() => { throw Error('No network expected'); }) as typeof fetch;
  assert.equal((await platformApi(request(), {}, noFetch)).status, 503);
  assert.equal((await platformApi(request('wrong'), env, noFetch)).status, 401);
  assert.equal((await platformApi(request(token, 'https://other.test'), env, noFetch)).status, 403);
  assert.equal((await platformApi(request(), { ...env, GENERATION_LIMITER: { limit: async () => ({ success: false }) } }, noFetch)).status, 429);
});

test('authorized checks use GET metadata and health only', async () => {
  const paths: string[] = [];
  const fetcher = (async (input, init) => {
    paths.push(String(input)); assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'manual');
    return Response.json(paths.length === 1 ? { object: 'model', id: 'gpt-6-astra' } : oracleHealth);
  }) as typeof fetch;
  const result = await (await platformApi(request(), env, fetcher)).json() as Record<string, unknown>;
  assert.equal(result.openai, 'MODEL_ACCESS_VERIFIED'); assert.equal(result.oracle, 'CONNECTOR_READY');
  assert.deepEqual(paths, ['https://api.openai.com/v1/models/gpt-6-astra', env.ORACLE_ENDPOINT + '/v1/health']);
});

test('Oracle URLs reject arbitrary hosts, private networks and credential redirects', async () => {
  for (const value of ['http://localhost', 'https://127.0.0.1', 'https://evil.test', 'https://a.trycloudflare.com@evil.test', 'https://a.trycloudflare.com/?key=x']) assert.equal(oracleOrigin(value), null);
  let calls = 0;
  const redirect = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: 'https://evil.test' } }); }) as typeof fetch;
  const result = await (await platformApi(request(), env, redirect)).json() as Record<string, unknown>;
  assert.equal(calls, 2); assert.equal(result.openai, 'CHECK_FAILED'); assert.equal(result.oracle, 'CHECK_FAILED');
});

test('HTML, malformed and oversized connector responses do not imply readiness', async () => {
  const malformed = [
    new Response('<html>login</html>'),
    Response.json({ ready: true }),
    Response.json({ ...oracleHealth, provider: 'unexpected' }),
    Response.json({ ...oracleHealth, model: 'bad model value' }),
    Response.json({ data: 'x'.repeat(17000) }),
  ];
  for (const r of malformed) {
    const result = await (await platformApi(request(), { ...env, OPENAI_API_KEY: undefined }, (async () => r) as typeof fetch)).json() as Record<string, unknown>;
    assert.notEqual(result.oracle, 'CONNECTOR_READY');
  }
});
