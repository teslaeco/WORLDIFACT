"""Exact-context application integration. No provider, Stripe, SSH or model calls."""
from pathlib import Path
import json
MARK=Path('ops/personal-game-lab-integrated.json')
if MARK.exists():
    print('Personal Game Lab integration already committed.');raise SystemExit(0)
def edit(path,old,new,count=1):
    p=Path(path);s=p.read_text();assert s.count(old)==count,(path,old[:100],s.count(old));p.write_text(s.replace(old,new))
edit('src/pages/PortalPage.tsx', '''  if (app.route === '/shop') return <>
    <ShopPage />
    <details open className="portal-generator-drawer portal-page">
      <summary>Create a world blueprint with GPT-6 Astra</summary>
      <PortalAstraGenerator worldId="enchanted-ai-shop" title="Enchanted AI Shop" />
    </details>
  </>''', "  if (app.route === '/shop') return <ShopPage />")
edit('src/pages/WorkbenchPage.tsx', "import StudioGallery from '../components/StudioGallery'\n", '')
edit('src/pages/WorkbenchPage.tsx', "const P0GameLab = lazy(() => import('../components/P0GameLab'))", "const PersonalGameLab = lazy(() => import('../components/PersonalGameLab'))")
edit('src/pages/WorkbenchPage.tsx', "<><P0GameLab /><StudioGallery compact /></>", "<PersonalGameLab />")
edit('src/App.tsx', "Link, Navigate, Route, Routes", "Link, Navigate, Route, Routes, useLocation")
edit('src/App.tsx', "function AvatarPreload() {\n", "function AvatarPreload() {\n  const { pathname } = useLocation()\n")
edit('src/App.tsx', "if (user) void loadAvatarBytes", "if (user && pathname !== '/lab' && pathname !== '/builder') void loadAvatarBytes")
edit('src/App.tsx', "}, [user?.id])", "}, [user?.id, pathname])")
# Account-scoped metadata shares the established identity-derived DO namespace.
edit('server/entitlements.ts', "import type { BudgetNamespace }", "import { worldStore } from './game-world-store.ts'\nimport type { BudgetNamespace }")
edit('server/entitlements.ts', "      if (path === '/status'", "      const world = await worldStore(request, this.storage, now)\n      if (world) return world\n      if (path === '/status'")
edit('server/worker.ts', 'import { decorApi }', "import { gameWorldApi } from './game-worlds.ts';\nimport { decorApi }")
edit('server/worker.ts', '  const decor = await decorApi', '  const ownedWorld = await gameWorldApi(request, env, fetcher);\n  if (ownedWorld) return ownedWorld;\n  const decor = await decorApi')
# Same points, same provider reserve. The starter example is an allocation, not bonus paid work.
edit('server/generationEconomics.ts', "creator: Object.freeze({ name: 'Creator SOL', amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna'] as const })", "creator: Object.freeze({ name: 'Creator SOL', amountCents: 2999, credits: 1500, allowedModels: ['sol', 'luna', 'astra'] as const })")
edit('server/entitlements.ts', '  billingReview: boolean\n', '  billingReview: boolean\n  creatorAstraRemaining?: number\n')
edit('server/entitlements.ts', 'async function status(storage:', '''const creatorPeriod = (subscription: Subscription) => `creator-astra:${subscription.id}:${subscription.grantId ?? subscription.until}`
async function creatorAstraUsed(storage: EntitlementStorage, subscription: Subscription) {
  const used = await storage.get<number>(creatorPeriod(subscription)) ?? 0
  if (!Number.isSafeInteger(used) || used < 0 || used > 6) throw new Error('Invalid Creator allowance')
  return used
}
async function status(storage:''')
edit('server/entitlements.ts', '    credits, generationCost: 50,', "    creatorAstraRemaining: active(subscription, now) && plan === 'creator' ? 6 - await creatorAstraUsed(storage, subscription!) : 0,\n    credits, generationCost: 50,")
edit('server/entitlements.ts', "          const paid = subscriptionActive || credits > 0", "          const creatorCount = model === 'astra' && plan === 'creator' ? await creatorAstraUsed(storage, subscription!) : null\n          if (creatorCount !== null && creatorCount >= 6) return { allowed: false, reason: 'CREATOR_ASTRA_PERIOD_LIMIT' }\n          const paid = subscriptionActive || credits > 0")
edit('server/entitlements.ts', '          const job: Job =', "          if (creatorCount !== null) await storage.put(creatorPeriod(subscription!), creatorCount + 1)\n          const job: Job =")
edit('src/lib/generationQuote.ts', "!['pro', 'studio'].includes(String(subscription.plan))", "!['creator', 'pro', 'studio'].includes(String(subscription.plan))")
edit('src/lib/generationQuote.ts', 'ASTRA requires an active Pro or Studio plan. A top-up alone does not unlock ASTRA.', 'ASTRA requires an active paid plan, including Creator. A top-up alone does not unlock ASTRA.')
edit('src/lib/generationQuote.ts', "    if (object(plans[String(subscription.plan)]).checkoutReady !== true)", "    if (subscription.plan === 'creator' && (!integer(value.creatorAstraRemaining) || value.creatorAstraRemaining < 1))\n      return { state: 'blocked', points, after: null, message: 'Creator Astra allowance is exhausted or not verified. Up to six funded attempts per paid period; no extra charge is started.' }\n    if (object(plans[String(subscription.plan)]).checkoutReady !== true)")
edit('src/pages/CreditsPage.tsx', 'Free and Creator use GPT-6 Sol. Pro and Studio unlock GPT-6 Astra with higher credit cost and hard provider-spend guards.', 'Free accounts can try Luna and Sol. Creator also supports Astra from the same 1,500 points: try 2 Astra models for 500 points, leaving 1,000 for other work. Astra remains subject to verified runtime availability.')
edit('src/pages/CreditsPage.tsx', "['pro', 'studio'].includes(balance.subscription.plan || '')", "['creator', 'pro', 'studio'].includes(balance.subscription.plan || '')")
edit('src/pages/CreditsPage.tsx', "'30 SOL or 100 LUNA generations','SOL 50 credits · LUNA 15 credits'", "'Try 2 ASTRA + 20 SOL, or use your own mix','LUNA 15 · SOL 50 · ASTRA 250 credits'")
edit('src/pages/CreditsPage.tsx', 'Astra is blocked on this plan so a Sol subscription cannot accidentally spend Astra rates.', '1,500 total points, not extra bonus generations. Maximum 6 funded Astra attempts per paid period. Astra availability requires the same tested cost guard as higher plans.')
edit('src/pages/CreditsPage.tsx', 'On active Pro/Studio, the same credits may fund up to 6 ASTRA generations', 'On active paid plans, 1,500 points fund up to 6 ASTRA attempts; Creator retains its six-attempt period limit')
edit('src/pages/CreditsPage.tsx', 'Detailed ASTRA generation is reserved for Pro and Studio and costs 250 credits per generation.', 'Detailed ASTRA generation is supported by Creator, Pro and Studio at 250 credits per attempt, only when the runtime is verified ready.')
edit('src/pages/ShopPage.tsx', "import GenerationCostNotice", "import { useAccount } from '../lib/account'\nimport { takeGameBrief } from '../lib/gameHandoff'\nimport GenerationCostNotice")
edit('src/pages/ShopPage.tsx', "export default function ShopPage() {", "export default function ShopPage() {\n  const { user: gameOwner } = useAccount()")
edit('src/pages/ShopPage.tsx', "  const [prompt, setPrompt] = useState('')", "  const [prompt, setPrompt] = useState('')\n  useEffect(() => {\n    if (!gameOwner || new URLSearchParams(window.location.search).get('from') !== 'game-lab') return\n    const brief = takeGameBrief(gameOwner.id)\n    if (brief) setPrompt(brief)\n  }, [gameOwner?.id])")
# Existing component tests use real logic, but their harness must recognize new imports.
edit('tests/shop-render-helper.mjs', "import * as generationQuote", "import * as gameHandoff from '../src/lib/gameHandoff.ts'\nimport * as generationQuote")
edit('tests/shop-render-helper.mjs', "      if (id in modules)", "      if (id === '../lib/account') return adapters[id] || { useAccount: () => ({ user: null, loading: false }) }\n      if (id === '../lib/gameHandoff') return gameHandoff\n      if (id in modules)")
edit('tests/generation-economics.test.ts', "modelAllowed('creator', 'astra'), false", "modelAllowed('creator', 'astra'), true")
edit('tests/generation-economics.test.ts', 'Creator remains SOL-only while Astra is reserved for higher paid plans', 'Creator includes funded Astra access without changing provider reserves')
edit('tests/affordable-models.test.ts', "modelAllowed('creator','astra'),false", "modelAllowed('creator','astra'),true")
edit('tests/entitlements.test.ts', 'Creator SOL buys exactly 30 Sol generations and cannot spend credits on Astra', 'Creator can still buy exactly 30 Sol generations without choosing Astra')
edit('tests/entitlements.test.ts', "  assert.equal((await reserveUserGeneration(env, USER, id(), 'slow')).reason, 'ASTRA_PLAN_REQUIRED')", "  assert.equal((await entitlementStatus(env, USER)).creatorAstraRemaining, 6)")
# Native WebMCP, when present, proposes edits only. No external Codex agent is invented.
edit('src/components/PersonalGameLab.tsx', "import GenerationCostNotice", "import { registerWorldTools, type WorldModelContext } from '../lib/gameWorldWebMcp'\nimport GenerationCostNotice")
edit('src/components/PersonalGameLab.tsx', " const input=useRef(emptyGameInput())", " const [mcpStatus,setMcpStatus]=useState('WEBMCP_UNAVAILABLE')\n const input=useRef(emptyGameInput())")
edit('src/components/PersonalGameLab.tsx', " worldRef.current=world\n", " worldRef.current=world\n useEffect(()=>{const controller=new AbortController();const context=(document as unknown as {modelContext?:WorldModelContext}).modelContext;void registerWorldTools(context,()=>worldRef.current,p=>{if(!controller.signal.aborted){setProposal(p);setTab('assistant');setNotice('A WebMCP agent proposed an edit. Review it and press Apply; nothing has changed yet.')}},controller.signal).then(status=>{if(!controller.signal.aborted)setMcpStatus(status)});return()=>controller.abort()},[owner])\n")
edit('src/components/PersonalGameLab.tsx', '<summary>Codex / MCP integration status</summary>', '<summary>Codex / MCP integration status</summary><p>Browser tools: {mcpStatus}. Native WebMCP agents can read this open world and propose local edits for your approval.</p>')
edit('src/components/PersonalGameLab.tsx', 'External agents and arbitrary generated JavaScript are not enabled.', 'A hosted Codex session and arbitrary generated JavaScript are not enabled. Native WebMCP tool registration is feature-detected, never simulated.')
MARK.parent.mkdir(exist_ok=True);MARK.write_text(json.dumps({'revision':1,'paidRequests':0,'scope':'private-worlds-creator-astra-no-runtime-activation'}))
print('Integrated private Game Lab, removed Shop duplicate and enabled funded Creator eligibility. No paid requests.')
