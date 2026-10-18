import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'pixi.js';
import { PixelArt } from '../src/game/PixelArt.ts';
import { CombatEffects } from '../src/game/CombatEffects.ts';

function scene(t) {
  const art = new PixelArt(), root = new Container(), front = new Container(), actors = new Container();
  const player = art.player(), body = player.children[0];
  root.addChild(actors, front); actors.addChild(player);
  const effects = new CombatEffects(art, front, actors, body);
  t.after(() => { root.destroy({ children: true }); art.destroy(); });
  return { art, root, front, actors, player, body, effects };
}

test('cosmetic events use isolated randomness and recycle a bounded pool with reserved flash capacity', t => {
  const { effects, actors, player } = scene(t);
  const views = effects.pool.map(effect => effect.view);
  const random = Math.random;
  Math.random = () => { throw new Error('Visual effect consumed gameplay randomness'); };
  try {
    for (let i = 0; i < 200; i++) effects.meteorTrail(100, 200, 20);
    effects.shot(100, 100, Math.PI / 2);
    assert.equal(effects.pool.filter(e => e.life > 0 && e.kind === 'muzzle').length, 1);
    for (let i = 0; i < 200; i++) effects.meteorDestroyed(100, 100);
    effects.impact(100, 100); effects.damage(100, 100); effects.showWave(2);
    assert.equal(effects.pool.filter(e => e.life > 0).length, 80);
    for (let i = 0; i < 3000; i++) { effects.update(.05); effects.shot(100, 100, 0); effects.meteorTrail(50, 50, 20); }
  } finally { Math.random = random; }
  assert.deepEqual(effects.pool.map(effect => effect.view), views);
  assert.ok(views.every(view => view.roundPixels && !view.destroyed));
  assert.equal(actors.children[0], effects.trails);
  assert.ok(actors.getChildIndex(player) > actors.getChildIndex(effects.trails));
});

test('delta time gives matching spark positions and fades; transient flashes expire quickly', t => {
  const first = scene(t).effects, second = scene(t).effects;
  first.meteorDestroyed(200, 200); second.meteorDestroyed(200, 200);
  first.impact(50, 50); first.shot(70, 70, 0);
  for (let i = 0; i < 4; i++) first.update(.05);
  for (let i = 0; i < 12; i++) second.update(1 / 60);
  for (let i = 1; i <= 5; i++) {
    const a = first.pool[i], b = second.pool[i];
    assert.ok(Math.abs(a.x - b.x) < 1e-8 && Math.abs(a.y - b.y) < 1e-8);
    assert.ok(Math.abs(a.view.alpha - b.view.alpha) < 1e-8);
  }
  assert.equal(first.pool.some(e => e.life > 0 && ['impact', 'muzzle'].includes(e.kind)), false);
  first.update(.2);
  assert.equal(first.pool.some(e => e.life > 0), false);
});

test('compact resize remaps active effects and reduces the pool budget without new graphics', t => {
  const { effects } = scene(t);
  const views = effects.pool.map(e => e.view);
  effects.shot(450, 280, 0);
  const flash = effects.pool[0];
  const beforeX = flash.x;
  effects.resize(600, 1300, true, .65);
  assert.equal(flash.x, beforeX * 600 / 900);
  assert.equal(flash.y, 650);
  assert.equal(effects.banner.x, 300);
  for (let i = 0; i < 100; i++) { effects.meteorDestroyed(100, 100); effects.meteorTrail(100, 100, 20); }
  assert.equal(effects.pool.filter(e => e.life > 0).length, 40);
  effects.resize(1920, 1080, false, 1);
  assert.deepEqual(effects.pool.map(e => e.view), views);
  effects.resize(844 / .975, 400, true, .975);
  effects.showWave(2); effects.update(.2);
  // Caption top clears the existing 90px desktop-width HUD in mobile landscape.
  assert.ok((effects.banner.y - 14) * .975 > 90);
});

test('wave captions support more than two digits and clear or expire without timers', t => {
  const { effects, art, body } = scene(t);
  effects.showWave(2); effects.update(.2);
  assert.ok(effects.banner.visible && effects.banner.alpha > 0);
  assert.equal(effects.digits[0].context, art.waveDigits[0]);
  assert.equal(effects.digits[1].context, art.waveDigits[2]);
  effects.showWave(123);
  assert.equal(effects.digits.length, 3);
  effects.digits.forEach((view, i) => assert.equal(view.context, art.waveDigits[i + 1]));
  effects.update(1.2);
  assert.equal(effects.banner.visible, false);
  effects.damage(100, 100); effects.update(.05);
  assert.notEqual(body.tint, 0xffffff);
  effects.clear();
  assert.equal(body.tint, 0xffffff);
  assert.equal(effects.pool.some(e => e.view.visible), false);
  effects.showWave(1);
  assert.equal(effects.digits[2].visible, false);
});

test('teardown releases pooled graphics and all shared combat and lettering contexts', () => {
  const art = new PixelArt(), front = new Container(), actors = new Container(), player = art.player();
  actors.addChild(player);
  const effects = new CombatEffects(art, front, actors, player.children[0]);
  effects.showWave(12);
  const views = effects.pool.map(e => e.view), contexts = [...Object.values(art.combat), art.waveWord, ...art.waveDigits];
  actors.destroy({ children: true }); front.destroy({ children: true }); art.destroy();
  assert.ok(views.every(view => view.destroyed));
  assert.ok(contexts.every(context => context.destroyed));
});
