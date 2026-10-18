import test from 'node:test';
import assert from 'node:assert/strict';
import { JoystickInput } from '../src/game/JoystickInput.ts';

test('two sticks maintain independent simultaneous pointer owners and vectors', () => {
  const left = new JoystickInput();
  const right = new JoystickInput();
  assert.equal(left.begin(11), true);
  assert.equal(right.begin(22), true);
  left.move(11, -50, 50, 50);
  right.move(22, 50, 0, 50);
  assert.ok(left.x < 0 && left.y > 0);
  assert.equal(right.x, 1);
  assert.equal(right.y, 0);
  assert.equal(left.begin(33), false);
  assert.equal(left.move(22, 50, -50, 50), false);
  assert.equal(left.release(22), false);
  assert.equal(left.pointerId, 11);
  assert.equal(right.pointerId, 22);
});

test('dead zone suppresses drift; analog intensity scales and stays bounded', () => {
  const stick = new JoystickInput();
  stick.begin(1);
  stick.move(1, 2, 3, 50);
  assert.equal(stick.x, 0);
  assert.equal(stick.y, 0);
  stick.move(1, 25, 0, 50);
  assert.ok(stick.x > 0 && stick.x < 1);
  stick.move(1, 150, 150, 50);
  assert.ok(Math.abs(Math.hypot(stick.x, stick.y) - 1) < 1e-10);
});

test('pointer cancellation and focus reset release only the intended stick', () => {
  const left = new JoystickInput();
  const right = new JoystickInput();
  left.begin(1); right.begin(2);
  left.move(1, 50, 0, 50); right.move(2, 0, -50, 50);
  assert.equal(right.release(2), true);
  assert.equal(right.pointerId, null);
  assert.deepEqual([right.x, right.y], [0, 0]);
  assert.equal(left.pointerId, 1);
  left.reset(); right.reset();
  assert.deepEqual([left.pointerId, left.x, left.y], [null, 0, 0]);
  assert.equal(left.begin(3), true);
});
