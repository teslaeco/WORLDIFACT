import { avatarAcceptsGzip, bundledQueenResponse, type AvatarAssets } from './queen-release.ts';
import { oracleOrigin } from './platform.ts';
import type { PlatformEnv } from './platform.ts';

export const NEPTUNE_QUEEN_JOB_ID = '99397623-e45c-48dc-95ec-6f84446a54d5';
export const RAPPER_ARCHIVE_URL = 'https://froge-mpc-2-studio.terraformingplanet.chatgpt.site/models/rapper-v10.glb';
export const MAX_AVATAR_GLB_BYTES = 48 * 1024 * 1024;
export interface AvatarCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}
export interface AvatarContext { waitUntil(promise: Promise<unknown>): void }
function edgeCache(): AvatarCache | undefined {
  return (globalThis as typeof globalThis & { caches?: { default?: AvatarCache } }).caches?.default;
}

async function readGlb(response: Response) {
  const declared = Number(response.headers.get('content-length') || '0');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (response.status !== 200 || !['model/gltf-binary', 'application/octet-stream'].includes(type ?? '') ||
      !Number.isSafeInteger(declared) || declared < 0 || (declared > 0 && declared < 20) || declared > MAX_AVATAR_GLB_BYTES) {
    await response.body?.cancel();
    throw new Error('MODEL_RESPONSE');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MODEL_EMPTY');
  // Allocate once when possible: the original Queen is ~28 MB, not a tiny icon.
  const target = declared ? new Uint8Array(declared) : null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (total + value.byteLength > (declared || MAX_AVATAR_GLB_BYTES)) throw new Error('MODEL_SIZE');
      if (target) target.set(value, total); else chunks.push(value);
      total += value.byteLength;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (total < 20 || (declared && declared !== total)) throw new Error('MODEL_SIZE');
  const bytes = target ?? new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== total) throw new Error('MODEL_INVALID');
  return bytes;
}

function wireResponse(body: ConstructorParameters<typeof Response>[0], headers: Headers) {
  // Cloudflare must not gzip an already compressed representation a second time.
  const init: ResponseInit & { encodeBody: 'manual' } = { status: 200, headers, encodeBody: 'manual' };
  return new Response(body, init);
}

export async function avatarApi(request: Request, env: PlatformEnv & { ASSETS?: AvatarAssets }, fetcher: typeof fetch = fetch,
  storage: AvatarCache | undefined = edgeCache(), context?: AvatarContext) {
  const url = new URL(request.url);
  if (!['/api/avatar/neptune-queen', '/api/avatar/rapper-la'].includes(url.pathname)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'Use GET or HEAD.' }, { status: 405, headers: { 'Cache-Control': 'no-store' } });
  }
  const queen = url.pathname === '/api/avatar/neptune-queen';
  const origin = queen ? oracleOrigin(env.ORACLE_ENDPOINT) : null;
  const unavailable = () => Response.json({ error: queen ? 'Current Neptune Queen avatar is temporarily unavailable.' : 'Rapper avatar is temporarily unavailable.' },
    { status: queen && (!origin || !env.ORACLE_API_TOKEN) ? 503 : 502, headers: { 'Cache-Control': 'no-store' } });
  // Do not let an old cache entry bypass removal of the configured source.
  if (queen && (!origin || !env.ORACLE_API_TOKEN)) return unavailable();
  const source = queen ? `Oracle-job:${NEPTUNE_QUEEN_JOB_ID}` : 'Froge-MPC2:rapper-v10.glb';
  if (queen && env.ASSETS) {
    try { return await bundledQueenResponse(request, env.ASSETS, source); }
    catch { return unavailable(); } // A missing release must not trigger heavy Oracle compression.
  }
  const gzip = avatarAcceptsGzip(request);
  // Canonical, versioned keys; no visitor cookies, tokens or arbitrary query strings.
  const cacheUrl = new URL(url.pathname, url.origin);
  cacheUrl.search = new URLSearchParams({ revision: queen ? NEPTUNE_QUEEN_JOB_ID : 'rapper-v10', encoding: gzip ? 'gzip' : 'identity', transport: '2' }).toString();
  const key = new Request(cacheUrl);
  if (storage) {
    try {
      const hit = await storage.match(key);
      if (hit) {
        const length = Number(hit.headers.get('X-WORLDIFACT-GLB-Length'));
        if (hit.status === 200 && hit.body && hit.headers.get('X-WORLDIFACT-Source') === source &&
            hit.headers.get('Content-Type') === 'model/gltf-binary' &&
            (hit.headers.get('Content-Encoding') ?? 'identity') === (gzip ? 'gzip' : 'identity') &&
            Number.isSafeInteger(length) && length >= 20 && length <= MAX_AVATAR_GLB_BYTES) {
          const headers = new Headers(hit.headers); headers.set('X-WORLDIFACT-Avatar-Cache', 'HIT');
          if (request.method === 'HEAD') { await hit.body.cancel(); return wireResponse(null, headers); }
          return wireResponse(hit.body, headers);
        }
        await hit.body?.cancel();
      }
    } catch { /* Cache unavailability must not prevent the authorized source GET. */ }
  }
  try {
    const upstream = await fetcher(queen ? `${origin}/v1/jobs/${NEPTUNE_QUEEN_JOB_ID}/model` : RAPPER_ARCHIVE_URL, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(60_000),
      headers: queen ? { Accept: 'model/gltf-binary', 'Accept-Encoding': 'identity', Authorization: `Bearer ${env.ORACLE_API_TOKEN}` } : { Accept: 'model/gltf-binary,application/octet-stream', 'Accept-Encoding': 'identity' },
    });
    const bytes = await readGlb(upstream);
    // Transport compression is lossless: geometry, textures and decoded GLB stay exact.
    const payload = gzip ? await new Response(new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer() : bytes;
    const headers = new Headers({
      'Content-Type': 'model/gltf-binary', 'Content-Length': String(payload.byteLength),
      'Cache-Control': 'public, max-age=86400', 'Vary': 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff', 'X-WORLDIFACT-GLB-Length': String(bytes.byteLength),
      'X-WORLDIFACT-Avatar': queen ? 'Neptune-Queen-current' : 'Rapper-archive-v10',
      'X-WORLDIFACT-Source': source, 'X-WORLDIFACT-Avatar-Cache': storage ? 'MISS' : 'BYPASS',
    });
    if (queen) headers.set('X-WORLDIFACT-Source-Job', NEPTUNE_QUEEN_JOB_ID);
    if (gzip) headers.set('Content-Encoding', 'gzip');
    if (storage) {
      // Store only fully validated originals, never HTML, partial bodies or failures.
      const write = storage.put(key, wireResponse(payload, new Headers(headers))).catch(() => {});
      if (context) context.waitUntil(write); else await write;
    }
    return wireResponse(request.method === 'HEAD' ? null : payload, headers);
  } catch { return unavailable(); }
}
