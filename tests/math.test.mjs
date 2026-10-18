import test from 'node:test';
import assert from 'node:assert/strict';
import { aimAt, clamp, circlesOverlap, cursorToWorld, limitedDirection, normalizedDirection } from '../src/game/math.ts';
test('clamp enforces left and right boundaries', () => {
  assert.equal(clamp(-50, 0, 800), 0);
  assert.equal(clamp(850, 0, 800), 800);
  assert.equal(clamp(325, 0, 800), 325);
});

test('aim angle covers four directions from different player positions', () => {
  for (const [x, y] of [[0, 0], [450, 470], [580, 1000]]) {
    assert.equal(aimAt(x, y, x + 100, y, 0), 0);
    assert.equal(aimAt(x, y, x, y + 100, 0), Math.PI / 2);
    assert.equal(aimAt(x, y, x - 100, y, 0), Math.PI);
    assert.equal(aimAt(x, y, x, y - 100, 0), -Math.PI / 2);
  }
});

test('cursor at ship center keeps the previous stable orientation', () => {
  assert.equal(aimAt(400, 300, 400, 300, 1.25), 1.25);
  assert.equal(aimAt(400, 300, 400.000001, 300, 1.25), 1.25);
});

test('cursor conversion handles canvas offsets, CSS scaling and changing dimensions', () => {
  assert.deepEqual(cursorToWorld(250, 150, { left: 100, top: 50, width: 300, height: 200 }, 900, 600), { x: 450, y: 300 });
  assert.deepEqual(cursorToWorld(205, 432, { left: 10, top: 10, width: 390, height: 844 }, 600, 844 / .65), { x: 300, y: 422 / .65 });
  assert.deepEqual(cursorToWorld(432, 205, { left: 10, top: 10, width: 844, height: 390 }, 844 / .975, 400), { x: 422 / .975, y: 200 });
});

test('analog movement preserves partial intensity and caps diagonal speed', () => {
  assert.deepEqual(limitedDirection(.2, -.3), { x: .2, y: -.3 });
  assert.ok(Math.abs(Math.hypot(...Object.values(limitedDirection(1, 1))) - 1) < 1e-10);
  assert.ok(Math.abs(Math.hypot(...Object.values(limitedDirection(2, 1))) - 1) < 1e-10);
});
test('collisions of circles include touching edges', () => {
  const a = { x: 0, y: 0, radius: 10 };
  assert.equal(circlesOverlap(a, { x: 20, y: 0, radius: 10 }), true);
  assert.equal(circlesOverlap(a, { x: 21, y: 0, radius: 10 }), false);
});
test('diagonal movement normalized to unit vector', () => {
  const diagonal = normalizedDirection(1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 0.00001);
  assert.deepEqual(normalizedDirection(0, 0), { x: 0, y: 0 });
});
