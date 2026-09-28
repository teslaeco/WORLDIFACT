"""Apply reviewed integration edits on the isolated review branch, never deploy.
All replacements must match exactly before any output is written. No network.
"""
from pathlib import Path

edits = {}
def read(path):
    if path not in edits: edits[path] = Path(path).read_text()
    return edits[path]
def put(path, text): edits[path] = text
def replace(path, old, new, count=1):
    text = read(path)
    if text.count(old) != count: raise RuntimeError('Review required: ' + path + ' / ' + old[:100])
    put(path, text.replace(old, new))

p = 'server/generationEconomics.ts'
text = read(p); end = text.index('export const PLAN_RESERVES_BPS')
put(p, "import { MODEL_CATALOG, type GenerationModel } from '../src/lib/modelCatalog.ts'\nexport type { GenerationModel } from '../src/lib/modelCatalog.ts'\nexport const MODEL_ECONOMICS = MODEL_CATALOG\n\n" + text[end:])
replace(p, "allowedModels: ['sol'] as const", "allowedModels: ['sol', 'luna', 'terra'] as const")
replace(p, "allowedModels: ['sol', 'astra'] as const", "allowedModels: ['sol', 'luna', 'terra', 'astra'] as const", 2)

p = 'server/entitlements.ts'
put(p, "import { GENERATION_COSTS, isGenerationModel, type GenerationModel } from '../src/lib/modelCatalog.ts'\n" + read(p))
replace(p, "type Job = { profile: GenerationKind;", "type Job = { profile: GenerationKind; model?: GenerationModel;")
replace(p, "generationCosts: { sol: 50; astra: 250 }", "generationCosts: typeof GENERATION_COSTS")
replace(p, "generationCosts: { sol: 50, astra: 250 }", "generationCosts: GENERATION_COSTS")
replace(p, "const id = input.id, profile = input.profile as GenerationKind", "const id = input.id, profile = input.profile as GenerationKind\n        const model = input.model === undefined ? (profile === 'fast' ? 'sol' : 'astra') : input.model\n        if (!isGenerationModel(model) || (profile === 'slow') !== (model === 'astra')) return json({ error: 'Invalid model/profile combination' }, 400)")
replace(p, "existing.profile !== profile\n", "(existing.profile !== profile || (existing.model ?? (existing.profile === 'fast' ? 'sol' : 'astra')) !== model)\n")
replace(p, "          const model = profile === 'fast' ? 'sol' : 'astra'\n", '')
replace(p, "const job: Job = { profile, at: now,", "const job: Job = { profile, model, at: now,")
replace(p, "profile: GenerationKind) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile })", "profile: GenerationKind, model?: GenerationModel) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile, ...(model ? { model } : {}) })")

p = 'server/worker.ts'
put(p, "import { MODEL_CATALOG, blueprintModel, reserveBlueprintMicroUsd, type BlueprintModel } from '../src/lib/modelCatalog.ts';\n" + read(p))
replace(p, '["worldId", "prompt", "image", "mode"].includes(k)', '["worldId", "prompt", "image", "mode", "model"].includes(k)')
replace(p, "  const worldId = requestedWorld as PortalId;", "  const worldId = requestedWorld as PortalId;\n  let selectedModel: BlueprintModel;\n  try { selectedModel = blueprintModel(input.model); }\n  catch { return json({ error: 'Select a supported budget model; Astra uses the guarded Oracle workflow.' }, 400); }")
replace(p, '  const model = fastModel;\n  if (model !== "gpt-6-sol") return json({ error: "FAST model requires review.", requestId }, 503);', '  const model = MODEL_CATALOG[selectedModel].model;')
replace(p, "reserveUserGeneration(env, account.id, requestId, 'fast')", "reserveUserGeneration(env, account.id, requestId, 'fast', selectedModel)")
replace(p, "const worstMicroUsd = inputTokens * 5 + 4000 * 17;", "const worstMicroUsd = reserveBlueprintMicroUsd(selectedModel, inputTokens);")
replace(p, "const ceilingMicroUsd = customerGenerationKind === 'free' ? 150_000 : 350_000;", "const ceilingMicroUsd = Math.min(MODEL_CATALOG[selectedModel].maxProviderCents * 10000, customerGenerationKind === 'free' ? 150_000 : Infinity);")
replace(p, 'GPT-6 Sol created a validated WorldBlueprint and AssetSpec for the FAST path.', 'The selected model created a validated WorldBlueprint and AssetSpec for the FAST path.')
replace(p, 'Keep at most 12 scene objects unless explicitly needed and return English labels.', 'Keep at most 12 scene objects unless explicitly needed and return English labels. For an industrial switchgear or MCC cabinet, use mcc-bay objects: each is a 0.65m wide, 2.25m high modular bay with real control geometry and PBR finishes. Position adjacent bays at 0.65m spacing times scale to form the requested lineup. Do not substitute rocks or sculptures for cabinets. Preserve visible reference layout; inferred details must remain unapproved.')

p = 'src/lib/blueprint.ts'
put(p, "import { MODEL_CATALOG } from './modelCatalog.ts';\n" + read(p))
replace(p, '  "sculpture",\n', '  "sculpture",\n  "mcc-bay",\n')
replace(p, '["gpt-6-sol", "gpt-6-astra"].includes(String(value.model))', 'Object.values(MODEL_CATALOG).some(model => model.model === value.model)')

p = 'src/lib/worldGeometry.ts'
put(p, "import { createMccBay } from './mccGeometry.ts';\nimport { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';\n" + read(p))
replace(p, 'new THREE.BoxGeometry(...(size as [number, number, number]))', 'new RoundedBoxGeometry(...(size as [number, number, number]), 2, Math.min(...size) * .06)')
replace(p, '  if (o.kind === "rover") {', '  if (o.kind === "mcc-bay") {\n    g.add(createMccBay(o.color));\n    return g;\n  }\n  if (o.kind === "rover") {')

p = 'src/lib/generationQuote.ts'
replace(p, "export type QuotedModel = 'sol' | 'astra'", "import { MODEL_CATALOG, type GenerationModel } from './modelCatalog.ts'\nexport type QuotedModel = GenerationModel")
replace(p, "costs.sol !== 50 || costs.astra !== 250", "costs[model] !== MODEL_CATALOG[model].creditsPerGeneration")
replace(p, "const points = model === 'sol' ? 50 : 250", "const points = MODEL_CATALOG[model].creditsPerGeneration")
replace(p, "if (model === 'sol' && !subscription.active", "if (model !== 'astra' && !subscription.active")
replace(p, "points: 50, after: null", "points, after: null")
replace(p, "One funded free SOL attempt: 0 points.", "One funded free draft attempt: 0 points.")

p = 'src/components/GenerationCostNotice.tsx'
put(p, "import { MODEL_CATALOG } from '../lib/modelCatalog'\n" + read(p))
replace(p, "const rate = model === 'sol' ? 50 : 250", "const rate = MODEL_CATALOG[model].creditsPerGeneration")
replace(p, "model === 'sol' ? 'GPT-6 SOL' : 'GPT-6 ASTRA'", "MODEL_CATALOG[model].label")
# Preserve the current compact component's remaining text and callback contract.
put(p, read(p).replace("model === 'sol' ?", "model !== 'astra' ?").replace('free SOL', 'free draft'))

p = 'src/pages/ShopPage.tsx'
put(p, "import { MODEL_CATALOG, type BlueprintModel } from '../lib/modelCatalog'\n" + read(p))
replace(p, "  const fast = profile === FAST_DRAFT_PROFILE", "  const [budgetModel, setBudgetModel] = useState<BlueprintModel>('sol')\n  const fast = profile === FAST_DRAFT_PROFILE")
replace(p, "body: JSON.stringify({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), mode: 'live' })", "body: JSON.stringify({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), mode: 'live', model: MODEL_CATALOG[budgetModel].model, ...(photos[0] ? { image: photos[0].dataUrl } : {}) })")
replace(p, "if (!fastAvailable || photos.length || purpose === 'terrain'", "if (!fastAvailable || photos.length > 1 || purpose === 'terrain'")
replace(p, "fast ? fastAvailable && !photos.length && purpose", "fast ? fastAvailable && photos.length <= 1 && purpose")
replace(p, "if (!files || flags.photos || flags.submit || fast) return", "if (!files || flags.photos || flags.submit) return")
replace(p, "if (photos.length + files.length > 3)", "if (photos.length + files.length > (fast ? 1 : 3))")
replace(p, "await prepareStudioPhoto(file, textureLimit,", "await prepareStudioPhoto(file, fast ? 2048 : textureLimit,")
replace(p, "id=\"studio-mode\" value={profile}", "id=\"studio-mode\" value={fast ? budgetModel === 'sol' ? FAST_DRAFT_PROFILE : budgetModel : 'standard'}")
replace(p, "              const next = generationProfile(e.target.value)", "              if (e.target.value === 'luna' || e.target.value === 'terra') {\n                if (!fastAvailable || photos.length > 1 || purpose === 'terrain') return\n                setBudgetModel(e.target.value); setProfile(FAST_DRAFT_PROFILE); setTextureLimit(2048); return\n              }\n              setBudgetModel('sol')\n              const next = generationProfile(e.target.value)")
put(p, read(p).replace('!fastAvailable || photos.length ||', '!fastAvailable || photos.length > 1 ||').replace('!fastAvailable || !!photos.length ||', '!fastAvailable || photos.length > 1 ||'))
replace(p, 'GPT-6 SOL — 50 points / paid generation</option></select>', 'GPT-6 SOL — 50 points / paid generation</option><option value="luna" disabled={!fastAvailable || photos.length > 1 || purpose === \'terrain\'}>GPT-6 LUNA — 5 points / paid generation</option><option value="terra" disabled={!fastAvailable || photos.length > 1 || purpose === \'terrain\'}>GPT-5.6 TERRA — 60 points / paid generation</option></select>')
replace(p, "<GenerationCostNotice model={fast ? 'sol' : 'astra'}", "<GenerationCostNotice model={fast ? budgetModel : 'astra'}")
replace(p, "if (result.mode !== 'LIVE' || result.provenance !== 'GENERATED')", "if (result.mode !== 'LIVE' || result.provenance !== 'GENERATED' || result.model !== MODEL_CATALOG[budgetModel].model)")
replace(p, "disabled={busy || photoBusy || fast || photos.length >= 3}", "disabled={busy || photoBusy || photos.length >= (fast ? 1 : 3)}")
put(p, read(p).replace("fast ? 'Reference images require the standard quality path'", "fast ? 'Add one reference image · budget mode'").replace('FAST is text-only in this version.', 'Budget mode accepts one reference image.').replace('GPT-6 Sol procedural draft · text-only · usually seconds', 'SOL procedural draft · one reference image').replace("fast ? 'Generate FAST 3D draft · Sol'", "fast ? `Generate one draft · ${MODEL_CATALOG[budgetModel].label}`").replace('FAST · LIVE Sol specification ready.', 'FAST · LIVE selected-model specification ready.'))

p = 'src/components/P0GameLab.tsx'
# Blueprint lab stays a world composer; never silently route a world request into Oracle.
put(p, "import { MODEL_CATALOG, type BlueprintModel } from '../lib/modelCatalog'\n" + read(p))
replace(p, "  const [busy, setBusy] = useState(false)", "  const [budgetModel, setBudgetModel] = useState<BlueprintModel>('sol')\n  const [busy, setBusy] = useState(false)")
# The lab's exact input/markup are reviewed by its dedicated follow-up, not guessed here.
# Remove the preparatory change rather than publish unused state.
put(p, read(p).replace("import { MODEL_CATALOG, type BlueprintModel } from '../lib/modelCatalog'\n", '').replace("  const [budgetModel, setBudgetModel] = useState<BlueprintModel>('sol')\n", ''))

# Existing SSR helper must load actual new shared modules, not fabricate their behavior.
p = 'tests/shop-render-helper.mjs'
put(p, "import * as modelCatalog from '../src/lib/modelCatalog.ts'\n" + read(p))
replace(p, "if (id === '../lib/generationQuote') return generationQuote", "if (id === '../lib/modelCatalog') return modelCatalog\n    if (id === '../lib/generationQuote') return generationQuote")
replace(p, "const modules = { '../config/portals': portals", "const modules = { '../lib/modelCatalog': modelCatalog, '../config/portals': portals")

# Optional legacy mock assertions keep asserting an explicit SOL request, now including its ID.
p = 'tests/shop-draft-lifecycle.test.mjs'
text = read(p)
text = text.replace("'Generate FAST 3D draft · Sol'", "'Generate one draft · GPT-6 Sol'")
put(p, text)

# Never run API requests or change activation in this integration script.
for path, text in edits.items():
    if Path(path).read_text() != text:
        Path(path).write_text(text)
        print('UPDATED', path)
print('Integration edits applied. Run all regression suites before creating a release.')
