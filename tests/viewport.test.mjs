import test from 'node:test';
import assert from 'node:assert/strict';
import { measureViewport } from '../src/game/viewport.ts';

for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [844, 390], [320, 568]]) {
  test(`viewport ${width} × ${height} fills both axes without stretching`, () => {
    const viewport = measureViewport(width, height, 3);
    assert.ok(Math.abs(viewport.worldWidth * viewport.scale - width) < 0.001);
    assert.ok(Math.abs(viewport.worldHeight * viewport.scale - height) < 0.001);
    assert.ok(viewport.worldWidth >= 600 && viewport.worldHeight >= 400);
    assert.ok(viewport.resolution <= 2);
    assert.ok(width * height * viewport.resolution ** 2 <= 4_000_001);
  });
}

test('very large displays also respect the backing-buffer budget', () => {
  const viewport = measureViewport(7680, 4320, 3);
  assert.ok(viewport.width * viewport.height * viewport.resolution ** 2 <= 4_000_001);
  assert.equal(measureViewport(900, 560).resolution, 1);
});
