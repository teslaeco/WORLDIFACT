export interface MoveAxes { side: number; forward: number }
export const STILL: Readonly<MoveAxes> = Object.freeze({ side: 0, forward: 0 });

export function joystickAxes(dx: number, dy: number, radius: number): MoveAxes {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { ...STILL };
  const distance = Math.hypot(dx, dy), deadZone = 0.12;
  const amount = Math.max(0, (Math.min(1, distance / radius) - deadZone) / (1 - deadZone));
  if (!amount) return { ...STILL };
  return { side: dx / distance * amount, forward: -dy / distance * amount };
}

export function movementAxes(keys: Record<string, boolean>, stick: MoveAxes): MoveAxes {
  const side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + stick.side;
  const forward = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) + stick.forward;
  // Preserve slow analogue movement, while capping combined/diagonal input.
  const length = Math.max(1, Math.hypot(side, forward));
  return { side: side / length, forward: forward / length };
}

/** One finger owns movement; another finger may independently own the camera. */
export class JoystickInput {
  pointerId: number | null = null;
  axes: MoveAxes = { ...STILL };
  offset = { x: 0, y: 0 };
  private center = { x: 0, y: 0, radius: 1 };

  start(id: number, x: number, y: number, radius: number) {
    if (this.pointerId !== null || ![id, x, y, radius].every(Number.isFinite) || radius <= 0) return false;
    this.pointerId = id;
    this.center = { x, y, radius };
    return true;
  }
  move(id: number, x: number, y: number) {
    if (id !== this.pointerId) return false;
    const dx = x - this.center.x, dy = y - this.center.y;
    this.axes = joystickAxes(dx, dy, this.center.radius);
    const scale = Math.max(1, Math.hypot(dx, dy) / this.center.radius);
    this.offset = Number.isFinite(scale) ? { x: dx / scale, y: dy / scale } : { x: 0, y: 0 };
    return true;
  }
  end(id: number) {
    if (id !== this.pointerId) return false;
    this.reset();
    return true;
  }
  reset() {
    this.pointerId = null;
    this.axes = { ...STILL };
    this.offset = { x: 0, y: 0 };
  }
}
