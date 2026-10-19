import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelArt } from '../src/game/PixelArt.ts';
import { GameEngine } from '../src/game/GameEngine.ts';

globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
globalThis.document = new EventTarget();

test('removing one entity keeps shared artwork usable until the owner is disposed', () => {
  const art = new PixelArt();
  const first = art.bullet(), second = art.bullet();
  const context = second.context;
  assert.equal(first.context, context);
  first.destroy();
  assert.equal(first.destroyed, true);
  assert.equal(context.destroyed, false);
  assert.ok(second.bounds.width > 0);
  const meteor = art.meteor(18), nextMeteor = art.meteor(18);
  assert.equal(meteor.context, nextMeteor.context);
  meteor.destroy();
  assert.equal(nextMeteor.context.destroyed, false);
  second.destroy(); nextMeteor.destroy();
  art.destroy(); art.destroy();
  assert.equal(context.destroyed, true);
});

test('thruster animation reuses four pixel contexts without changing the ship or rotation origin', () => {
  const art = new PixelArt();
  const player = art.player();
  player.position.set(150, 300);
  player.rotation = Math.PI / 3;
  player.scale.set(.65);
  const frames = new Set();
  const body = player.children[0].context;
  const flame = player.children[1];
  for (let i = 0; i < 1000; i++) {
    art.animateThruster(player, i / 60, 1 / 60, Math.floor(i / 120) % 2);
    frames.add(flame.context);
    assert.equal(player.children[0].context, body);
    assert.equal(player.x, 150);
    assert.equal(player.y, 300);
    assert.equal(player.rotation, Math.PI / 3);
    assert.equal(player.pivot.x, 0);
    assert.equal(player.pivot.y, 0);
    assert.equal(player.scale.x, .65);
    assert.equal(flame.parent, player);
    assert.deepEqual([flame.x, flame.y, flame.rotation, flame.scale.x, flame.scale.y], [0, 16, 0, 1, 1]);
  }
  assert.equal(frames.size, 4);
  for (const frame of frames) {
    assert.equal(frame.bounds.minY, 0);
    assert.ok(frame.bounds.maxY + flame.y <= 24);
  }
  player.destroy({ children: true }); art.destroy();
  assert.equal(flame.destroyed, true);
  assert.ok([...frames].every(frame => frame.destroyed));
});

test('idle pulses gently, motion grows the flame and release eases back before reset', () => {
  const art = new PixelArt(), player = art.player(), sibling = art.player();
  const flame = player.children[1], otherFlame = sibling.children[1];
  const idleFrames = new Set(), alphas = [];
  for (let i = 0; i < 120; i++) {
    art.animateThruster(player, i / 60, 1 / 60, 0);
    idleFrames.add(flame.context);
    alphas.push(flame.alpha);
  }
  assert.equal(idleFrames.size, 2);
  assert.ok(Math.min(...alphas) >= .5 && Math.max(...alphas) <= .62);
  art.resetThruster(player);
  const idleAlpha = flame.alpha, siblingAlpha = otherFlame.alpha;
  art.animateThruster(player, 0, .05, 1);
  const rising = flame.alpha;
  for (let i = 0; i < 20; i++) art.animateThruster(player, 0, .05, 1);
  const moving = flame.alpha;
  assert.ok(moving > rising && rising > idleAlpha);
  assert.ok(flame.context.bounds.height > Math.max(...[...idleFrames].map(frame => frame.bounds.height)));
  art.animateThruster(player, 0, .05, 0);
  assert.ok(flame.alpha < moving && flame.alpha > idleAlpha);
  for (let i = 0; i < 40; i++) art.animateThruster(player, 0, .05, 0);
  assert.ok(Math.abs(flame.alpha - idleAlpha) < 1e-6);
  assert.equal(otherFlame.alpha, siblingAlpha);
  art.animateThruster(player, 0, .5, 1);
  art.resetThruster(player);
  assert.equal(flame.alpha, idleAlpha);
  player.destroy({ children: true }); sibling.destroy({ children: true }); art.destroy();
});

test('thruster attack and release match at 30, 60 and 144 FPS', () => {
  const art = new PixelArt();
  const samples = [];
  for (const fps of [30, 60, 144]) {
    const player = art.player(), flame = player.children[1];
    let elapsed = 0;
    const stages = [];
    for (const target of [0, .4, 1, 0]) {
      for (let i = 0; i < fps; i++) {
        elapsed += 1 / fps;
        art.animateThruster(player, elapsed, 1 / fps, target);
      }
      stages.push({ alpha: flame.alpha, frame: flame.context });
    }
    samples.push(stages);
    player.destroy({ children: true });
  }
  for (const stages of samples.slice(1)) {
    stages.forEach((sample, i) => {
      assert.ok(Math.abs(sample.alpha - samples[0][i].alpha) < 1e-10);
      assert.equal(sample.frame, samples[0][i].frame);
    });
  }
  art.destroy();
});

test('refined ship keeps symmetric pixel panels and the existing bounds, pivot and exhaust', () => {
  const art = new PixelArt(), player = art.player();
  const body = player.children[0], flame = player.children[1], bounds = body.context.bounds;
  assert.deepEqual([bounds.minX, bounds.maxX, bounds.minY, bounds.maxY], [-17, 17, -24, 16]);
  for (const fill of body.context.instructions) {
    const rectangles = fill.data.path.instructions.filter(item => item.action === 'rect').map(item => item.data.slice(0, 4));
    for (const [x, y, width, height] of rectangles) {
      assert.equal(height, 2);
      // Adjacent pixels may be merged into different runs on the two sides.
      for (let pixel = x; pixel < x + width; pixel += 2) {
        const mirror = -pixel - 2;
        assert.ok(rectangles.some(([rx, ry, rw]) => ry === y && mirror >= rx && mirror < rx + rw));
      }
    }
  }
  assert.deepEqual([player.pivot.x, player.pivot.y, flame.x, flame.y], [0, 0, 0, 16]);
  player.destroy({ children: true }); art.destroy();
});

test('three meteor silhouettes remain bounded and share geometry across instances', () => {
  const art = new PixelArt();
  const variants = [14.1, 14.2, 14.3].map(radius => art.meteor(radius));
  const signatures = new Set(variants.map(view => JSON.stringify(view.context.instructions.map(fill =>
    fill.data.path.instructions.map(item => item.data.slice(0, 4))))));
  assert.equal(signatures.size, 3);
  variants.forEach(view => {
    const bounds = view.context.bounds;
    assert.ok(bounds.minX >= -17 && bounds.maxX <= 17 && bounds.minY >= -17 && bounds.maxY <= 17);
    const sibling = art.meteor(14.1 + variants.indexOf(view) * .1);
    assert.equal(view.context, sibling.context);
    sibling.destroy(); view.destroy();
  });
  art.destroy();
});

test('destroying an engine before mounting releases its scene and shared art', () => {
  const engine = new GameEngine(() => {});
  const context = engine.player.children[0].context;
  const stage = engine.app.stage;
  engine.destroy(); engine.destroy();
  assert.equal(stage.destroyed, true);
  assert.equal(context.destroyed, true);
});

test('an async mount that finishes after unmount releases artwork after initialization', async () => {
  const engine = new GameEngine(() => {});
  const context = engine.player.children[0].context;
  let finish;
  engine.app.init = () => new Promise(resolve => { finish = resolve; });
  engine.app.destroy = () => engine.app.stage.destroy({ children: true });
  const mounting = engine.mount({ getBoundingClientRect: () => ({ width: 900, height: 560 }) });
  engine.destroy();
  assert.equal(context.destroyed, false);
  finish();
  await mounting;
  assert.equal(context.destroyed, true);
  assert.equal(engine.app.stage.destroyed, true);
});

test('failed renderer initialization also releases the shared art', async () => {
  const engine = new GameEngine(() => {});
  const context = engine.player.children[0].context;
  engine.app.init = async () => { throw new Error('renderer unavailable'); };
  await assert.rejects(engine.mount({ getBoundingClientRect: () => ({ width: 900, height: 560 }) }), /renderer unavailable/);
  engine.destroy();
  assert.equal(context.destroyed, true);
});
