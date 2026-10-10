"""Expand the reviewed composer-only correction on the existing PR branch."""
from pathlib import Path
import hashlib

root = Path.cwd()
def replace(path, old, new):
    p = root / path
    s = p.read_text()
    if s.count(old) != 1:
        raise RuntimeError('Unexpected predecessor: ' + path)
    p.write_text(s.replace(old, new))

p = root / 'src/lib/studioDraft.ts'
p.write_text(p.read_text() + '''
/** Only composer fields, never a receipt, price authorization or model result. */
export type ShopDraftSnapshot = Readonly<{
  prompt: string; purpose: string; textureLimit: number; profile: string;
  cheapModel: string; budgetTier: string; deliverable: string; creationMode: string;
  photos: readonly Readonly<{ name: string; view: string; dataUrl: string; textureMaxSize: number }>[];
  dimensions: Readonly<{ xMm: number; yMm: number; zMm: number }>;
  dimensionsEnabled: boolean;
}>

/** A late result may clear only the still-unchanged submitted composer. A new
 * prompt, reference, mode or dimensions must survive that old response. */
export function sameShopDraft(a: ShopDraftSnapshot, b: ShopDraftSnapshot): boolean {
  return a.prompt === b.prompt && a.purpose === b.purpose && a.textureLimit === b.textureLimit &&
    a.profile === b.profile && a.cheapModel === b.cheapModel && a.budgetTier === b.budgetTier &&
    a.deliverable === b.deliverable && a.creationMode === b.creationMode &&
    a.dimensionsEnabled === b.dimensionsEnabled && a.dimensions.xMm === b.dimensions.xMm &&
    a.dimensions.yMm === b.dimensions.yMm && a.dimensions.zMm === b.dimensions.zMm &&
    a.photos.length === b.photos.length && a.photos.every((photo, index) => {
      const other = b.photos[index]
      return photo.name === other.name && photo.view === other.view &&
        photo.dataUrl === other.dataUrl && photo.textureMaxSize === other.textureMaxSize
    })
}
''')
replace('src/pages/ShopPage.tsx', "import { canSubmitNewDraft } from '../lib/studioDraft'", "import { canSubmitNewDraft, sameShopDraft, type ShopDraftSnapshot } from '../lib/studioDraft'")
replace('src/pages/ShopPage.tsx', "  const [prompt, setPrompt] = useState('')", "  const [prompt, setPrompt] = useState('')\n  const submittedComposer = useRef<{ id: string; draft: ShopDraftSnapshot } | null>(null)\n  const [composerCleared, setComposerCleared] = useState(false)")
replace('src/pages/ShopPage.tsx', '  const fast = profile === FAST_DRAFT_PROFILE', '''  const composer = useMemo<ShopDraftSnapshot>(() => ({ prompt, purpose, textureLimit, profile, cheapModel, budgetTier, deliverable, creationMode, photos, dimensions, dimensionsEnabled }), [prompt, purpose, textureLimit, profile, cheapModel, budgetTier, deliverable, creationMode, photos, dimensions, dimensionsEnabled])
  const latestComposer = useRef(composer)
  useEffect(() => { latestComposer.current = composer }, [composer])
  const fast = profile === FAST_DRAFT_PROFILE''')
replace('src/pages/ShopPage.tsx', '  const dismissFinishedJob = async () => {', '''  const resetComposer = () => {
    submittedComposer.current = null
    setPrompt(''); setPhotos([]); setAcceptedBudgetRevision(null); setDimensionsEnabled(false)
    setComposerCleared(true)
  }
  const dismissFinishedJob = async () => {''')
replace('src/pages/ShopPage.tsx', '''    if (!client || !saved || !terminal(job?.state) || operations.current.submit || operations.current.artifact) return
    try {
      await client.dismissCurrent(owner)''', '''    if (!client || !saved || !terminal(job?.state) || operations.current.submit || operations.current.artifact) return
    const selectionEpoch = epoch.current, selectedAccount = testIdentity.current.owner
    operations.current.artifact = true; setArtifactBusy(true)
    try {
      await client.dismissCurrent(owner)
      if (!mounted.current || epoch.current !== selectionEpoch || testIdentity.current.owner !== selectedAccount) return''')
replace('src/pages/ShopPage.tsx', "      setNotice('The finished cloud job was archived. Your description is still here and you can explicitly start a new model.')", "      if (sameShopDraft(latestComposer.current, composer)) resetComposer()\n      setNotice('The previous request is retained in history. Any newer draft is kept. No model, payment or points release was started.')")
replace('src/pages/ShopPage.tsx', "      setError(e instanceof Error ? e.message : 'The finished cloud job could not be dismissed safely.')\n    }\n  }", "      if (mounted.current && epoch.current === selectionEpoch && testIdentity.current.owner === selectedAccount) setError(e instanceof Error ? e.message : 'The finished cloud job could not be dismissed safely.')\n    } finally {\n      operations.current.artifact = false\n      if (mounted.current) setArtifactBusy(false)\n    }\n  }")
replace('src/pages/ShopPage.tsx', '        setSaved(restored); setPrompt(restored.prompt)', "        submittedComposer.current = { id: restored.receipt.id, draft: { ...composer, prompt: restored.prompt, profile: restored.generationProfile || 'standard', deliverable: restored.generationProfile === FAST_DRAFT_PROFILE ? 'procedural-blueprint' : 'detailed-mesh', textureLimit: restored.generationProfile === FAST_DRAFT_PROFILE ? 2048 : composer.textureLimit } }\n        setSaved(restored); setPrompt(restored.prompt)")
replace('src/pages/ShopPage.tsx', '          setSaved(recovered.saved); setPrompt(value => value || recovered.saved.prompt)', "          submittedComposer.current = !composer.prompt && !composer.photos.length ? { id: recovered.saved.receipt.id, draft: { ...composer, prompt: recovered.saved.prompt, profile: recovered.saved.generationProfile || 'standard', deliverable: recovered.saved.generationProfile === FAST_DRAFT_PROFILE ? 'procedural-blueprint' : 'detailed-mesh' } } : null\n          setSaved(recovered.saved); setPrompt(value => value || recovered.saved.prompt)")
replace('src/pages/ShopPage.tsx', '  const applyBlueprint = (result: GenerationResult, submittedPrompt: string, testSlot?: OvernightPanelSlot) => {', '''  useEffect(() => {
    const tracked = submittedComposer.current
    if (!tracked || !saved || tracked.id !== saved.receipt.id || job?.id !== saved.receipt.id ||
        !terminal(job.state) || busy || photoBusy || artifactBusy || accountLoading || !accountOwner ||
        recoveryAccountMismatch || testSavedSlot || testBlueprintSlot) return
    // Consume once even when the next draft was edited. Later polling or a
    // balance refresh cannot erase a draft typed after the terminal response.
    submittedComposer.current = null
    if (sameShopDraft(composer, tracked.draft)) {
      setPrompt(''); setPhotos([]); setAcceptedBudgetRevision(null); setDimensionsEnabled(false)
      setComposerCleared(true)
    }
  }, [saved, job, composer, busy, photoBusy, artifactBusy, accountLoading, accountOwner, recoveryAccountMismatch, testSavedSlot, testBlueprintSlot])

  const applyBlueprint = (result: GenerationResult, submittedPrompt: string, testSlot?: OvernightPanelSlot) => {''')
replace('src/pages/ShopPage.tsx', "          clearPreview(); setFastResult(null); setFastPrompt(''); setDemoPrompt(''); setAcceptedBudgetRevision(null)", "          submittedComposer.current = { id: selected.receipt.id, draft: composer }\n          setComposerCleared(false)\n          clearPreview(); setFastResult(null); setFastPrompt(''); setDemoPrompt(''); setAcceptedBudgetRevision(null)")
replace('src/pages/ShopPage.tsx', "    flags.photos = true; setPhotoBusy(true); setError('')", "    flags.photos = true; setPhotoBusy(true); setError(''); setComposerCleared(false)")
replace('src/pages/ShopPage.tsx', "    if ((prompt || photos.length) && !window.confirm('Clear only the new description and reference images? The displayed model, archive and recovery receipt stay unchanged.')) return\n    setPrompt(''); setPhotos([]); setDeliverable(fast ? 'procedural-blueprint' : 'detailed-mesh'); setError('')", "    resetComposer(); setDeliverable(fast ? 'procedural-blueprint' : 'detailed-mesh'); setError('')")
replace('src/pages/ShopPage.tsx', 'onChange={e => setPrompt(e.target.value)} placeholder=', 'onChange={e => { setPrompt(e.target.value); setComposerCleared(false) }} placeholder=')
replace('src/pages/ShopPage.tsx', 'disabled={busy || photoBusy || !prompt.length} onClick={clearDraft}', 'disabled={busy || photoBusy || (!prompt.length && !photos.length)} onClick={clearDraft}')
replace('src/pages/ShopPage.tsx', '          <div className="shop-composer-tools">', '''          {composerCleared && <p className="shop-composer-reset" role="status">The description and references are cleared. Previous requests, models and point reviews remain saved. Clearing the form does not release held points.</p>}
          <div className="shop-composer-tools">''')
replace('src/pages/ShopPage.tsx', '  const activeReady = runtimeReady && accountReady && !cloudRecoveryPending && !currentRequestMessage', "  const activeReady = runtimeReady && accountReady && !cloudRecoveryPending && !currentRequestMessage\n  const previousFailure = !!savedJob && ['failed', 'cancelled'].includes(savedJob.state) && !preview && !fastResult && !demoPrompt && !busy\n  const PreviewContainer = previousFailure ? 'details' : 'div'")
replace('src/pages/ShopPage.tsx', '      <div className="native-shop-preview">', '''      <PreviewContainer className={`native-shop-preview${previousFailure ? ' shop-previous-failure' : ''}`}>
        {previousFailure && <summary>Previous failed request · saved for review, not a new generation</summary>}''')
replace('src/pages/ShopPage.tsx', '      </div>\n    </section>\n    <PublicModelGallery', '      </PreviewContainer>\n    </section>\n    <PublicModelGallery')
replace('src/lib/generationQuote.ts', '/** Non-binding display only. The server rechecks identity, model and funds atomically. */', '''export type GenerationBalance = { total: number; held: number; available: number }
/** Reject incomplete or inconsistent account amounts instead of inventing funds. */
export function readGenerationBalance(account: unknown): GenerationBalance | undefined {
  const value = object(account)
  if (!integer(value.credits) || !integer(value.reservedCredits) || !integer(value.availableCredits) ||
      value.reservedCredits > value.credits || value.availableCredits !== value.credits - value.reservedCredits) return undefined
  return { total: value.credits, held: value.reservedCredits, available: value.availableCredits }
}
/** Non-binding display only. The server rechecks identity, model and funds atomically. */''')
replace('src/lib/useGenerationQuote.ts', 'import { quoteGeneration, type GenerationQuote, type QuotedModel }', 'import { quoteGeneration, readGenerationBalance, type GenerationBalance, type GenerationQuote, type QuotedModel }')
replace('src/lib/useGenerationQuote.ts', 'export type GenerationQuoteState = { quote: GenerationQuote;', 'export type GenerationQuoteState = { balance?: GenerationBalance; quote: GenerationQuote;')
replace('src/lib/useGenerationQuote.ts', '  return { quote, checking, canRefresh: !!owner && !loading && !busy && !checking, refresh }', '  const balance = !checking && current?.settled && !current.authenticationRequired ? readGenerationBalance(current.account) : undefined\n  return { ...(balance ? { balance } : {}), quote, checking, canRefresh: !!owner && !loading && !busy && !checking, refresh }')
replace('src/pages/ShopPage.tsx', "accountQuote.quote.state === 'credits' && accountQuote.quote.after !== null && accountQuote.quote.points !== null ?", "accountQuote.balance ? `${accountQuote.balance.available.toLocaleString()} pts` : accountQuote.quote.state === 'credits' && accountQuote.quote.after !== null && accountQuote.quote.points !== null ?")
replace('src/components/GenerationCostNotice.tsx', "  const pointsFunded = quote.state === 'credits'", "  const heldPointsBlocked = quote.state === 'blocked' && quote.reason === 'CREDITS_EXHAUSTED' && !!accountQuote.balance?.held\n  const pointsFunded = quote.state === 'credits'")
replace('src/components/GenerationCostNotice.tsx', '    {fundingBlocked && <button', '''    {heldPointsBlocked && <div className="generation-held-points" role="status">
      <p><strong>{accountQuote.balance!.available.toLocaleString()} available points</strong> · {accountQuote.balance!.held.toLocaleString()} held · {accountQuote.balance!.total.toLocaleString()} total.</p>
      <p>New generation has not started. Previous failed requests need a points review; clearing the form or refreshing does not release those holds. Review them before buying more points.</p>
      <a href="/account/generation-funding">Review existing held requests · no new generation</a>
      <button type="button" disabled={!canRefresh} onClick={refresh}>Refresh available points</button>
    </div>}
    {fundingBlocked && <button''')
replace('src/components/GenerationCostNotice.tsx', '      {!fundingBlocked && <div>', '      {!fundingBlocked && !heldPointsBlocked && <div>')
p = root / 'src/pages/ShopPage.css'
p.write_text(p.read_text() + '''
/* A terminal request is history, never the visual state of the next empty form. */
.native-shop .shop-composer-reset { font-size: .86rem; line-height: 1.5; margin: 10px 0; }
.native-shop .shop-previous-failure > summary { cursor: pointer; padding: 8px 0; font-weight: 600; }
.native-shop .shop-previous-failure:not([open]) { padding: 16px 22px; }
''')
replace('tests/shop-draft-lifecycle.test.mjs', "assert.equal(h.byId('studio-prompt').props.value, saved.prompt)", "assert.equal(h.byId('studio-prompt').props.value, '', 'terminal composer resets without deleting the original failed description')\n    assert.equal(JSON.parse(h.storeData.get(clientModule.STUDIO_RECEIPT_KEY)).prompt, saved.prompt)")
p = root / 'tests/shop-draft-lifecycle.test.mjs'
p.write_bytes(p.read_bytes() + (root / 'scripts/shop-composer-regressions.source').read_bytes())
(root / 'tests/shop-draft-reset.test.ts').write_bytes((root / 'scripts/shop-composer-unit.source').read_bytes())
p = root / 'docs/CONTEST_STATUS.md'
s = p.read_text()
prefix = '''## 10 October 2026 — customer composer and held-point recovery

The owner's current screenshots still show CREDITS_EXHAUSTED: 1,190 total,
1,000 held, 190 available; the selected failure is an older request, not proof
of a new post-release execution failure. The engine-only MCC pass below does
not constitute a passed signed-in account flow.

The source correction clears only an unchanged submitted composer after a
confirmed terminal result, keeps edited next drafts, receipts and original
models, and collapses previous failures into a review disclosure. Blocking
quotes now expose validated available/held/total amounts and a direct existing
request-review link instead of promoting another purchase. Reset and quoting
perform no financial mutation, waiver, DELETE, or paid model submission.
The explicit close action still preserves its original receipt before clearing
selection, and protects drafts edited while that operation is pending.

Current holds were not released. The historical fixed four-job waiver covers
7–8 October incidents and must not be repurposed for these later requests.
A changed displayed balance is not proof of verified provider cost. Exact-head
CI and preserving release results must be recorded independently in PR #245.
The current source change is not a claim that this account can generate yet.

'''
index = s.index('## Verified release and real model')
p.write_text(s[:index] + prefix + s[index:])
expected = {
 'docs/CONTEST_STATUS.md':'dc3120d6b0644a36759ac93d62c5e5b69ce67676ea7a0ba565f46a1737b05f7c',
 'src/components/GenerationCostNotice.tsx':'cba9463feb8a7b306280e3a2eb61e34f431b3d953e88f6f907947d9cd4fc9577',
 'src/lib/generationQuote.ts':'85daf95ac5a1604cdb3793a553ff5e14c0507f2e889c1e19c04ac4c865e9e8c5',
 'src/lib/studioDraft.ts':'854109092753b8ef0f019298762b9c6c500b6c2fd1a55c34a410a74095c46fe1',
 'src/lib/useGenerationQuote.ts':'8f497b3b84768395bc81854c426a15d41e60d1d7d473746c1f9f14c72b4a850c',
 'src/pages/ShopPage.css':'ee937740fb1a7d6c1f96b45cfaeae51c1a1c550480896baa2e305032473d4991',
 'src/pages/ShopPage.tsx':'5ac76e681c95c465d6aa24dfd9d3342973aff4fec23e42ae68809efe906b11e4',
 'tests/shop-draft-lifecycle.test.mjs':'ed3d8f5ef05e85f4010ee1307f6f2885e2d116bc90bbf8fb7d886986f4d72f04',
 'tests/shop-draft-reset.test.ts':'797615bae459208747b9e76006e46459e6560fa0139a28cd3acbd7738cf5d4a2',
}
for name, sha in expected.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != sha:
        raise RuntimeError('Unreviewed output bytes: ' + name)
print('Nine exact source files staged; no production or account accessed.')
