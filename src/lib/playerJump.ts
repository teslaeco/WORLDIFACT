/** Local GAME physics. Input is queued independently of render cadence. */
export interface JumpState {
  height: number; velocity: number; jumps: number; flipTime: number;
  preparation: number; landing: number;
}
export interface JumpAnimation { tuck: number; crouch: number; airborne: boolean }
export const JUMP_GRAVITY = 14
export const FLIP_DURATION = .48
export const TAKEOFF_DURATION = .10
export const LANDING_DURATION = .20
export function createJumpState(): JumpState {
  return { height: 0, velocity: 0, jumps: 0, flipTime: -1, preparation: 0, landing: 0 }
}
export function resetJump(state: JumpState) { Object.assign(state, createJumpState()) }
export function requestJump(state: JumpState, allowed = true): boolean {
  if (!allowed || state.jumps >= 2) return false
  if (state.jumps === 0) state.preparation = TAKEOFF_DURATION
  state.jumps++
  state.landing = 0
  state.velocity = state.jumps === 2 ? 6.4 : 5.2
  if (state.jumps === 2) state.flipTime = 0
  return true
}
export function stepJump(state: JumpState, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  let dt = Math.min(seconds, .05)
  state.landing = Math.max(0, state.landing - dt)
  if (!state.jumps) return
  if (state.preparation > 0) {
    const waiting = Math.min(state.preparation, dt)
    state.preparation = Math.max(0, state.preparation - waiting); dt -= waiting
    if (dt < 1e-9) return
  }
  state.height += state.velocity * dt - .5 * JUMP_GRAVITY * dt * dt
  state.velocity -= JUMP_GRAVITY * dt
  if (state.flipTime >= 0) state.flipTime = Math.min(FLIP_DURATION, state.flipTime + dt)
  if (state.height <= 0 && state.velocity <= 0) {
    resetJump(state); state.landing = LANDING_DURATION
  }
}
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x*x*(3-2*x) }
export function jumpFlipAngle(state: JumpState, reducedMotion = false) {
  if (state.flipTime < 0 || reducedMotion) return 0
  return 2 * Math.PI * smooth(state.flipTime / FLIP_DURATION)
}
/** Strong knee-to-chest tuck in the middle of a flip; extend before contact. */
export function jumpAnimation(state: JumpState): JumpAnimation {
  const p = state.flipTime / FLIP_DURATION
  const flipTuck = state.flipTime >= 0 ? smooth(p / .18) * (1 - smooth((p - .65) / .28)) : 0
  const ordinaryTuck = state.height > 0 ? .20 * smooth(state.height / .24) : 0
  const preparation = state.preparation > 0 ? Math.sin(Math.PI * (1 - state.preparation / TAKEOFF_DURATION)) : 0
  const landing = state.landing > 0 ? Math.sin(Math.PI * (1 - state.landing / LANDING_DURATION)) : 0
  return { tuck: Math.max(flipTuck, ordinaryTuck), crouch: Math.max(preparation, landing), airborne: state.height > 0 }
}
