export type Circle = { x: number; y: number; radius: number };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const circlesOverlap = (a: Circle, b: Circle): boolean => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const sum = a.radius + b.radius;
  return dx * dx + dy * dy <= sum * sum;
};
export function normalizedDirection(x: number, y: number) {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

/** Limit diagonals while preserving analog input below full intensity. */
export function limitedDirection(x: number, y: number) {
  const divisor = Math.max(1, Math.hypot(x, y));
  return { x: x / divisor, y: y / divisor };
}

export function aimAt(x: number, y: number, targetX: number, targetY: number, previousAngle: number) {
  const dx = targetX - x;
  const dy = targetY - y;
  return dx * dx + dy * dy > 0.000001 ? Math.atan2(dy, dx) : previousAngle;
}

export function cursorToWorld(clientX: number, clientY: number, bounds: { left: number; top: number; width: number; height: number }, worldWidth: number, worldHeight: number) {
  return { x: (clientX - bounds.left) * worldWidth / bounds.width, y: (clientY - bounds.top) * worldHeight / bounds.height };
}
