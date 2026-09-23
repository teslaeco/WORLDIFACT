import * as THREE from 'three'
import type { JumpAnimation } from './playerJump.ts'
export const WALK_SPEED=1.55
export const STRIDE=.31
export const STANCE=.60
/** -Z is forward. The planted foot translates backward at the actual travel speed. */
export function footCycle(phase:number,amount:number){
  const p=((phase%1)+1)%1
  if(p<STANCE)return {z:(-STRIDE+2*STRIDE*p/STANCE)*amount,lift:0}
  const t=(p-STANCE)/(1-STANCE),ease=t*t*(3-2*t)
  return {z:(STRIDE-2*STRIDE*ease)*amount,lift:Math.sin(Math.PI*t)*.15*amount}
}
export function legAngles(z:number,lift:number,pelvisDrop:number){
  const upper=.41,lower=.41,down=.82-pelvisDrop-lift
  const distance=Math.min(upper+lower-.000001,Math.max(.0001,Math.hypot(down,z)))
  const direction=Math.atan2(-z,down)
  const alpha=Math.acos(THREE.MathUtils.clamp((upper*upper+distance*distance-lower*lower)/(2*upper*distance),-1,1))
  const knee=-Math.acos(THREE.MathUtils.clamp((distance*distance-upper*upper-lower*lower)/(2*upper*lower),-1,1))
  return {hip:direction+alpha,knee,ankle:-(direction+alpha+knee)}
}
export function gaitPose(phase:number,amount:number,motion:JumpAnimation={tuck:0,crouch:0,airborne:false}){
  const steps=[footCycle(phase,amount),footCycle(phase+.5,amount)]
  const reach=Math.max(0,...steps.filter(s=>s.lift<.001).map(s=>Math.abs(s.z)))
  // Pelvis only lowers as needed at double support, rather than a permanent squat.
  const drop=.004+(.82-Math.sqrt(.82*.82-reach*reach))+.17*motion.crouch
  const legs=steps.map(step=>{
    const grounded=legAngles(step.z,step.lift,drop)
    if(!motion.airborne)return grounded
    const tuck=THREE.MathUtils.clamp(motion.tuck,0,1)
    return {hip:.18+1.35*tuck,knee:-.30-1.95*tuck,ankle:.12+.60*tuck}
  })
  return {drop,legs}
}
