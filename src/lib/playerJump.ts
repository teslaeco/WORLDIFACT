/** Local GAME physics. A second press works even before the first render tick. */
export interface JumpState { height: number; velocity: number; jumps: number; flipTime: number }
export const JUMP_GRAVITY = 14
export const FLIP_DURATION = .52
export function createJumpState(): JumpState { return { height: 0, velocity: 0, jumps: 0, flipTime: -1 } }
export function resetJump(state: JumpState) { Object.assign(state, createJumpState()) }
export function requestJump(state: JumpState, allowed = true): boolean {
  if (!allowed || state.jumps >= 2) return false
  state.jumps++
  state.velocity = state.jumps === 2 ? 6.4 : 5.2
  if (state.jumps === 2) state.flipTime = 0
  return true
}
export function stepJump(state: JumpState, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !state.jumps) return
  const dt = Math.min(seconds, .05)
  state.height += state.velocity * dt - .5 * JUMP_GRAVITY * dt * dt
  state.velocity -= JUMP_GRAVITY * dt
  if (state.flipTime >= 0) state.flipTime = Math.min(FLIP_DURATION, state.flipTime + dt)
  if (state.height <= 0 && state.velocity <= 0) resetJump(state)
}
export function jumpFlipAngle(state: JumpState, reducedMotion = false) {
  if (state.flipTime < 0 || reducedMotion) return 0
  const t = Math.min(1, state.flipTime / FLIP_DURATION)
  return 2 * Math.PI * t * t * (3 - 2 * t)
}
