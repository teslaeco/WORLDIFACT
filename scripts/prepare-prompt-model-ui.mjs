/** Reproducible, exact-anchor UI edits on the dedicated review branch only.
 * No credentials, provider calls, billing flags or production changes.
 */
import { readFile, writeFile } from 'node:fs/promises'
const changed = []
async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  let after = before
  const replace = (old, next) => {
    if (after.split(old).length !== 2) throw new Error('Expected one reviewed anchor in ' + path)
    after = after.replace(old, next)
  }
  transform(replace)
  if (after === before) throw new Error('No change in ' + path)
  await writeFile(path, after); changed.push(path)
}
await edit('src/pages/ShopPage.tsx', r => {
  r("import GenerationCostNotice from '../components/GenerationCostNotice'", "import GenerationCostNotice from '../components/GenerationCostNotice'\nimport LiveSolPreview from '../components/LiveSolPreview'")
  r('<DemoShopPreview prompt={fastPrompt} mode="live-fast" allowDownload />', '<LiveSolPreview result={fastResult} prompt={fastPrompt} />')
  r('<div className="shop-internal-only" hidden>\n            <label htmlFor="studio-mode">Generation mode</label>', '<div className="shop-model-picker" role="group" aria-labelledby="studio-mode-label">\n            <label id="studio-mode-label" htmlFor="studio-mode">AI model · Model AI</label>')
  r('<option value="standard">STANDARD · GPT-6 Astra · 250 points</option>', '<option value="standard">GPT-6 ASTRA — 250 points / generation</option>')
  r('>FAST DRAFT · GPT-6 Sol · 50 points</option>', '>GPT-6 SOL — 50 points / paid generation</option>')
  r('          <GenerationCostNotice model={fast ? \'sol\' : \'astra\'} busy={busy} />\n', '')
  r('          <label htmlFor="studio-prompt">Describe your model</label>', '          <GenerationCostNotice model={fast ? \'sol\' : \'astra\'} busy={busy} />\n          <label htmlFor="studio-prompt">Describe your model · Prompt</label>')
})
await edit('src/components/AccountStatusBar.tsx', r => {
  r("setError(e instanceof Error ? e.message : 'Your credits are temporarily unavailable.')", "setError(e instanceof Error && ['AbortError', 'TimeoutError'].includes(e.name) ? 'Credit refresh timed out. Your balance has not been changed. Tap Refresh.' : 'Your credits are temporarily unavailable. Tap Refresh.')")
})
await edit('tests/shop-render-helper.mjs', r => {
  r("      if (id === '../components/GenerationCostNotice') return costNotice", "      if (id === '../components/GenerationCostNotice') return costNotice\n      if (id === '../components/LiveSolPreview') return { __esModule: true, default: ({ prompt }) => React.createElement('span', { 'data-demo-prompt': prompt, 'data-demo-mode': 'live-fast' }, 'LIVE Sol blueprint-derived GLB') }")
})
await edit('src/pages/CreditsPage.tsx', r => {
  r('{Math.floor(Math.max(0, balance.credits) / 50)} credit-funded generations available', '{Math.floor(Math.max(0, balance.credits) / 50)} SOL attempts from points{[\'pro\', \'studio\'].includes(balance.subscription.plan || \'\') ? ` or ${Math.floor(Math.max(0, balance.credits) / 250)} ASTRA attempts` : \'\'} · subject to remaining API budget')
  r('ASTRA checkout activates only after the production worker confirms its hard cost guard. No unbounded ASTRA job is sold.', 'ASTRA purchasing is temporarily paused while the live generation and export check is completed. No payment will be taken for an unavailable plan.')
  r("disabled={!canBuy || member || billing?.plans?.[id]?.checkoutReady !== true}", "disabled={!canBuy || (id !== 'creator' && billing?.plans?.[id]?.checkoutReady !== true) || (!member && billing?.plans?.[id]?.checkoutReady !== true)}")
  r("void checkout('card', { kind: 'subscription', plan: id })", "void checkout(member ? 'portal' : 'card', { kind: 'subscription', plan: id })")
  r("member ? 'Use Manage subscription below'", "member ? 'Manage current subscription'")
})
console.log('Prepared exact UI changes:', changed.join(', '))
