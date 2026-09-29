"""One-time, exact-context integration on the isolated review branch. No providers."""
from pathlib import Path
import json

marker=Path('ops/model-quality-v3-applied.json')
if marker.exists():
    print('Model quality integration already applied; verify current source instead.')
    raise SystemExit(0)
changed=[]
def edit(path, replacements):
    p=Path(path); text=p.read_text()
    for old,new,count in replacements:
        if text.count(old)!=count: raise RuntimeError(f'Expected context changed: {path}: {old[:90]!r} count={text.count(old)} expected={count}')
        text=text.replace(old,new)
    p.write_text(text);changed.append(path)

edit('server/entitlements.ts',[
 ("type PlanId } from './generationEconomics.ts'", "type PlanId, type GenerationModel } from './generationEconomics.ts'",1),
 ("type Job = { profile: GenerationKind;", "type Job = { model?: GenerationModel; profile: GenerationKind;",1),
 ("generationCosts: { sol: 50; astra: 250 }", "generationCosts: { sol: 50; astra: 250; luna?: 15 }",1),
 ("generationCosts: { sol: 50, astra: 250 }", "generationCosts: { sol: 50, astra: 250, luna: 15 }",1),
 ("const id = input.id, profile = input.profile as GenerationKind", "const id = input.id, profile = input.profile as GenerationKind\n        const requestedModel = input.model ?? (profile === 'fast' ? 'sol' : 'astra')\n        if (!['luna', 'sol', 'astra'].includes(String(requestedModel)) || (profile === 'slow') !== (requestedModel === 'astra')) return json({ error: 'Invalid model for generation route' }, 400)\n        const selectedModel = requestedModel as GenerationModel",1),
 ("if (existing) return existing.profile !== profile", "if (existing && (existing.model ?? (existing.profile === 'fast' ? 'sol' : 'astra')) !== selectedModel) return { allowed: false, reason: 'JOB_MODEL_MISMATCH' }\n          if (existing) return existing.profile !== profile",1),
 ("const model = profile === 'fast' ? 'sol' : 'astra'", "const model = selectedModel",1),
 ("const job: Job = { profile, at: now,", "const job: Job = { ...(model === 'luna' ? { model } : {}), profile, at: now,",1),
 ("profile: GenerationKind) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile })", "profile: GenerationKind, model?: GenerationModel) => entitlementCall<Reservation>(env, userId, '/reserve', { id: jobId, profile, ...(model ? { model } : {}) })",1),
])
# Keep the old error reason when a legacy job is replayed across profiles.
p=Path('server/entitlements.ts');s=p.read_text().replace("if (existing && (existing.model ??", "if (existing && existing.profile === profile && (existing.model ??");p.write_text(s)

edit('server/worker.ts',[
 ('import { budgetSettings } from "./budget.ts";', 'import { budgetSettings } from "./budget.ts";\nimport { draftModel, draftReservationMicroUsd, MODEL_CATALOG } from "../src/lib/modelCatalog.ts";',1),
 ('["worldId", "prompt", "image", "mode"]', '["worldId", "prompt", "image", "mode", "model"]',1),
 ('  const worldId = requestedWorld as PortalId;', '  let selectedDraft: "sol" | "luna";\n  try { selectedDraft = draftModel(input.model); }\n  catch { return json({ error: "Choose Luna or Sol for a procedural draft. Astra uses the separate Studio route." }, 400); }\n  const worldId = requestedWorld as PortalId;',1),
 ('  const model = fastModel;\n  if (model !== "gpt-6-sol")', '  const model = MODEL_CATALOG[selectedDraft].model;\n  if (!["gpt-6-sol", "gpt-6-luna"].includes(model))',1),
 ("reserveUserGeneration(env, account.id, requestId, 'fast')", "reserveUserGeneration(env, account.id, requestId, 'fast', selectedDraft)",1),
 ('const worstMicroUsd = inputTokens * 5 + 4000 * 17;', 'const worstMicroUsd = draftReservationMicroUsd(selectedDraft, inputTokens);',1),
 ("const ceilingMicroUsd = customerGenerationKind === 'free' ? 150_000 : 350_000;", "const ceilingMicroUsd = Math.min(customerGenerationKind === 'free' ? 150_000 : 350_000, MODEL_CATALOG[selectedDraft].maxProviderCents * 10_000);",1),
 ('qualityModel: generationReady ? configuredModel : null, maxReferenceImageMb: 6,', 'qualityModel: generationReady ? configuredModel : null, draftModels: generationReady ? ["sol", "luna"] : [], maxReferenceImageMb: 6,',1),
 ('Keep at most 12 scene objects unless explicitly needed and return English labels.', 'For an electrical switchgear or MCC cabinet, prefer one mcc-cabinet object: its reusable detailed kit includes readable displays, controls, warnings and panel seams. Do not replace electrical equipment with a sculpture. Keep at most 12 scene objects unless explicitly needed and return English labels.',1),
 ('"GPT-6 Sol created a validated WorldBlueprint and AssetSpec for the FAST path.', '`'+'${MODEL_CATALOG[selectedDraft].label} created a validated WorldBlueprint and AssetSpec for the FAST path.',1),
 ('no production file, quote or order was generated." });', 'no production file, quote or order was generated.` });',1),
])

edit('src/lib/blueprint.ts',[
 ('  "sculpture",\n', '  "sculpture",\n  "mcc-cabinet",\n',1),
 ('["gpt-6-sol", "gpt-6-astra"].includes', '["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].includes',1),
])
edit('src/lib/worldGeometry.ts',[
 ('import * as THREE from "three";', 'import * as THREE from "three";\nimport { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";\nimport { createMccCabinet } from "./mccCabinet.ts";\nimport { paintedMetal } from "./qualityMaterials.ts";',1),
 ('new THREE.BoxGeometry(...(size as [number, number, number]))', 'new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(...size) * 0.06)',1),
 ('  if (o.kind === "rover") {', '  if (o.kind === "mcc-cabinet") {\n    const cabinet = createMccCabinet(o.color); g.add(cabinet); return g;\n  }\n  if (o.kind === "rover") {',1),
 ('return new THREE.MeshStandardMaterial({ color, metalness, roughness });', 'const mat = paintedMetal(color); mat.metalness = metalness; mat.roughness = roughness; return mat;',1),
])
edit('src/lib/blueprintExport.ts',[
 ("import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'", "import { exportProceduralGlb } from './proceduralGlb.ts'",1),
 ('await new GLTFExporter().parseAsync(group, { binary: true })', 'exportProceduralGlb(group)',1),
])
edit('src/components/LiveSolPreview.tsx',[
 ("  const current = preview?.result === result ? preview : null", "  const current = preview?.result === result ? preview : null\n  const name = result.model === 'gpt-6-luna' ? 'LUNA' : 'SOL'",1),
 ('aria-label="SOL generated blueprint preview"', 'aria-label={`${name} generated blueprint preview`}',1),
 ('label="SOL blueprint-derived 3D model"', 'label={`${name} blueprint-derived 3D model`}',1),
 ("'Building the 3D preview from the returned SOL specification…'", '`Building the 3D preview from the returned ${name} specification…`',1),
 ('<strong>LIVE SOL specification · procedural GAME geometry</strong>', '<strong>LIVE {name} specification · procedural GAME geometry</strong>',1),
 ('download="WORLDIFACT-SOL-generated-blueprint.glb">Download this SOL model · GLB', 'download={`WORLDIFACT-${name}-generated-blueprint.glb`}>Download this {name} model · GLB',1),
])
edit('src/pages/ShopPage.tsx',[
 ("import { Link } from 'react-router-dom'", "import { Link } from 'react-router-dom'\nimport { MODEL_CATALOG, type DraftModel } from '../lib/modelCatalog'",1),
 ("  const [profile, setProfile] = useState<GenerationProfile>('standard')", "  const [profile, setProfile] = useState<GenerationProfile>('standard')\n  const [cheapModel, setCheapModel] = useState<DraftModel>('sol')",1),
 ("JSON.stringify({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), mode: 'live' })", "JSON.stringify({ worldId: 'enchanted-ai-shop', prompt: prompt.trim(), mode: 'live', ...(cheapModel === 'luna' ? { model: cheapModel } : {}) })",1),
 ("        const result = validateGenerationResult(body)", "        const result = validateGenerationResult(body)\n        if (result.model !== MODEL_CATALOG[cheapModel].model) throw new Error('The provider did not honor your selected model. No replacement request was sent.')",1),
 ('<select id="studio-mode" value={profile}', '<select id="studio-mode" value={fast && cheapModel === \'luna\' ? \'luna\' : profile}',1),
 ('              const next = generationProfile(e.target.value)', "              const next = e.target.value === 'luna' ? FAST_DRAFT_PROFILE : generationProfile(e.target.value)\n              setCheapModel(e.target.value === 'luna' ? 'luna' : 'sol')",1),
 ('>GPT-6 SOL — 50 points / paid generation</option></select>', '>GPT-6 SOL — 50 points / paid generation</option><option value="luna" disabled={!fastAvailable || !!photos.length || purpose === \'terrain\'}>GPT-6 LUNA — 15 points / paid generation</option></select>',1),
 ("<GenerationCostNotice model={fast ? 'sol' : 'astra'}", "<GenerationCostNotice model={fast ? cheapModel : 'astra'}",1),
 ("'Generate FAST 3D draft · Sol'", "`Generate ${MODEL_CATALOG[cheapModel].label} draft · ${MODEL_CATALOG[cheapModel].creditsPerGeneration} points or funded free allowance`",1),
 ('<h1>Describe it.<br />See it in 3D.</h1>', '<h1>Describe it.<br />See it in 3D.</h1><p><a href="/compare/mcc/">See the real MCC cabinet comparison: WORLDIFACT and Meshy →</a></p>',1),
])
# Honest generic cheap-path wording; the selected label above and on the button is authoritative.
p=Path('src/pages/ShopPage.tsx');text=p.read_text();text=text.replace('FAST · LIVE Sol specification ready.', 'FAST · selected-model specification ready.').replace('FAST Sol draft could not be generated.', 'The selected model draft could not be generated.').replace('verified LIVE Sol evidence.', 'verified LIVE model evidence.');p.write_text(text)
edit('src/components/GenerationCostNotice.tsx',[
 ("const rate = model === 'sol' ? 50 : 250", "const rate = model === 'luna' ? 15 : model === 'sol' ? 50 : 250",1),
 ("model === 'sol' ? 'GPT-6 SOL' : 'GPT-6 ASTRA'", "model === 'luna' ? 'GPT-6 LUNA' : model === 'sol' ? 'GPT-6 SOL' : 'GPT-6 ASTRA'",1),
])
# Existing long description may live in a collapsed details block.
p=Path('src/components/GenerationCostNotice.tsx');t=p.read_text().replace("model === 'sol' ? 'SOL creates", "model !== 'astra' ? 'The selected model creates");p.write_text(t)
edit('src/components/P0GameLab.tsx',[
 ("import ProjectAttachmentPicker from './ProjectAttachmentPicker'", "import ProjectAttachmentPicker from './ProjectAttachmentPicker'\nimport GenerationCostNotice from './GenerationCostNotice'\nimport { MODEL_CATALOG, type DraftModel } from '../lib/modelCatalog'\nimport { exportProceduralGlb } from '../lib/proceduralGlb'",1),
 ("  const [health, setHealth] = useState<Health>({})", "  const [health, setHealth] = useState<Health>({})\n  const [selectedModel, setSelectedModel] = useState<DraftModel>('sol')",1),
 ("{ worldId: 'ai-game-lab', prompt, image, mode: 'live' }", "{ worldId: 'ai-game-lab', prompt, image, mode: 'live', model: selectedModel }",1),
 ("      const validated = validateGenerationResult(body)", "      const validated = validateGenerationResult(body)\n      if (validated.model !== MODEL_CATALOG[selectedModel].model) throw new Error('The selected model was not honored. No replacement request was made.')",1),
 ("      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')\n", '',1),
 ('await new GLTFExporter().parseAsync(scene, { binary: true })', 'exportProceduralGlb(scene)',1),
 ('        <span className="eyebrow">WORLD INPUT</span>', '        <span className="eyebrow">WORLD INPUT</span>\n        <label>AI model<select value={selectedModel} disabled={busy} onChange={e => { if (e.target.value === "astra") navigate("/shop"); else setSelectedModel(e.target.value as DraftModel) }}><option value="luna">GPT-6 LUNA — 15 points</option><option value="sol">GPT-6 SOL — 50 points</option><option value="astra">GPT-6 ASTRA — 250 points · open detailed Studio</option></select></label>\n        <GenerationCostNotice model={selectedModel} busy={busy} />',1),
 ("'Astra blueprint ready'", "`${MODEL_CATALOG[selectedModel].label} blueprint ready`",1),
 ('`Astra working · ${seconds}s`', '`${MODEL_CATALOG[selectedModel].label} working · ${seconds}s`',1),
 ("'Generate world blueprint · Astra'", '`Generate world blueprint · ${MODEL_CATALOG[selectedModel].label}`',1),
])
edit('src/pages/CreditsPage.tsx',[
 ('30 SOL generations', '30 SOL or 100 LUNA generations',1),
 ('90 SOL or 18 ASTRA generations', '90 SOL, 300 LUNA or 18 ASTRA generations',1),
 ('150 SOL or 30 ASTRA generations', '150 SOL, 500 LUNA or 30 ASTRA generations',1),
 ("'SOL only · 50 credits / generation'", "'SOL 50 credits · LUNA 15 credits'",1),
 ("'SOL 50 credits · ASTRA 250 credits'", "'LUNA 15 · SOL 50 · ASTRA 250 credits'",2),
])
edit('src/App.tsx',[
 ('<Link to="/control">Platform connections</Link>', '<a href="/compare/mcc/">MCC cabinet: Astra and Meshy evidence</a>\n        <Link to="/control">Platform connections</Link>',1),
])
# Fix serializer typing without weakening runtime validation.
edit('src/lib/proceduralGlb.ts', [('o.isSkinnedMesh||o instanceof THREE.InstancedMesh', 'o instanceof THREE.SkinnedMesh||o instanceof THREE.InstancedMesh',1)])
marker.parent.mkdir(exist_ok=True);marker.write_text(json.dumps({'revision':'model-quality-v3','changed':changed,'paidModelRequests':0},indent=2)+'\n')
print('Integrated model routing, affordable quality and comparison. No provider call or payment mutation.')
