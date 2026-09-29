"""One-off, exact-base integration in the review branch only. No deployment or model calls."""
from pathlib import Path
import re

def edit(path, transform):
    file=Path(path); before=file.read_text(); after=transform(before)
    if before==after: raise RuntimeError('No change in '+path)
    file.write_text(after)

def rep(text,old,new):
    if text.count(old)!=1: raise RuntimeError('Expected one integration anchor: '+old[:160])
    return text.replace(old,new,1)

if Path('ops/editor-polish-integrated.json').exists():
    print('Already integrated. No files changed.'); raise SystemExit(0)

# Preserve legacy worlds; assetId is an optional, validated account-local reference.
def world(text):
    text=rep(text,'entities: 48, terrain: 64, bytes: 65536','entities: 4096, terrain: 128, bytes: 98304')
    text=rep(text,"export type WorldCharacter = { description:","export type WorldCharacter = { assetId?: string | null; description:")
    text=rep(text,"keys(c, ['description','outfit','hair','style','label','hairColor','outfitColor'])","keys(c, ['description','outfit','hair','style','label','hairColor','outfitColor','assetId'])")
    text=rep(text,"  if (entities.filter(e=>e.kind==='asset').length>4 || entities.filter(e=>e.kind==='mcc-cabinet').length>2) throw new Error('Interactive limit: four imported models and two detailed MCC kits per world. Keep larger scenes as separate worlds.')\n",'')
    text=rep(text,'character: { description: text(c.description,800)',"character: { ...(c.assetId === undefined ? {} : { assetId: c.assetId === null ? null : id(c.assetId) }), description: text(c.description,800)")
    return text
edit('src/lib/privateWorld.ts',world)
edit('src/lib/privateWorldAssets.ts',lambda t:rep(rep(rep(t,'owned.length >= 12 || owned.reduce','owned.reduce'),'150_000_000','350_000_000'),'Device library limit: 12 models / 150 MB. Originals remain in your gallery.','This device library reached its 350 MB storage budget. No per-model count limit; originals remain in your gallery.'))

# Controls connect to the real scene, not a detached demo.
def canvas(t):
    t=rep(t,"import { OrbitControls }", "import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'\nimport { attachEditorTransforms } from '../lib/editorTransforms'\nimport { createCharacterPreview } from '../lib/characterPreview'\nimport { fitsPreview, sumPreview, type PreviewCost } from '../lib/previewBudget'\nimport type { EntityTransform, TransformMode } from '../lib/editorTools'\nimport { OrbitControls }")
    t=rep(t,'onMessage:(message:string)=>void }','onMessage:(message:string)=>void; transformMode?:TransformMode; snap?:number; focusVersion?:number; focusCharacterVersion?:number; onTransform?:(id:string,value:EntityTransform)=>void }')
    start=t.index('function avatar(world:PrivateWorld)'); end=t.index('export default function PrivateWorldCanvas',start)
    t=t[:start]+"function avatar(world:PrivateWorld){return createCharacterPreview(world.character)}\n"+t[end:]
    t=rep(t,"const cached=new Map<string,THREE.Group>(),pending=new Set<string>();let previousCharacter=''", "const cached=new Map<string,THREE.Group>(),pending=new Set<string>(),assetCosts=new Map<string,PreviewCost>();let loadedBytes=0,inflightBytes=0,previousCharacter='',terrainSignature='',lastFocus=-1,lastCharacterFocus=-1\n    let mixer:THREE.AnimationMixer|null=null\n    const transforms=attachEditorTransforms(camera,renderer.domElement,scene,items,orbit,()=>latest.current)\n    const focus=(object:THREE.Object3D)=>{const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()),span=Math.max(4,box.getSize(new THREE.Vector3()).length()*1.4);orbit.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(span*.65,span*.55,span));orbit.update()}\n    const costOf=(object:THREE.Object3D):PreviewCost=>{let triangles=0,draws=0;object.traverse(o=>{if(o instanceof THREE.Mesh){triangles+=Math.floor((o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3)*(o instanceof THREE.InstancedMesh?o.count:1);draws+=Math.max(1,o.geometry.groups.length)}});return {triangles,draws,bytes:0}}\n    const disposePlayer=()=>{mixer?.stopAllAction();mixer=null;scene.remove(player);if(!player.userData.sharedAsset)release(player)}")
    t=rep(t,'      const p=earthGeo.attributes.position;',"      const terrainKey=JSON.stringify(world.terrain);if(terrainKey!==terrainSignature){terrainSignature=terrainKey;\n      const p=earthGeo.attributes.position;")
    t=rep(t,'grass.instanceMatrix.needsUpdate=true\n      for(const child', 'grass.instanceMatrix.needsUpdate=true\n      }\n      transforms.beforeRebuild()\n      for(const child')
    t=rep(t,"      const assetCount=world.entities.filter(e=>e.kind==='asset').length\n      for(const e of world.entities){", "      let previewCost:PreviewCost={triangles:0,draws:0,bytes:0},proxyCount=0\n      const ordered=[...world.entities].sort((a,b)=>Number(b.id===latest.current.selected)-Number(a.id===latest.current.selected))\n      for(const e of ordered){")
    t=rep(t,'const asset=e.assetId?cached.get(e.assetId):null','const knownAsset=e.assetId?cached.get(e.assetId):null\n        const asset=knownAsset&&fitsPreview(previewCost,assetCosts.get(e.assetId!)??{triangles:0,draws:0,bytes:0})?knownAsset:null')
    t=rep(t,'group=asset.clone(true);group.userData.sharedAsset=true','group=cloneSkeleton(asset) as THREE.Group;group.userData.sharedAsset=true')
    t=rep(t,'else{group=primitive(e);',"else{group=primitive(e.kind==='mcc-cabinet'&&!fitsPreview(previewCost,{triangles:30000,draws:500,bytes:0})?{...e,kind:'crate'}:e);")
    t=rep(t,'        group.position.set(e.x,',"        const currentCost=costOf(group);if(!fitsPreview(previewCost,currentCost)){if(!group.userData.sharedAsset)release(group);group=primitive({...e,kind:'asset'});group.name='Resource-budget proxy';proxyCount++}else previewCost=sumPreview(previewCost,currentCost)\n        if(e.kind==='asset'&&!asset)proxyCount++\n        group.userData.editorBaseScale=group.scale.x\n        group.position.set(e.x,")
    start=t.index('        if(e.assetId&&!asset&&!pending.has(');end=t.index('\n      const character=JSON.stringify',start)
    t=t[:start]+"""        if(e.assetId&&!knownAsset&&!pending.has(e.assetId)&&latest.current.owner)queueAsset(e.assetId,latest.current.owner)
      }
      if(world.character.assetId&&!cached.has(world.character.assetId)&&!pending.has(world.character.assetId)&&latest.current.owner)queueAsset(world.character.assetId,latest.current.owner)
      if(proxyCount)latest.current.onMessage(`${proxyCount} object(s) use lightweight previews while files load or the rendering budget is full. All placements are saved; the old four-model limit is removed.`)
"""+t[end:]
    old="const character=JSON.stringify(world.character);if(character!==previousCharacter){scene.remove(player);release(player);player=avatar(world);scene.add(player);previousCharacter=character}"
    new="""const character=JSON.stringify(world.character)+(world.character.assetId&&cached.has(world.character.assetId)?':loaded':'');if(character!==previousCharacter){disposePlayer();const asset=world.character.assetId?cached.get(world.character.assetId):null;if(asset){player=cloneSkeleton(asset) as THREE.Group;player.scale.multiplyScalar(.64);player.userData.sharedAsset=true;const clips=asset.animations;if(clips.length){mixer=new THREE.AnimationMixer(player);const clip=clips.find(c=>/walk|run|idle/i.test(c.name))??clips[0];mixer.clipAction(clip).play()}}else player=avatar(world);scene.add(player);player.position.set(playerAt.x,terrainHeight(playerAt.x,playerAt.z,world.terrain),playerAt.z);player.visible=true;previousCharacter=character}
      transforms.update()
"""
    t=rep(t,old,new)
    marker='    draw.current=rebuild;rebuild(latest.current.world)'
    loader="""    const queued:{id:string;owner:string}[]=[];let loadingAssets=0
    function queueAsset(id:string,owner:string){pending.add(id);queued.push({id,owner});pumpAssets()}
    function pumpAssets(){if(!alive||loadingAssets>=2||!queued.length)return;const item=queued.shift()!;loadingAssets++;let reserved=0
      void loadWorldAsset(item.owner,item.id).then(async blob=>{if(!alive)throw new Error('Editor closed.');reserved=blob.size;inflightBytes+=reserved;if(loadedBytes+inflightBytes>96_000_000)throw new Error('Loaded model files reached the 96 MB interactive budget; placements and originals are preserved.');return blob.arrayBuffer()}).then(async bytes=>{
        const info=inspectGLB(bytes);if(info.renderedTriangles>2_000_000)throw new Error('Use an optimized GAME copy under two million triangles for this interactive preview; the original is preserved.')
        const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(url.startsWith('blob:')||url.startsWith('data:'))return url;throw new Error('Only embedded model resources are supported.')})
        const gltf=await new GLTFLoader(manager).parseAsync(bytes,'');if(!alive||latest.current.owner!==item.owner){release(gltf.scene);return}
        const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),extent=Math.max(size.x,size.y,size.z)
        if(!Number.isFinite(extent)||extent<=0||extent>1e6){release(gltf.scene);throw new Error('Invalid model dimensions.')}
        const center=box.getCenter(new THREE.Vector3()),root=new THREE.Group();gltf.scene.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));root.add(gltf.scene);root.scale.setScalar(3/extent);root.animations=gltf.animations;cached.set(item.id,root);assetCosts.set(item.id,costOf(root));loadedBytes+=bytes.byteLength
        rebuild(latest.current.world)
      }).catch(e=>{if(alive)latest.current.onMessage(e instanceof Error?e.message:'Model preview unavailable. The original and placement remain.')}).finally(()=>{inflightBytes-=reserved;loadingAssets--;pumpAssets()});pumpAssets()
    }
"""
    t=rep(t,marker,loader+marker)
    t=rep(t,"const pick=(e:PointerEvent)=>{if(latest.current.playing", "const pick=(e:PointerEvent)=>{if(transforms.consumePick())return;if(latest.current.playing")
    t=rep(t,'      player.visible=latest.current.playing','''      player.visible=true
      if((latest.current.focusVersion??0)!==lastFocus){lastFocus=latest.current.focusVersion??0;if(chosen&&lastFocus>0)focus(chosen)}
      if((latest.current.focusCharacterVersion??0)!==lastCharacterFocus){lastCharacterFocus=latest.current.focusCharacterVersion??0;if(lastCharacterFocus>0)focus(player)}
      transforms.update()''')
    t=rep(t,"player.children.slice(3,7).forEach((part,i)=>{part.rotation.x=Math.sin(clock*9+i%2*Math.PI)*.4})", "(player.userData.previewLimbs as THREE.Object3D[]|undefined)?.forEach((part,i)=>{part.rotation.x=Math.sin(clock*9+i%2*Math.PI)*.4});mixer?.update(dt)")
    t=rep(t,'else player.children.slice(3,7).forEach(p=>{p.rotation.x=0})',"else{(player.userData.previewLimbs as THREE.Object3D[]|undefined)?.forEach(p=>{p.rotation.x=0});mixer?.update(dt)}")
    t=rep(t,'}else{keys.current.clear();jump=0}','}else{keys.current.clear();jump=0;player.position.y=terrainHeight(playerAt.x,playerAt.z,w.terrain);mixer?.update(dt)}')
    t=rep(t,'orbit.dispose();for(const child', 'transforms.dispose();orbit.dispose();if(player.userData.sharedAsset)scene.remove(player);for(const child')
    t=rep(t,'Drag to orbit · pinch to zoom · tap to mark a point','Tap to select · Move/Rotate/Scale handles edit objects · drag empty space to orbit')
    return t
edit('src/components/PrivateWorldCanvas.tsx',canvas)

# Mount the toolbar, generated Codex instruction and actual character path.
def page(t):
    t=rep(t,"import './PrivateGameLab.css'", "import WorldSelectionToolbar from '../components/WorldSelectionToolbar'\nimport WorldCharacterStudio from '../components/WorldCharacterStudio'\nimport WorldCodexPanel from '../components/WorldCodexPanel'\nimport { transformEntity, type TransformMode } from '../lib/editorTools'\nimport './PrivateGameLab.css'\nimport './EditorPolish.css'")
    t=rep(t,"useState<'build'|'library'|'assistant'>('build')", "useState<'build'|'library'|'assistant'|'character'>('build')")
    t=rep(t,"  const canEdit=", "  const [transformMode,setTransformMode]=useState<TransformMode>('select'),[snap,setSnap]=useState(0),[focusVersion,setFocusVersion]=useState(0),[focusCharacterVersion,setFocusCharacterVersion]=useState(0)\n  const canEdit=")
    t=rep(t,"setNewGame(false);setTutorial(0);setError('');setMessage('Your own world is ready. The character is a local preview; no AI generation was purchased.')", "setNewGame(false);setTutorial(0);setTab('character');setFocusCharacterVersion(v=>v+1);setError('');setMessage('Your character preview is now visible. Generate a detailed character explicitly in Character; no AI was charged by creating this world.')")
    t=rep(t,"if(tool==='select')setSelected(entityId)","if(tool==='select'){setSelected(entityId);if(entityId)setTransformMode('move')}")
    t=rep(t,'if(file.size>65536)', 'if(file.size>WORLD_LIMITS.bytes)')
    t=rep(t,'Use a world JSON file up to 64 KiB.','Use a world JSON file up to 96 KiB.')
    t=rep(t,'<Suspense fallback={<div className="private-loading">Preparing your meadow…</div>}>', '''<WorldSelectionToolbar world={world} selected={selected} point={point} mode={transformMode} snap={snap} disabled={!canEdit||playing} onSelect={id=>{setSelected(id);setTool('select');setTransformMode('move')}} onMode={mode=>{setTransformMode(mode);setTool('select')}} onSnap={setSnap} onChange={change} onFocus={()=>setFocusVersion(v=>v+1)} onError={setError}/>
      <Suspense fallback={<div className="private-loading">Preparing your meadow…</div>}>''')
    t=rep(t,'onPick={pick} onMessage={setMessage}/>',"onPick={pick} onMessage={setMessage} transformMode={canEdit&&!playing?transformMode:'select'} snap={snap} focusVersion={focusVersion} focusCharacterVersion={focusCharacterVersion} onTransform={(id,value)=>{if(!canEdit)return;try{change(transformEntity(worldRef.current,id,value,snap))}catch(e){setError(e instanceof Error?e.message:'Transform not applied.')}}}/>")
    t=rep(t,'{world.entities.length}/{WORLD_LIMITS.entities} objects','{world.entities.length} objects · resource-budgeted preview')
    t=rep(t,"(['build','library','assistant'] as const)", "(['build','library','character','assistant'] as const)")
    t=rep(t,"t==='build'?'Build':t==='library'?'Library':'Assistant'", "t==='build'?'Build':t==='library'?'Library':t==='character'?'Character':'Assistant'")
    t=rep(t,'Up to four imported models per world. Use optimized GAME copies for smooth editing.','No four-model placement cap. The editor uses lightweight proxies when the rendering budget is full; every placement is retained. Use optimized GAME copies for smooth editing.')
    start="      {tab==='assistant'&&<div className=\"private-panel\">"
    block="""      {tab==='character'&&owner&&ownedBy===owner&&<div className="private-panel"><WorldCharacterStudio key={owner+world.id} owner={owner} world={world} disabled={!canEdit||playing} onFocus={()=>setFocusCharacterVersion(v=>v+1)} onSetAsset={id=>change({...worldRef.current,character:{...worldRef.current.character,assetId:id}})} onReady={(id,snapshot,asset)=>{if(!canEdit||worldRef.current.id!==id||JSON.stringify(worldRef.current.character)!==snapshot){setMessage('Character is in your library. This world changed, so select the model explicitly in Character.');return}change({...worldRef.current,character:{...worldRef.current.character,assetId:asset.id}});setFocusCharacterVersion(v=>v+1)}}/></div>}
"""
    t=rep(t,start,block+start)
    anchor='      <details className="private-ai"><summary>AI design proposal · optional paid request</summary>'
    t=rep(t,anchor,'      <WorldCodexPanel world={world} selected={selected} request={command} disabled={!canEdit||playing} onChange={change} onMessage={setMessage}/>\n'+anchor)
    return t
edit('src/pages/PrivateGameLab.tsx',page)

# Avoid races when the editor changes while character work or downloads are pending.
def character(t):
    t=rep(t,"  const binding=useRef({worldId:p.world.id,characterSnapshot:JSON.stringify(p.world.character)})", "  const binding=useRef({worldId:p.world.id,characterSnapshot:''})\n  const bindingKey=`worldifact-character-binding:v1:${p.owner}:${p.world.id}`")
    t=rep(t,"const restored=client.current.restore();setSaved(restored);if(restored)setNotice(","const restored=client.current.restore();setSaved(restored);if(restored){try{const b=JSON.parse(window.localStorage.getItem(bindingKey)??'null');if(b?.jobId===restored.receipt.id&&b.worldId===p.world.id&&typeof b.characterSnapshot==='string')binding.current=b}catch{/* No speculative automatic adoption. */}}if(restored)setNotice(")
    t=rep(t,'    const actor=p.owner,id=p.world.id,api=client.current','    const actor=p.owner,id=p.world.id,api=client.current,captured={...binding.current}')
    t=rep(t,'latest.current.onReady(binding.current.worldId,binding.current.characterSnapshot,asset)','latest.current.onReady(captured.worldId,captured.characterSnapshot,asset)')
    t=rep(t,"setSaved(record);setJob(null)","window.localStorage.setItem(bindingKey,JSON.stringify({...binding.current,jobId:record.receipt.id}));setSaved(record);setJob(null)")
    t=rep(t,"api.start(input,record=>", "api.start(input,record=>") if False else t
    return t
edit('src/components/WorldCharacterStudio.tsx',character)
# Camera/model transforms are normalized before binding the helper.
edit('src/lib/editorTransforms.ts',lambda t:rep(t,'control.setScaleSnap(state.snap?.valueOf()? .1:null)','control.setScaleSnap(state.snap ? .1 : null)'))
# No unchecked cost labels. Follow explicit user confirmation at Stripe.
def billing(t):
    t=rep(t,'  STRIPE_BILLING_PORTAL_CONFIGURATION_ID?: string','  STRIPE_BILLING_PORTAL_CONFIGURATION_ID?: string\n  STRIPE_PLAN_CHANGE_CONFIGURATION_ID?: string')
    t=rep(t,"['subscription_create', 'subscription_cycle'].includes(String(invoice.billing_reason))","['subscription_create', 'subscription_cycle', 'subscription_update'].includes(String(invoice.billing_reason))")
    t=rep(t,'    checkoutReady: config.subscription, topupReady:',"    portalReady: config.ready && resourceId(env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID, 'bpc'),\n    planChangeReady: config.astraSpendGuard && resourceId(env.STRIPE_PLAN_CHANGE_CONFIGURATION_ID, 'bpc'),\n    checkoutReady: config.subscription, topupReady:")
    t=rep(t,'if (session.customer !== stored.customer || session.configuration !== portalConfiguration', 'if (idOf(session.customer) !== stored.customer || idOf(session.configuration) !== portalConfiguration')
    before="    if (url.pathname !== '/api/billing/checkout') return json({ error: 'Not found.' }, 404)"
    after="""    if (url.pathname === '/api/billing/change-plan') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415)
      const input = object(JSON.parse(await boundedText(request, 1024)))
      if (Object.keys(input).length !== 1 || !['creator','pro','studio'].includes(String(input.plan))) return json({error:'Choose a valid plan.'},400)
      const plan=input.plan as PlanId
      // Never create an upgrade confirmation for a product whose generation path is paused.
      if (!config.plans[plan] || !config.astraSpendGuard) return json({error:'This plan change is temporarily paused while generation is verified. Your current subscription is unchanged.',code:'PLAN_PAUSED'},409)
      const configuration=env.STRIPE_PLAN_CHANGE_CONFIGURATION_ID
      if (!resourceId(configuration,'bpc')) return json({error:'Plan changes are not configured. Manage or cancel your existing subscription separately.'},503)
      const allowance=await entitlementStatus(env,user.id)
      if (!allowance.subscription.active || allowance.billingReview) return json({error:'An active subscription without a billing hold is required.'},409)
      const stored=await entitlementCall<{customer:string|null}>(env,user.id,'/billing')
      if (!stored.customer) return json({error:'Billing account is not linked.'},409)
      const subscriptions=await stripe(env,`/subscriptions?customer=${stored.customer}&status=all&limit=100`,fetcher)
      const open=array(subscriptions.data).filter(s=>!['canceled','incomplete_expired'].includes(String(s.status)))
      if (subscriptions.has_more===true || open.length!==1) return json({error:'Subscription state needs review. No duplicate membership was created.'},409)
      const subscription=open[0],items=array(object(subscription.items).data)
      if (subscription.status!=='active'||uidFor(subscription)!==user.id||idOf(subscription.customer)!==stored.customer||items.length!==1||items[0].quantity!==1||!resourceId(items[0].id,'si')||subscription.pending_update||subscription.schedule||subscription.cancel_at_period_end===true) return json({error:'Finish the pending billing change first. No new charge was created.'},409)
      const source=planForPrice(env,idOf(items[0].price))
      if (!source || source===plan) return json({error:'That plan is already active or requires review.'},409)
      const price=await verifiedPrice(env,'subscription',fetcher,false,undefined,plan)
      const invoiceId=idOf(subscription.latest_invoice)
      if (!resourceId(invoiceId,'in')) return json({error:'Latest paid invoice could not be verified.'},409)
      const invoice=await stripe(env,`/invoices/${invoiceId}`,fetcher)
      if (!exactInvoice(env,invoice)||subscriptionOf(invoice)!==subscription.id) return json({error:'Settle the outstanding invoice before changing plan.'},409)
      const params=new URLSearchParams({customer:stored.customer,configuration:configuration!,return_url:`${config.origin}/account/credits`,
        'flow_data[type]':'subscription_update_confirm','flow_data[subscription_update_confirm][subscription]':String(subscription.id),
        'flow_data[subscription_update_confirm][items][0][id]':String(items[0].id),'flow_data[subscription_update_confirm][items][0][price]':String(price.id),
        'flow_data[subscription_update_confirm][items][0][quantity]':'1','flow_data[after_completion][type]':'redirect',
        'flow_data[after_completion][redirect][return_url]':`${config.origin}/account/credits?billing=processing`})
      const session=await stripe(env,'/billing_portal/sessions',fetcher,params)
      if(idOf(session.customer)!==stored.customer||idOf(session.configuration)!==configuration||typeof session.url!=='string'||!session.url.startsWith('https://billing.stripe.com/'))throw new EntitlementError('Plan confirmation was not verified.')
      return json({url:session.url,requiresConfirmation:true})
    }
"""+before
    return rep(t,before,after)
edit('server/billing.ts',billing)

# The old portal remains management/cancellation-only. The new configuration is used only by the guarded change endpoint.
def vars(t):
    anchor='"ENABLE_ASTRA_PLANS": "false",'
    return rep(t,anchor,anchor+'\n    "STRIPE_PLAN_CHANGE_CONFIGURATION_ID": "bpc_1UKstUBrIVB6dkxN5vfrUDa4",')
edit('wrangler.jsonc',vars)

def credits(t):
    t=rep(t,"type PaymentAction = 'card' | 'google' | 'paypal' | 'portal' | 'capture'", "type PaymentAction = 'card' | 'google' | 'paypal' | 'portal' | 'change' | 'capture'")
    t=rep(t,'type Billing = { checkoutReady:', 'type Billing = { portalReady?: boolean; planChangeReady?: boolean; checkoutReady:')
    t=rep(t,'  const canBuy =', '  const canManage = !!user && !loading && !busy\n  const canBuy =')
    t=rep(t,"if (actionLock.current || !canBuy || (action !== 'portal' && !checkoutCanBuy)) return", "if (actionLock.current || (action === 'portal' ? !canManage : action === 'change' ? !canBuy || !member || !billing?.planChangeReady || !checkoutReady : !canBuy || !checkoutCanBuy)) return")
    t=rep(t,"action === 'portal' ? '/api/billing/portal' : '/api/billing/checkout'", "action === 'portal' ? '/api/billing/portal' : action === 'change' ? '/api/billing/change-plan' : '/api/billing/checkout'")
    t=rep(t,"action === 'paypal' || action === 'portal' ? {} : { kind: checkoutKind", "action === 'paypal' || action === 'portal' ? {} : action === 'change' ? { plan: checkoutPlan } : { kind: checkoutKind")
    t=rep(t,"action === 'portal' ? 'portal' : 'stripe'", "action === 'portal' || action === 'change' ? 'portal' : 'stripe'")
    # Upgrade buttons must not pretend they can only manage the current plan.
    pattern=r'<button className="credits-action"[^\n]+?onClick=\{\(\) => \{ setSelectedPlan\(id\);[^\n]+?</button>'
    matches=list(re.finditer(pattern,t))
    if len(matches)!=1: raise RuntimeError('Expected one subscription-card action')
    replacement="""<button className="credits-action" disabled={busy!==null || (member && (balance?.subscription.plan??'creator')===id ? !canManage : !canBuy || billing?.plans?.[id]?.checkoutReady!==true || member && billing?.planChangeReady!==true)} onClick={() => { setSelectedPlan(id); setPurchaseKind('subscription'); void checkout(member ? (balance?.subscription.plan??'creator')===id ? 'portal' : 'change' : 'card', {kind:'subscription',plan:id}) }}>{busy ? 'Opening secure billing…' : member && (balance?.subscription.plan??'creator')===id ? 'Manage current subscription ↗' : billing?.plans?.[id]?.checkoutReady!==true ? 'Temporarily unavailable · no charge' : member ? `Review change to ${name} ↗` : `Subscribe ${price} / month ↗`}</button>"""
    t=t[:matches[0].start()]+replacement+t[matches[0].end():]
    t=t.replace('className="credits-manage" disabled={!canBuy}', 'className="credits-manage" disabled={!canManage}')
    return t
edit('src/pages/CreditsPage.tsx',credits)

# Update old cap assertions, not security/ownership expectations.
def tests(t):
    t=rep(t,"assert.throws(() => validatePrivateWorld({ ...more, entities: Array.from({ length: 49 }, () => newEntity('tree', 0, 0)) }))", "assert.equal(validatePrivateWorld({ ...more, entities: Array.from({ length: 49 }, () => newEntity('tree', 0, 0)) }).entities.length, 49)")
    t=rep(t,"assert.throws(() => validatePrivateWorld({ ...more, entities: Array.from({ length: 5 }, () => newEntity('asset', 0, 0, crypto.randomUUID())) }))", "assert.equal(validatePrivateWorld({ ...more, entities: Array.from({ length: 5 }, () => newEntity('asset', 0, 0, crypto.randomUUID())) }).entities.length, 5)\n  assert.throws(()=>validatePrivateWorld({...more,entities:Array.from({length:4097},()=>newEntity('tree',0,0))}))")
    return rep(t,"'x'.repeat(70000)","'x'.repeat(110000)")
edit('tests/private-worlds.test.ts',tests)

def render(t):
    t=rep(t,"import * as world from", "import * as tools from '../src/lib/editorTools.ts'\nimport * as world from")
    t=rep(t,"    '../lib/privateWorld': world,", "    '../lib/privateWorld': world,\n    '../lib/editorTools': tools,\n    '../components/WorldSelectionToolbar': { __esModule: true, default: () => React.createElement('section',null,'Transform controls') },\n    '../components/WorldCharacterStudio': { __esModule: true, default: forbidden },\n    '../components/WorldCodexPanel': { __esModule: true, default: forbidden },")
    return t
edit('tests/private-game-lab-render.test.mjs',render)
Path('ops/editor-polish-integrated.json').write_text('{"revision":"editor-polish-20260929","modelCalls":0,"customerCharges":0}\n')
print('Integrated transform tools, resource-budgeted placement, character studio and explicit billing changes.')
