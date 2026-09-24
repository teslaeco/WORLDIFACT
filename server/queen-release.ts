// Exact current game avatar; no generated/reduced replacement and no private credentials.
export const QUEEN_DECODED_BYTES = 27_676_800;
export const QUEEN_SHA256 = '1bbc9311605543b459318f212e791d05fbfa5450820e3433c4145d885ee948ba';
export const QUEEN_RELEASE_PATH = `/game-assets/queen-${QUEEN_SHA256}.glb.gz`;
export interface AvatarAssets { fetch(request: Request): Promise<Response> }

export function avatarAcceptsGzip(request: Request) {
  // Cloudflare normalizes the header; preserve the visitor's original negotiation.
  const original = (request as Request & { cf?: { clientAcceptEncoding?: string } }).cf?.clientAcceptEncoding;
  return (original ?? request.headers.get('accept-encoding') ?? '').split(',').some(item => {
    const [name, ...parameters] = item.trim().toLowerCase().split(';');
    const q = parameters.find(parameter => parameter.trim().startsWith('q='));
    return name === 'gzip' && (!q || Number(q.trim().slice(2)) > 0);
  });
}

export async function bundledQueenResponse(request: Request, assets: AvatarAssets, source: string) {
  const assetRequest = new Request(new URL(QUEEN_RELEASE_PATH, request.url), {
    method: request.method, headers: { 'Accept-Encoding': 'identity' }, redirect: 'manual',
  });
  const asset = await assets.fetch(assetRequest);
  const length = Number(asset.headers.get('Content-Length'));
  const type = asset.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (asset.status !== 200 || !['application/gzip', 'application/x-gzip', 'application/octet-stream'].includes(type ?? '') ||
      asset.headers.has('Content-Encoding') || !Number.isSafeInteger(length) || length < 20 || length > 25 * 1024 * 1024 ||
      (request.method !== 'HEAD' && !asset.body)) {
    await asset.body?.cancel(); throw new Error('QUEEN_RELEASE_UNAVAILABLE');
  }
  const gzip = avatarAcceptsGzip(request);
  const headers = new Headers({
    'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=86400',
    'Vary': 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff',
    'X-WORLDIFACT-GLB-Length': String(QUEEN_DECODED_BYTES),
    'X-WORLDIFACT-Avatar': 'Neptune-Queen-current', 'X-WORLDIFACT-Source': source,
    'X-WORLDIFACT-Source-Job': source.slice('Oracle-job:'.length),
    'X-WORLDIFACT-Avatar-Cache': 'STATIC', 'X-WORLDIFACT-Model-SHA256': QUEEN_SHA256,
  });
  if (gzip) { headers.set('Content-Encoding', 'gzip'); headers.set('Content-Length', String(length)); }
  else if (request.method === 'HEAD') headers.set('Content-Length', String(QUEEN_DECODED_BYTES));
  // The release asset was hash-checked BEFORE deployment. Never buffer/compress it
  // in the request isolate. Backpressure/cancellation pass directly to the asset.
  let body = asset.body;
  if (request.method === 'HEAD') { await body?.cancel(); body = null; }
  else if (!gzip) body = body!.pipeThrough(new DecompressionStream('gzip'));
  const init: ResponseInit & { encodeBody: 'manual' } = { status: 200, headers, encodeBody: 'manual' };
  return new Response(body, init);
}
