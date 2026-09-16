export interface PlatformEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OWNER_ACCESS_TOKEN?: string;
  ORACLE_ENDPOINT?: string;
  ORACLE_API_TOKEN?: string;
  ENABLE_ORACLE_JOBS?: string;
  GENERATION_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export const ORACLE_WORLD_IDS = [
  'chess-cube-512-ai',
  'terra-fix-iss',
  '8-planets-in-8-days',
  'enchanted-ai-shop',
  'ai-game-lab',
] as const;

const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export function oracleOrigin(value: string | undefined) {
  try {
    const u = new URL(value || '');
    // Match the existing connector contract. Never accept an arbitrary client URL.
    if (u.protocol !== 'https:' || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(u.hostname) ||
      u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) return null;
    return u.origin;
  } catch { return null; }
}

export function platformStatus(env: PlatformEnv) {
  return {
    checkedAt: new Date().toISOString(),
    cloudflare: 'RESPONDING',
    openai: env.OPENAI_API_KEY ? 'KEY_CONFIGURED' : 'NOT_CONFIGURED',
    oracle: oracleOrigin(env.ORACLE_ENDPOINT) && env.ORACLE_API_TOKEN ? 'CONFIGURED_NOT_CHECKED' : 'NOT_CONFIGURED',
    oracleJobs: env.ENABLE_ORACLE_JOBS === 'true' ? 'OWNER_ONLY' : 'BLOCKED',
    ownerChecks: (env.OWNER_ACCESS_TOKEN?.length ?? 0) >= 32 &&
      (env.OWNER_ACCESS_TOKEN?.length ?? 0) <= 256 && !!env.GENERATION_LIMITER,
  };
}

export async function ownerAuthorized(request: Request, expected: string) {
  const supplied = request.headers.get('X-WORLDIFACT-Owner') || '';
  if (supplied.length < 32 || supplied.length > 256) return false;
  const digest = (v: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let delta = 0;
  for (let i = 0; i < aa.length; i++) delta |= aa[i] ^ bb[i];
  return delta === 0;
}

async function smallJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); throw new Error('Invalid response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty response');
  let text = '', size = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); throw new Error('Oversized response'); }
    text += decoder.decode(value, { stream: true });
  }
  const result: unknown = JSON.parse(text + decoder.decode());
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid response');
  return result as Record<string, unknown>;
}

async function readOracleHealth(env: PlatformEnv, fetcher: typeof fetch) {
  const origin = oracleOrigin(env.ORACLE_ENDPOINT);
  if (!origin || !env.ORACLE_API_TOKEN) return { oracle: 'NOT_CONFIGURED' as const };
  try {
    const r = await fetcher(`${origin}/v1/health`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${env.ORACLE_API_TOKEN}`, Accept: 'application/json' },
    });
    const body = await smallJson(r);
    const connectorVersion = body.connectorVersion;
    const characterStandard = body.characterStandard;
    const provider = body.provider;
    const model = body.model;
    if (typeof body.ready !== 'boolean' ||
      typeof connectorVersion !== 'number' || !Number.isSafeInteger(connectorVersion) || connectorVersion < 1 || connectorVersion > 10_000 ||
      (characterStandard !== undefined && (typeof characterStandard !== 'number' || !Number.isSafeInteger(characterStandard) || characterStandard < 1 || characterStandard > 10_000)) ||
      (provider !== undefined && (typeof provider !== 'string' || !['openai', 'ollama'].includes(provider))) ||
      (model !== undefined && (typeof model !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(model))))
      return { oracle: 'INVALID_HEALTH_RESPONSE' as const };
    return {
      oracle: body.ready === true ? 'CONNECTOR_READY' as const : 'CONNECTOR_NOT_READY' as const,
      connectorVersion,
      ...(typeof characterStandard === 'number' ? { characterStandard } : {}),
      ...(typeof provider === 'string' ? { provider } : {}),
      ...(typeof model === 'string' ? { model } : {}),
    };
  } catch {
    return { oracle: 'CHECK_FAILED' as const };
  }
}

export async function platformApi(request: Request, env: PlatformEnv, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname === '/api/platform' && request.method === 'GET') return reply(platformStatus(env));

  if (url.pathname === '/api/platform/oracle-worlds') {
    if (request.method !== 'GET') return reply({ error: 'Use GET' }, 405);
    if (!oracleOrigin(env.ORACLE_ENDPOINT) || !env.ORACLE_API_TOKEN)
      return reply({ checkedAt: new Date().toISOString(), oracle: 'NOT_CONFIGURED',
        worlds: ORACLE_WORLD_IDS.map(id => ({ id, oracle: 'NOT_CONFIGURED' })) }, 503);
    if (!env.GENERATION_LIMITER) return reply({ error: 'Oracle bridge limiter is not configured' }, 503);
    try {
      const key = `oracle-worlds:${request.headers.get('CF-Connecting-IP') || 'unknown-client'}`;
      if (!(await env.GENERATION_LIMITER.limit({ key })).success)
        return reply({ error: 'Please wait before checking Oracle again' }, 429);
    } catch { return reply({ error: 'Check limiter unavailable' }, 503); }
    const health = await readOracleHealth(env, fetcher);
    return reply({
      checkedAt: new Date().toISOString(),
      oracle: health.oracle,
      ...('connectorVersion' in health ? { connectorVersion: health.connectorVersion } : {}),
      ...('characterStandard' in health ? { characterStandard: health.characterStandard } : {}),
      ...('provider' in health ? { provider: health.provider } : {}),
      ...('model' in health ? { model: health.model } : {}),
      worlds: ORACLE_WORLD_IDS.map(id => ({ id, oracle: health.oracle })),
      evidence: 'One authenticated read-only Oracle health check shared by all five WORLDIFACT worlds. No generation, render or job was requested.',
    }, health.oracle === 'CONNECTOR_READY' || health.oracle === 'CONNECTOR_NOT_READY' ? 200 : 502);
  }

  if (url.pathname !== '/api/platform/check') return reply({ error: 'Not found' }, 404);
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  if (request.headers.get('Origin') !== url.origin) return reply({ error: 'Same-origin request required' }, 403);
  if (!platformStatus(env).ownerChecks) return reply({ error: 'Owner diagnostics are not configured' }, 503);
  if (!await ownerAuthorized(request, env.OWNER_ACCESS_TOKEN!)) return reply({ error: 'Owner access required' }, 401);
  try {
    if (!(await env.GENERATION_LIMITER!.limit({ key: 'platform-owner-check' })).success)
      return reply({ error: 'Please wait before checking again' }, 429);
  } catch { return reply({ error: 'Check limiter unavailable' }, 503); }
  let openai = 'NOT_CONFIGURED';
  if (env.OPENAI_API_KEY) {
    try {
      const model = env.OPENAI_MODEL || 'gpt-6-astra';
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(model)) throw new Error('Invalid model');
      const r = await fetcher(`https://api.openai.com/v1/models/${model}`, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, Accept: 'application/json' },
      });
      const body = await smallJson(r);
      openai = body.object === 'model' && body.id === model ? 'MODEL_ACCESS_VERIFIED' : 'INVALID_METADATA';
    } catch { openai = 'CHECK_FAILED'; }
  }
  const oracleHealth = await readOracleHealth(env, fetcher);
  return reply({ checkedAt: new Date().toISOString(), openai, oracle: oracleHealth.oracle,
    evidence: 'Read-only model metadata and connector health. No generation, render or job was requested.' });
}
