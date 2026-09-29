"""One-time, exact-context integration. No provider calls, billing writes or VM changes."""
from pathlib import Path
import json
marker=Path('ops/private-game-lab-integrated.json')
if marker.exists():
    print('Private Game Lab integration already applied.'); raise SystemExit(0)

def edit(path, old, new, count=1):
    p=Path(path); text=p.read_text()
    if text.count(old)!=count: raise RuntimeError('Source context changed: '+path+' :: '+old[:100])
    p.write_text(text.replace(old,new))

edit('src/pages/PortalPage.tsx', '''  if (app.route === '/shop') return <>
    <ShopPage />
    <details open className="portal-generator-drawer portal-page">
      <summary>Create a world blueprint with GPT-6 Astra</summary>
      <PortalAstraGenerator worldId="enchanted-ai-shop" title="Enchanted AI Shop" />
    </details>
  </>''', "  if (app.route === '/shop') return <ShopPage />")
edit('src/App.tsx', "import { Link, Navigate, Route, Routes } from 'react-router-dom'", "import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'")
edit('src/App.tsx', "const HomePage = lazy(async () => import('./pages/HomePage'))", "const PrivateGameLab = lazy(async () => import('./pages/PrivateGameLab'))\nconst HomePage = lazy(async () => import('./pages/HomePage'))")
edit('src/App.tsx', "function AvatarPreload() {\n  const { user } = useAccount()", "function AvatarPreload() {\n  const { pathname } = useLocation()\n  const { user } = useAccount()")
edit('src/App.tsx', "if (user) void loadAvatarBytes('queen')", "if (user && pathname === '/world') void loadAvatarBytes('queen')")
edit('src/App.tsx', '  }, [user?.id])', '  }, [user?.id, pathname])')
edit('src/App.tsx', '<Route path="/lab" element={<WorkbenchPage kind="builder" />} />', '<Route path="/lab" element={<PrivateGameLab />} />')
edit('src/App.tsx', '<Route path="/builder" element={<WorkbenchPage kind="builder" />} />', '<Route path="/builder" element={<PrivateGameLab />} />')
edit('server/worker.ts', 'import { decorApi }', "import { privateWorldApi } from './privateWorldApi.ts';\nimport { decorApi }")
edit('server/worker.ts', '  const decor = await decorApi(request, fetcher);', '  const privateWorld = await privateWorldApi(request, env, fetcher);\n  if (privateWorld) return privateWorld;\n  const decor = await decorApi(request, fetcher);')
edit('server/entitlements.ts', "import type { BudgetNamespace }", "import { privateWorldStore } from './privateWorldStore.ts'\nimport type { BudgetNamespace }")
edit('server/entitlements.ts', "      if (path === '/status' && request.method === 'GET')", "      if (path === '/private-worlds' && request.method === 'POST') return privateWorldStore(request, this.storage, now)\n      if (path === '/status' && request.method === 'GET')")
# Additional authenticated metadata only: existing balances, invoices and originals stay unchanged.
edit('server/generationEconomics.ts', "creator: Object.freeze({ name: 'Creator SOL', amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna'] as const })", "creator: Object.freeze({ name: 'Creator SOL', amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna', 'astra'] as const })")
edit('server/entitlements.ts', '  billingReview: boolean\n}', "  billingReview: boolean\n  creatorAstra: { active: boolean; remaining: number; maximum: 6; recommended: 2; pointsForTwo: 500 }\n}")
edit('server/entitlements.ts', 'async function status(storage: EntitlementStorage, now: number): Promise<EntitlementStatus>', 'async function status(storage: EntitlementStorage, now: number, astraEnabled = false): Promise<EntitlementStatus>')
edit('server/entitlements.ts', "  const plan: PlanId = subscription?.plan ?? 'creator'\n  return {", "  const plan: PlanId = subscription?.plan ?? 'creator'\n  const period = subscription?.grantId ?? `${subscription?.id ?? 'none'}:${subscription?.until ?? 0}`\n  const used = await storage.get<number>(`creator-astra:${period}`) ?? 0\n  if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid Astra period quota')\n  return {\n    creatorAstra: { active: astraEnabled && active(subscription, now), remaining: Math.max(0, 6 - used), maximum: 6, recommended: 2, pointsForTwo: 500 },")
edit('server/entitlements.ts', "  private now: () => number\n  constructor(state: { storage: EntitlementStorage }, _env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now }", "  private now: () => number\n  private astraEnabled: boolean\n  constructor(state: { storage: EntitlementStorage }, env: unknown = {}, now = Date.now) { this.storage = state.storage; this.now = now; this.astraEnabled = !!env && typeof env === 'object' && (env as { ENABLE_ASTRA_PLANS?: string }).ENABLE_ASTRA_PLANS === 'true' }")
edit('server/entitlements.ts', 'storage => status(storage, now)', 'storage => status(storage, now, this.astraEnabled)')
edit('server/entitlements.ts', "          const paid = subscriptionActive || credits > 0", "          const creatorAstra = model === 'astra' && plan === 'creator'\n          const period = subscription?.grantId ?? `${subscription?.id ?? 'none'}:${subscription?.until ?? 0}`\n          const used = creatorAstra ? await storage.get<number>(`creator-astra:${period}`) ?? 0 : 0\n          if (creatorAstra && !this.astraEnabled) return { allowed: false, reason: 'ASTRA_PLAN_REQUIRED' }\n          if (creatorAstra && (!Number.isSafeInteger(used) || used < 0 || used >= 6)) return { allowed: false, reason: 'CREATOR_ASTRA_PERIOD_LIMIT' }\n          const paid = subscriptionActive || credits > 0")
edit('server/entitlements.ts', "          await storage.put(`job:${id}`, job)", "          if (creatorAstra) await storage.put(`creator-astra:${period}`, used + 1)\n          await storage.put(`job:${id}`, job)")
edit('src/lib/generationQuote.ts', "!['pro', 'studio'].includes(String(subscription.plan))", "!['creator', 'pro', 'studio'].includes(String(subscription.plan))")
edit('src/lib/generationQuote.ts', 'ASTRA requires an active Pro or Studio plan. A top-up alone does not unlock ASTRA.', 'ASTRA requires an active Creator, Pro or Studio plan. A top-up alone does not unlock ASTRA.')
edit('src/lib/generationQuote.ts', "    if (object(plans[String(subscription.plan)]).checkoutReady !== true)", "    if (subscription.plan === 'creator' && (object(value.creatorAstra).active !== true || !integer(object(value.creatorAstra).remaining) || Number(object(value.creatorAstra).remaining) < 1))\n      return { state: 'blocked', points, after: null, message: 'Creator ASTRA needs active runtime verification and an unused monthly slot (up to six). Two attempts use 500 of your existing points, not bonus credits.' }\n    if (object(plans[String(subscription.plan)]).checkoutReady !== true)")
# Extend original procedural rendering, not a stock replacement for returned AI object kinds.
edit('src/lib/privateWorld.ts', "'tree' | 'rock' | 'cabin' | 'lamp' | 'crate' | 'asset'", "'tree' | 'rock' | 'cabin' | 'lamp' | 'crate' | 'asset' | 'rover' | 'habitat' | 'solar-array' | 'sculpture' | 'mcc-cabinet'")
edit('src/lib/privateWorld.ts', "['tree','rock','cabin','lamp','crate','asset'].includes", "['tree','rock','cabin','lamp','crate','asset','rover','habitat','solar-array','sculpture','mcc-cabinet'].includes")
edit('src/lib/privateWorld.ts', '  const terrain = v.terrain.map', "  if (entities.filter(e=>e.kind==='asset').length>4 || entities.filter(e=>e.kind==='mcc-cabinet').length>2) throw new Error('Interactive limit: four imported models and two detailed MCC kits per world. Keep larger scenes as separate worlds.')\n  const terrain = v.terrain.map")
edit('src/components/PrivateWorldCanvas.tsx', "import { loadWorldAsset }", "import { createWorldObject } from '../lib/worldGeometry'\nimport type { AssetKind } from '../lib/blueprint'\nimport { loadWorldAsset }")
edit('src/components/PrivateWorldCanvas.tsx', "function primitive(e:WorldEntity):THREE.Group{", "function primitive(e:WorldEntity):THREE.Group{\n  if(['rover','habitat','solar-array','sculpture','mcc-cabinet'].includes(e.kind)) return createWorldObject({...e,kind:e.kind as AssetKind,x:0,z:0,scale:1,rotation:0})")
edit('src/pages/PrivateGameLab.tsx', 'world={ownedBy===owner?world:blankWorld()}', 'world={world}')
# Keep clipboard/state handoff private, never a prompt in a query string.
edit('src/pages/ShopPage.tsx', "import { Link } from 'react-router-dom'", "import { Link, useLocation } from 'react-router-dom'")
edit('src/pages/ShopPage.tsx', 'export default function ShopPage() {', "export default function ShopPage() {\n  const location = useLocation()\n  const pendingCharacter = useRef(typeof location.state?.worldPrompt === 'string' && location.state.worldPrompt.length <= 2000 ? location.state.worldPrompt : '')")
edit('src/pages/ShopPage.tsx', '      if (restored) {', "      if (!restored && pendingCharacter.current) { setPrompt(pendingCharacter.current); setNotice('Character brief copied from your private world. Review model and points before generating.'); pendingCharacter.current = '' }\n      if (restored) {")
# Private API anti-CSRF checks also cover fetch metadata.
edit('server/privateWorldApi.ts', "  if(url.search)return", "  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Same-origin world access required.'},403)\n  if(url.search)return")
marker.parent.mkdir(exist_ok=True)
marker.write_text(json.dumps({'revision':'private-game-lab-v1','paidCalls':0,'astraSalesEnabled':False})+'\n')
print('Integrated private world editing, shop cleanup and guarded Creator Astra eligibility. No paid request.')
