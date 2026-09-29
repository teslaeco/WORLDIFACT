import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { terrainHeight, type PrivateWorld } from './privateWorld.ts'
import { finite, transformFromScene, type EntityTransform, type TransformMode } from './editorTools.ts'

type State={world:PrivateWorld;selected:string|null;playing:boolean;transformMode?:TransformMode;snap?:number;onTransform?:(id:string,value:EntityTransform)=>void;onMessage:(text:string)=>void}
/** One history commit per drag. A cancelled gesture never changes saved data. */
export function attachEditorTransforms(camera:THREE.Camera,element:HTMLElement,scene:THREE.Scene,items:THREE.Group,orbit:OrbitControls,current:()=>State){
  const control=new TransformControls(camera,element),helper=control.getHelper();scene.add(helper)
  control.setSize(1.15);control.setSpace('world')
  let used=false,active=false,baseScale=1,start:THREE.Vector3|null=null,worldId='',selectedId='',signature=''
  const begin=()=>{const state=current(),object=control.object;if(!object||!state.selected)return;used=true;active=true;start=object.scale.clone();worldId=state.world.id;selectedId=state.selected;signature=JSON.stringify(state.world.entities.find(e=>e.id===selectedId));baseScale=Number(object.userData.editorBaseScale)||1;orbit.enabled=false}
  const changed=()=>{if(!active||!control.object)return;const object=control.object,state=current();try{
    object.position.x=finite(object.position.x,-40,40);object.position.z=finite(object.position.z,-40,40)
    const ground=terrainHeight(object.position.x,object.position.z,state.world.terrain);object.position.y=finite(object.position.y,ground,ground+20)
    if(control.mode==='scale'&&start){const axis=control.axis??'XYZ';const value=axis.includes('X')?object.scale.x:axis.includes('Y')?object.scale.y:object.scale.z;object.scale.setScalar(finite(value/baseScale,.1,8)*baseScale)}
  }catch{control.reset()}}
  const end=()=>{if(!active)return;active=false;orbit.enabled=true;const state=current(),object=control.object,entity=state.world.entities.find(e=>e.id===selectedId)
    if(!object||!entity||state.world.id!==worldId||state.selected!==selectedId||state.playing||JSON.stringify(entity)!==signature){control.reset();return}
    try{state.onTransform?.(entity.id,transformFromScene(state.world,entity,object.position,object.rotation.y,object.scale.x/baseScale,state.snap??0))}catch{control.reset();state.onMessage('Transform was not saved. The previous object is preserved.')}
  }
  const cancel=()=>{if(active)control.reset();active=false;orbit.enabled=true;control.detach()}
  control.addEventListener('mouseDown',begin);control.addEventListener('objectChange',changed);control.addEventListener('mouseUp',end)
  element.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel)
  const update=()=>{const state=current();if(active){if(state.world.id!==worldId||state.selected!==selectedId||state.playing)cancel();return}
    const mode=state.transformMode??'select',object=items.children.find(e=>e.userData.entityId===state.selected)
    if(!object||state.playing||mode==='select'){control.detach();return}
    if(control.object!==object)control.attach(object)
    control.setMode(mode==='move'?'translate':mode);control.showX=mode!=='rotate';control.showY=true;control.showZ=mode!=='rotate'
    control.setTranslationSnap(state.snap||null);control.setRotationSnap(state.snap?Math.PI/12:null);control.setScaleSnap(state.snap?.valueOf()? .1:null)
  }
  return {update,beforeRebuild:()=>{if(active)cancel();control.detach()},consumePick:()=>{const value=used;used=false;return value},dispose:()=>{cancel();control.removeEventListener('mouseDown',begin);control.removeEventListener('objectChange',changed);control.removeEventListener('mouseUp',end);element.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);control.dispose();scene.remove(helper)}}
}
