import { ORACLE_WORLD_IDS, oracleOrigin, ownerAuthorized } from './platform.ts';
import type { PlatformEnv } from './platform.ts';
import { budgetSettings } from './budget.ts';
import type { BudgetEnv, BudgetNamespace } from './budget.ts';

export interface OracleJobEnv extends PlatformEnv, BudgetEnv {
  ENABLE_ORACLE_JOBS?: string;
  GENERATION_BUDGET?: BudgetNamespace;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const JOB_STATES = new Set(['queued', 'generating', 'retrying', 'building', 'succeeded', 'failed', 'cancelled']);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function boundedJson(response: Response, limit = 16_384): Promise<Record<string, unknown>> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error(`UPSTREAM_${response.status}`); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('UPSTREAM_EMPTY');
  const decoder = new TextDecoder(); let text = '', size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('UPSTREAM_OVERSIZED'); } text += decoder.decode(value, { stream: true }); }
  const value: unknown = JSON.parse(text + decoder.decode());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('UPSTREAM_INVALID');
  return value as Record<string, unknown>;
}
async function inputJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('CONTENT_TYPE');
  if (Number(request.headers.get('content-length')) > 12_000) throw new Error('TOO_LARGE');
  const reader = request.body?.getReader(); if (!reader) throw new Error('INVALID');
  let size = 0, text = ''; const decoder = new TextDecoder();
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 12_000) { await reader.cancel(); throw new Error('TOO_LARGE'); } text += decoder.decode(value, { stream: true }); }
  const value: unknown = JSON.parse(text + decoder.decode());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID');
  return value as Record<string, unknown>;
}
async function oracleFetch(env: OracleJobEnv, path: string, init: RequestInit, fetcher: typeof fetch) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT); if (!origin || !env.ORACLE_API_TOKEN) throw new Error('NOT_CONFIGURED');
  return fetcher(origin + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(25_000), headers: { Accept: 'application/json', Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
}
async function checkedHealth(env: OracleJobEnv, fetcher: typeof fetch) {
  const body = await boundedJson(await oracleFetch(env, '/v1/health', { method: 'GET' }, fetcher));
  if (body.ready !== true || body.provider !== 'openai' || body.model !== 'gpt-6-astra' || typeof body.connectorVersion !== 'number' || !Number.isSafeInteger(body.connectorVersion) || body.connectorVersion < 33) throw new Error('ORACLE_NOT_READY');
  return { connectorVersion: body.connectorVersion };
}
function sanitizedJob(body: Record<string, unknown>, expectedId: string) {
  if (body.id !== expectedId || typeof body.state !== 'string' || !JOB_STATES.has(body.state)) throw new Error('UPSTREAM_INVALID_JOB');
  const detail = typeof body.detail === 'string' ? body.detail.slice(0, 600) : undefined;
  return { id: expectedId, state: body.state, ...(detail ? { detail } : {}) };
}
async function reserveSharedBudget(env: OracleJobEnv) {
  if (!env.GENERATION_BUDGET || !budgetSettings(env)) throw new Error('BUDGET_DISABLED');
  const budget = env.GENERATION_BUDGET.get(env.GENERATION_BUDGET.idFromName('worldifact-generation-budget-v1'));
  const response = await budget.fetch(new Request('https://budget.internal/reserve', { method: 'POST', signal: AbortSignal.timeout(5000) }));
  if (response.status === 429) throw new Error('BUDGET_EXHAUSTED');
  if (!response.ok || (await response.json() as { allowed?: boolean }).allowed !== true) throw new Error('BUDGET_DISABLED');
}

export async function oracleJobApi(request: Request, env: OracleJobEnv, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url); const enabled = env.ENABLE_ORACLE_JOBS === 'true';
  if (url.pathname === '/api/oracle/jobs/status' && request.method === 'GET') {
    return reply({ mode: enabled ? 'OWNER_ONLY' : 'BLOCKED', prompt: 'SUPPORTED', image: 'BLOCKED_UNVERIFIED', requiredConnectorVersion: 33,
      budget: enabled && budgetSettings(env) && env.GENERATION_BUDGET ? 'SHARED_HARD_CAP' : 'BLOCKED',
      note: enabled ? 'Owner-only Oracle prompt jobs require the same absolute pilot budget as WORLDIFACT Astra calls.' : 'Oracle write calls are disabled. Read-only health remains available for all five worlds.' });
  }
  if (!url.pathname.startsWith('/api/oracle/jobs')) return reply({ error: 'Not found' }, 404);
  if (!enabled) return reply({ error: 'Oracle job writes are disabled.' }, 503);
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return reply({ error: 'Same-origin request required.' }, 403);
  if ((env.OWNER_ACCESS_TOKEN?.length ?? 0) < 32 || (env.OWNER_ACCESS_TOKEN?.length ?? 0) > 256) return reply({ error: 'Owner access is not configured.' }, 503);
  if (!await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!)) return reply({ error: 'Owner access required.' }, 401);
  if (!oracleOrigin(env.ORACLE_ENDPOINT) || !env.ORACLE_API_TOKEN) return reply({ error: 'Oracle is not configured.' }, 503);
  if (!env.GENERATION_LIMITER) return reply({ error: 'Oracle job limiter is not configured.' }, 503);
  try {
    const key = `oracle-job:${request.headers.get('CF-Connecting-IP') || 'unknown-client'}`;
    if (!(await env.GENERATION_LIMITER.limit({ key })).success) return reply({ error: 'Please wait before submitting another Oracle request.' }, 429);
  } catch { return reply({ error: 'Oracle job limiter unavailable.' }, 503); }

  const match = /^\/api\/oracle\/jobs\/([a-f0-9-]{36})$/.exec(url.pathname);
  if (match && request.method === 'GET') {
    if (!UUID.test(match[1])) return reply({ error: 'Invalid job id.' }, 400);
    try { const body = await boundedJson(await oracleFetch(env, `/v1/jobs/${match[1]}`, { method: 'GET' }, fetcher)); return reply({ job: sanitizedJob(body, match[1]) }); }
    catch { return reply({ error: 'Oracle job status is unavailable.' }, 502); }
  }
  if (url.pathname !== '/api/oracle/jobs') return reply({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  let input: Record<string, unknown>;
  try { input = await inputJson(request); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'INVALID';
    return reply({ error: message === 'TOO_LARGE' ? 'Request too large.' : message === 'CONTENT_TYPE' ? 'Use application/json.' : 'Invalid request.' }, message === 'TOO_LARGE' ? 413 : message === 'CONTENT_TYPE' ? 415 : 400);
  }
  if (Object.keys(input).some(k => !['worldId', 'id', 'prompt'].includes(k)) || typeof input.worldId !== 'string' || !ORACLE_WORLD_IDS.includes(input.worldId as (typeof ORACLE_WORLD_IDS)[number]) ||
      typeof input.id !== 'string' || !UUID.test(input.id) || typeof input.prompt !== 'string' || input.prompt.trim().length < 3 || input.prompt.length > 2000)
    return reply({ error: 'Use a supported worldId, UUID and a 3–2000 character prompt.' }, 400);
  const worldId = input.worldId, id = input.id, prompt = input.prompt.trim();
  try {
    const health = await checkedHealth(env, fetcher);
    await reserveSharedBudget(env);
    const upstream = await oracleFetch(env, '/v1/jobs', { method: 'POST', body: JSON.stringify({ id, prompt }) }, fetcher);
    if (upstream.status === 409) { await upstream.body?.cancel(); return reply({ error: 'Oracle is busy or rejected this job.' }, 409); }
    if (upstream.status === 429) { await upstream.body?.cancel(); return reply({ error: 'Oracle rate limit reached.' }, 429); }
    const body = await boundedJson(upstream);
    return reply({ worldId, job: sanitizedJob(body, id), connectorVersion: health.connectorVersion,
      evidence: 'Oracle accepted an owner-authorized prompt job under the shared hard pilot ceiling. The browser never received the Oracle endpoint or bearer token.' }, upstream.status === 202 ? 202 : 200);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return reply({ error: code === 'ORACLE_NOT_READY' ? 'Oracle is not ready for the reviewed Astra job contract.' :
      code === 'BUDGET_EXHAUSTED' ? 'The shared Astra pilot request ceiling is exhausted.' :
      code === 'BUDGET_DISABLED' ? 'The shared Astra pilot budget is not enabled.' : 'Oracle job submission failed safely.' }, code.startsWith('BUDGET_') ? (code === 'BUDGET_EXHAUSTED' ? 429 : 503) : 502);
  }
}
