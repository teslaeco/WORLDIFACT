// Camera-relative analogue input: radial dead zone without diagonal speed gain.
export function orbitOffset(yaw,pitch,distance){return [Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance];}
export function stickVector(dx,dy,radius,deadZone=.12){
 if(![dx,dy,radius].every(Number.isFinite)||radius<=0)return {x:0,y:0,magnitude:0};
 const length=Math.hypot(dx,dy),raw=Math.min(1,length/radius);
 if(raw<=deadZone)return {x:0,y:0,magnitude:0};
 const magnitude=(raw-deadZone)/(1-deadZone);
 return {x:dx/length*magnitude,y:-dy/length*magnitude,magnitude};
}
export function movementAxes(keys,stick){
 let x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
 let z=stick.y+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 let y=(keys.has('Space')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')||keys.has('KeyQ')?1:0);
 const length=Math.hypot(x,y,z);if(length>1){x/=length;y/=length;z/=length;}
 return {x,y,z,magnitude:Math.min(1,length)};
}
export function attachJoystick(element,knob,onChange){
 let pointer=null,origin=null;
 const reset=()=>{pointer=null;origin=null;knob.style.transform='translate(0px,0px)';element.classList.remove('active');onChange({x:0,y:0,magnitude:0});};
 function update(e){if(e.pointerId!==pointer)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y;const r=origin.radius,n=Math.hypot(dx,dy),factor=n>r?r/n:1;knob.style.transform=`translate(${dx*factor}px,${dy*factor}px)`;onChange(stickVector(dx,dy,r));}
 element.addEventListener('pointerdown',e=>{if(pointer!==null)return;e.preventDefault();const b=element.getBoundingClientRect();pointer=e.pointerId;origin={x:b.left+b.width/2,y:b.top+b.height/2,radius:b.width*.32};element.setPointerCapture(pointer);element.classList.add('active');update(e);});
 element.addEventListener('pointermove',e=>{if(pointer===e.pointerId){e.preventDefault();update(e);}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,e=>{if(e.pointerId===pointer)reset();});
 return {reset};
}
