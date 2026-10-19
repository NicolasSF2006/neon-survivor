import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'pixi.js';
import { PixelArt } from '../src/game/PixelArt.ts';
import { Starfield } from '../src/game/Starfield.ts';

function scene(t) {
  const art = new PixelArt();
  const parent = new Container();
  const field = new Starfield(art, parent, 1920, 1080, () => .5);
  t.after(() => { parent.destroy({ children: true }); art.destroy(); });
  return { art, parent, field };
}

test('depth layers separate speed, brightness and pixel size without moving their parent', t => {
  const { field, parent } = scene(t);
  parent.position.set(7, 11);
  const before = field.layers.map(layer => layer.stars[0].y);
  field.update(.05);
  const samples = field.layers.map(layer => layer.stars[0]);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].y - before[i] > samples[i - 1].y - before[i - 1]);
    assert.ok(samples[i].view.alpha > samples[i - 1].view.alpha);
    assert.ok(samples[i].view.bounds.width > samples[i - 1].view.bounds.width);
  }
  assert.deepEqual([parent.x, parent.y], [7, 11]);
  assert.ok(samples.every(star => star.view.roundPixels && star.x < 960));
});

test('parallax is frame-rate independent and recycles offscreen stars without consuming randomness', t => {
  const first = scene(t).field;
  const second = scene(t).field;
  for (const field of [first, second]) {
    for (const layer of field.layers) {
      for (const star of layer.stars) { star.x = -3.99; star.y = 1083.99; }
    }
  }
  for (let i = 0; i < 20; i++) first.update(.05);
  for (let i = 0; i < 60; i++) second.update(1 / 60);
  for (let i = 0; i < first.layers.length; i++) {
    const a = first.layers[i].stars[0], b = second.layers[i].stars[0];
    assert.ok(Math.abs(a.x - b.x) < 1e-8);
    assert.ok(Math.abs(a.y - b.y) < 1e-8);
    assert.ok(a.x > 1900 && a.x <= 1924);
    assert.ok(a.y >= -4 && a.y < 30);
    assert.equal(a.view.x, a.x);
    assert.equal(a.view.y, a.y);
  }
  // Wrapping must never draw random numbers from the game's spawn/FX stream.
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Background animation requested gameplay randomness'); };
  try { first.update(10000); } finally { Math.random = originalRandom; }
});

test('resize and compact mode reuse the fixed pool, remap positions and reduce visible work', t => {
  const { field, parent } = scene(t);
  const views = field.layers.flatMap(layer => layer.stars.map(star => star.view));
  const contexts = views.map(view => view.context);
  field.resize(600, 1300, true);
  assert.equal(views.filter(view => view.visible).length, 40);
  const sample = field.layers[0].stars[0];
  assert.equal(sample.x, 300);
  assert.equal(sample.y, 650);
  const before = sample.y;
  field.update(.05);
  assert.ok(Math.abs(sample.y - before - sample.speed * .05 * .75) < 1e-8);
  for (let i = 0; i < 500; i++) {
    field.update(.05);
    field.resize(i % 2 ? 600 : 1920, i % 2 ? 1300 : 1080, i % 2 === 1);
  }
  field.resize(1920, 1080, false);
  assert.equal(views.filter(view => view.visible).length, 70);
  assert.equal(parent.children.length, field.layers.length + field.scenery.length);
  assert.deepEqual(field.layers.flatMap(layer => layer.stars.map(star => star.view)), views);
  views.forEach((view, i) => {
    assert.equal(view.context, contexts[i]);
    assert.equal(view.destroyed, false);
  });
});

test('scene teardown destroys every star and releases shared contexts with their owner', () => {
  const art = new PixelArt(), parent = new Container();
  const field = new Starfield(art, parent, 900, 560);
  const views = [...field.layers.flatMap(layer => layer.stars.map(star => star.view)), ...field.scenery.map(item => item.view)];
  const contexts = new Set(views.map(view => view.context));
  assert.equal(contexts.size, 5);
  parent.destroy({ children: true });
  assert.ok(views.every(view => view.destroyed));
  assert.ok([...contexts].every(context => !context.destroyed));
  art.destroy();
  assert.ok([...contexts].every(context => context.destroyed));
});

test('distant artwork stays behind stars, reuses geometry on resize and reduces work on mobile', t => {
  const { field, parent } = scene(t);
  const views = field.scenery.map(item => item.view);
  assert.equal(views[0].context, views[1].context);
  assert.ok(views.every(view => parent.getChildIndex(view) < parent.getChildIndex(field.layers[0].view)));
  const x = field.scenery[0].x, y = field.scenery[0].y;
  field.resize(600, 1300, true);
  assert.ok(Math.abs(field.scenery[0].x - x * 600 / 1920) < 1e-8);
  assert.ok(Math.abs(field.scenery[0].y - y * 1300 / 1080) < 1e-8);
  assert.equal(views.filter(view => view.visible).length, 2);
  for (let i = 0; i < 1000; i++) field.update(.05);
  field.resize(1920, 1080, false);
  assert.equal(views.filter(view => view.visible).length, 3);
  assert.deepEqual(field.scenery.map(item => item.view), views);
  assert.ok(views.every(view => !view.destroyed && view.roundPixels));
});

test('decorative drift is frame-rate independent, wraps offscreen and consumes no gameplay RNG', t => {
  let calls = 0;
  const { art, parent } = scene(t);
  const a = new Starfield(art, parent, 900, 560, () => { calls++; return .5; });
  assert.equal(calls, 70 * 4, 'new artwork does not request additional randomness');
  const b = new Starfield(art, parent, 900, 560, () => .5);
  a.scenery.forEach(item => { item.y = 719.99; });
  b.scenery.forEach(item => { item.y = 719.99; });
  for (let i = 0; i < 30; i++) a.update(1 / 30);
  for (let i = 0; i < 144; i++) b.update(1 / 144);
  a.scenery.forEach((item, i) => {
    assert.ok(Math.abs(item.y - b.scenery[i].y) < 1e-8);
    assert.ok(item.y >= -160 && item.y < -160 + item.speed);
    assert.ok(item.speed < a.layers[0].stars[0].speed);
  });
});
