import { oracleOrigin } from './platform.ts';
import type { PlatformEnv } from './platform.ts';

export const NEPTUNE_QUEEN_JOB_ID = '99397623-e45c-48dc-95ec-6f84446a54d5';
export const RAPPER_ARCHIVE_URL = 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/models/rapper-v10.glb';
export const MAX_AVATAR_GLB_BYTES = 48 * 1024 * 1024;
const MAX_GLB_BYTES = MAX_AVATAR_GLB_BYTES;

async function readGlb(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`UPSTREAM_${response.status}`);
  }
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'model/gltf-binary' && type !== 'application/octet-stream') {
    await response.body?.cancel();
    throw new Error('MODEL_TYPE');
  }
  const declared = Number(response.headers.get('content-length') || '0');
  if (declared && (declared < 20 || declared > MAX_GLB_BYTES)) {
    await response.body?.cancel();
    throw new Error('MODEL_SIZE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MODEL_EMPTY');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_GLB_BYTES) {
      await reader.cancel();
      throw new Error('MODEL_SIZE');
    }
    chunks.push(value);
  }
  if (total < 20 || (declared && declared !== total)) throw new Error('MODEL_SIZE');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== total) {
    throw new Error('MODEL_INVALID');
  }
  return bytes;
}

function modelResponse(bytes: Uint8Array, request: Request, avatar: string, source: string) {
  const headers = {
    'Content-Type': 'model/gltf-binary',
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800',
    'X-Content-Type-Options': 'nosniff',
    'X-WORLDIFACT-Avatar': avatar,
    'X-WORLDIFACT-Source': source,
  };
  return request.method === 'HEAD' ? new Response(null, { status: 200, headers }) : new Response(bytes, { status: 200, headers });
}

export async function avatarApi(request: Request, env: PlatformEnv, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  if (!['/api/avatar/neptune-queen', '/api/avatar/rapper-la'].includes(url.pathname)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'Use GET or HEAD.' }, { status: 405, headers: { 'Cache-Control': 'no-store' } });
  }

  if (url.pathname === '/api/avatar/rapper-la') {
    try {
      const upstream = await fetcher(RAPPER_ARCHIVE_URL, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(25_000),
        headers: { Accept: 'model/gltf-binary,application/octet-stream' },
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel();
        throw new Error('REDIRECT');
      }
      const bytes = await readGlb(upstream);
      return modelResponse(bytes, request, 'Rapper-archive-v10', 'Froge-MPC2:rapper-v10.glb');
    } catch {
      return Response.json({ error: 'Rapper avatar is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const origin = oracleOrigin(env.ORACLE_ENDPOINT);
  if (!origin || !env.ORACLE_API_TOKEN) {
    return Response.json({ error: 'Current Neptune Queen avatar is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const upstream = await fetcher(`${origin}/v1/jobs/${NEPTUNE_QUEEN_JOB_ID}/model`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(25_000),
      headers: { Accept: 'model/gltf-binary', Authorization: `Bearer ${env.ORACLE_API_TOKEN}` },
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      throw new Error('REDIRECT');
    }
    const bytes = await readGlb(upstream);
    const response = modelResponse(bytes, request, 'Neptune-Queen-current', `Oracle-job:${NEPTUNE_QUEEN_JOB_ID}`);
    response.headers.set('X-WORLDIFACT-Source-Job', NEPTUNE_QUEEN_JOB_ID);
    return response;
  } catch {
    return Response.json({ error: 'Current Neptune Queen avatar is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
