// Isolated native runtime verification. This router is never bundled into the production Worker.
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { fileURLToPath } from 'node:url'
export const IMAGE_FIXTURE_ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export async function imageRuntime(provider, apiKey = 'inert-fixture-key') {
  const bundle = await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), contents: `
    import { AccountEntitlements } from './server/entitlements.ts';
    export class NativeImages {
      constructor(state,env){ this.storage=state.storage; this.ledger=new AccountEntitlements(state,{...env,GENERATION_LIMITER:{limit:async()=>({success:true})}}) }
      async fetch(request){const path=new URL(request.url).pathname;
        if(path==='/fixture-seed'){const values=await request.json();for(const [key,value] of Object.entries(values))await this.storage.put(key,value);return Response.json({seeded:true})}
        if(path==='/fixture-inspect')return Response.json({balance:await this.storage.get('balance'),held:await this.storage.get('customer-reserved-credits:v1')});
        if(path==='/fixture-old-transport'){try{await fetch('https://api.openai.com/v1/images/generations',{method:'POST',redirect:'error'});return Response.json({rejected:false})}catch(error){return Response.json({rejected:error instanceof TypeError && error.message.startsWith('Invalid redirect value')})}}
        return this.ledger.fetch(request);
      }
    }
    export default {fetch(request,env){return env.ACCOUNT_ENTITLEMENTS.get(env.ACCOUNT_ENTITLEMENTS.idFromName('account:v1:${IMAGE_FIXTURE_ACCOUNT}')).fetch(request)}};
  ` }, bundle: true, write: false, format: 'esm', platform: 'neutral' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-14', cf: false,
    script: bundle.outputFiles[0].text, bindings: { OPENAI_API_KEY: apiKey, ENABLE_PAID_GENERATION: 'true' },
    durableObjects: { ACCOUNT_ENTITLEMENTS: { className: 'NativeImages', useSQLite: true } }, outboundService: provider }))
  return { close: () => mf.dispose(), async call(path, body) {
    return mf.dispatchFetch('https://inert.test' + path, { method: body ? 'POST' : 'GET',
      headers: { 'X-WORLDIFACT-Verified-Account': IMAGE_FIXTURE_ACCOUNT, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  } }
}
