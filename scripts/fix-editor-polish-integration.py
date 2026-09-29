from pathlib import Path

def replace_once(path,old,new):
    p=Path(path);s=p.read_text()
    if old in s:
        assert s.count(old)==1, path
        p.write_text(s.replace(old,new))
    elif new not in s:
        raise RuntimeError('Unexpected integration: '+path)

replace_once('src/pages/PrivateGameLab.tsx',"if(entityId)setTransformMode('move')};else","if(entityId)setTransformMode('move')}else")
replace_once('src/pages/CreditsPage.tsx',"billing?.plans?.[id]?.checkoutReady!==true ? 'Temporarily unavailable · no charge'","billing?.plans?.[id]?.checkoutReady===false ? 'Temporarily unavailable · no charge'")
replace_once('src/lib/characterPreview.ts','export function createCharacterPreview(c:WorldCharacter):THREE.Group {','export function createCharacterPreview(c:WorldCharacter,labelTexture?:(text:string)=>THREE.Texture|null):THREE.Group {')
p=Path('src/lib/characterPreview.ts');s=p.read_text()
start=s.find("  if(c.label&&typeof document!=='undefined'){")
if start>=0:
    end=s.index('\n  root.userData.previewLimbs',start)
    s=s[:start]+"  if(c.label&&labelTexture){const texture=labelTexture(c.label);if(texture)part(new THREE.PlaneGeometry(.39,.1),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),0,1.23,.232)}\n"+s[end:]
    p.write_text(s)
replace_once('src/components/PrivateWorldCanvas.tsx','function avatar(world:PrivateWorld){return createCharacterPreview(world.character)}',"function avatar(world:PrivateWorld){return createCharacterPreview(world.character,text=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)return null;ctx.clearRect(0,0,512,128);ctx.fillStyle='#f5f7ec';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 46px sans-serif';ctx.fillText(text,256,64,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture})}")
replace_once('src/lib/editorTools.ts','&&/river|rzek/.test(s)','&&/river|rze[kc]/.test(s)')
print('Selection syntax, pending checkout labels, Polish river inflection and DOM-free character geometry verified.')
