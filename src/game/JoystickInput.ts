import { limitedDirection } from './math.ts';

/** One owner per stick; independent instances support simultaneous fingers. */
export class JoystickInput {
  pointerId: number | null = null;
  x = 0;
  y = 0;

  begin(pointerId: number) {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    return true;
  }

  move(pointerId: number, dx: number, dy: number, radius: number) {
    if (this.pointerId !== pointerId) return false;
    const raw = limitedDirection(dx / Math.max(1, radius), dy / Math.max(1, radius));
    const distance = Math.hypot(raw.x, raw.y);
    const deadZone = 0.18;
    const intensity = Math.max(0, (distance - deadZone) / (1 - deadZone));
    this.x = distance > 0 ? raw.x / distance * intensity : 0;
    this.y = distance > 0 ? raw.y / distance * intensity : 0;
    return true;
  }

  release(pointerId: number) {
    if (this.pointerId !== pointerId) return false;
    this.reset();
    return true;
  }

  reset() {
    this.pointerId = null;
    this.x = this.y = 0;
  }
}
