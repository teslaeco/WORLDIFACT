import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../lib/account'
import { quoteGeneration, type QuotedModel } from '../lib/generationQuote'
import './GenerationCostNotice.css'

type Snapshot = { owner: string; account: unknown; billing: unknown }
export default function GenerationCostNotice({ model, busy = false, detailed = false }: { model: QuotedModel; busy?: boolean; detailed?: boolean }) {
  const { user, loading } = useAccount()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!user || busy) return
    const controller = new AbortController(), owner = user.id
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    const read = async (path: string) => {
      const response = await fetch(path, { cache: 'no-store', redirect: 'error', signal: controller.signal })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
      const text = await response.text()
      if (text.length > 16384) return null
      return JSON.parse(text) as unknown
    }
    Promise.all([read('/api/account/entitlements'), read('/api/billing/status')])
      .then(([account, billing]) => { if (!controller.signal.aborted) setSnapshot({ owner, account, billing }) })
      .catch(() => { if (!controller.signal.aborted) setSnapshot({ owner, account: null, billing: null }) })
      .finally(() => window.clearTimeout(timeout))
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [user?.id, busy, revision])
  const current = user && snapshot?.owner === user.id ? snapshot : null
  const quote = quoteGeneration(model, current?.account, current?.billing, !!user)
  const rate = model === 'luna' ? 15 : model === 'sol' ? 50 : 250
  return <section className="generation-cost-notice" aria-label="Selected model and cost before generation" aria-live="polite">
    <div><strong>{model === 'luna' ? 'GPT-6 LUNA' : model === 'sol' ? 'GPT-6 SOL' : 'GPT-6 ASTRA'}</strong><span>{rate} points / paid generation</span></div>
    <p><b>{loading || busy ? 'Checking current cost…' : quote.points === 0 ? 'This attempt: 0 points, subject to funded free capacity' : quote.points !== null ? `This attempt: ${quote.points} points` : 'Current cost: not yet verified'}</b>{quote.after !== null && !busy && <> · Balance after reservation: <strong>{quote.after} points</strong></>}</p>
    {quote.state === 'blocked' && <p>{quote.message}</p>}
    <details><summary>Model details and billing</summary>
      {quote.state !== 'blocked' && <p>{quote.message}</p>}
      <p>{detailed ? 'Astra works with the existing Blender worker to build an editable model. One job uses one points reservation even when it has several bounded AI/tool steps. All accepted reference views are included. Results require visual review; no procedural substitute or manufacturing approval.' : model !== 'astra' ? 'The selected model creates a validated specification with a lightweight procedural preview. It is not the detailed Oracle mesh workflow.' : 'ASTRA uses one bounded server-side call to create a validated blueprint/specification and a locally derived procedural GAME GLB. The separate multi-call Oracle/Blender mesh workflow remains beta. MAKE still requires validation.'}</p>
      <p>Use once from your points. No automatic batch, model upgrade or card charge. Failed attempts may return points, but API safety reserves are not reset.</p>
      <div><Link to="/account/credits">Plans & one-time prepaid credits →</Link><button type="button" disabled={busy || loading || !user} onClick={() => setRevision(value => value + 1)}>Refresh points</button></div>
    </details>
  </section>
}
