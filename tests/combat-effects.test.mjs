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
  const views = [...effects.pool.map(e => e.view), ...effects.indicators.map(e => e.view)], contexts = [...Object.values(art.combat), art.waveWord, ...art.waveDigits];
  actors.destroy({ children: true }); front.destroy({ children: true }); art.destroy();
  assert.ok(views.every(view => view.destroyed));
  assert.ok(contexts.every(context => context.destroyed));
});

const meteor = (x = 450, y = -40, speed = 100, wobble = 0) => ({ x, y, radius: 20, speed, wobble });
const arrows = effects => effects.indicators.filter(slot => slot.view.visible);
const cues = (effects, kind) => effects.pool.filter(effect => effect.life > 0 && effect.kind === kind);

test('arrows warn only about nearby incoming trajectories threatening a vulnerable player', t => {
  const { effects } = scene(t);
  const threat = Object.freeze(meteor());
  effects.trackMeteors([threat], 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 1);
  assert.equal(arrows(effects)[0].meteor, threat);
  for (const [objects, x, y, invulnerable] of [
    [[threat], 450, 470, 0], // Visible entry is far from the player's future path.
    [[meteor(100)], 450, 70, 0],
    [[meteor(450, -200)], 450, 30, 0],
    [[threat], 450, 70, 2],
    [[meteor(450, 600)], 450, 520, 0],
    [[meteor(-30, 100, 100, -Math.PI / 2)], 30, 200, 0],
  ]) {
    effects.trackMeteors(objects, x, y, 0, invulnerable);
    assert.equal(arrows(effects).length, 0);
  }
});

test('arrows disappear immediately on visibility, threat removal or a changed player path', t => {
  const { effects } = scene(t);
  const threat = meteor();
  effects.trackMeteors([threat], 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 1);
  threat.y = -24;
  effects.trackMeteors([threat], 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 0);
  threat.y = -40;
  effects.trackMeteors([threat], 450, 70, 0, 0);
  effects.trackMeteors([], 450, 70, 0, 0);
  assert.ok(effects.indicators.every(slot => !slot.view.visible && slot.meteor === null));
  effects.trackMeteors([threat], 450, 70, 0, 0);
  effects.trackMeteors([threat], 700, 70, 0, 0);
  assert.equal(arrows(effects).length, 0);
});

test('indicator pool is capped at three desktop/two compact and prioritizes more urgent threats', t => {
  const { effects } = scene(t);
  const objects = [meteor(395), meteor(430), meteor(465), meteor(500, -28, 200)];
  const views = effects.indicators.map(slot => slot.view);
  assert.ok(views.every(view => view.context === views[0].context));
  effects.trackMeteors(objects, 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 3);
  assert.ok(arrows(effects).some(slot => slot.meteor === objects[3]));
  effects.resize(600, 1300, true, .65);
  effects.trackMeteors(objects, 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 2);
  assert.deepEqual(effects.indicators.map(slot => slot.view), views);
});

test('a more urgent centered threat merges overlapping arrows rather than stacking them', t => {
  const { effects } = scene(t);
  const objects = [meteor(420), meteor(480), meteor(450, -28, 200)];
  effects.trackMeteors(objects, 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 1);
  assert.equal(arrows(effects)[0].meteor, objects[2]);
});

test('indicators respect viewport, HUD safe areas and both compact joystick corners', t => {
  const { effects } = scene(t);
  effects.resize(600, 1300, true, .65, { top: 44, left: 10, right: 10, bottom: 34 });
  effects.trackMeteors([meteor()], 450, 70, 0, 0);
  const arrow = arrows(effects)[0];
  assert.ok(arrow.y * .65 - arrow.view.height * .65 / 2 > 44 + 62);
  assert.ok(arrow.x > 0 && arrow.x < 600);
  const incomingLeft = meteor(-30, 1200, 100, Math.PI / 2);
  effects.trackMeteors([incomingLeft], 30, 1250, 0, 0);
  assert.equal(arrows(effects).length, 0);
  effects.trackMeteors([meteor(630, 1200, 100, -Math.PI / 2)], 570, 1250, 0, 0);
  assert.equal(arrows(effects).length, 0);
  effects.trackMeteors([meteor(-30, 100, 100, Math.PI / 2)], 30, 200, 0, 0);
  assert.equal(arrows(effects).length, 1);
  assert.equal(arrows(effects)[0].view.rotation, -Math.PI / 2);
  effects.resize(1024, 1366, false, 1);
  effects.trackMeteors([meteor(-30, 1250, 100, Math.PI / 2)], 30, 1300, 0, 0);
  assert.equal(arrows(effects).length, 0, 'large tablet joystick space stays clear too');
});

test('entry cues occur once on visible entry and use decorative slots without delaying entities', t => {
  const { effects } = scene(t);
  const object = meteor(450, -30);
  effects.trackMeteors([object], 450, 470, 0, 0);
  assert.equal(cues(effects, 'entry').length, 0);
  object.y = -24;
  effects.trackMeteors([object], 450, 470, 0, 0);
  assert.equal(cues(effects, 'entry').length, 0, 'entry accent stays out of the HUD gradient');
  object.y = 50;
  const before = JSON.stringify(object);
  effects.trackMeteors([object], 450, 470, 0, 0);
  assert.equal(JSON.stringify(object), before);
  const entry = cues(effects, 'entry')[0];
  assert.ok(effects.pool.indexOf(entry) >= 32);
  assert.equal(entry.maxLife, .18);
  assert.ok(entry.y >= 72);
  effects.update(.2);
  effects.trackMeteors([object], 450, 470, 0, 0);
  assert.equal(cues(effects, 'entry').length, 0);
  assert.equal(effects.pool.length, 80);
});

test('near-miss cue waits until a safe close pass and never repeats for the same meteor', t => {
  const { effects } = scene(t);
  const object = meteor(491, 250);
  for (const y of [250, 270, 290]) { object.y = y; effects.trackMeteors([object], 450, 280, 0, 0); }
  assert.equal(cues(effects, 'near').length, 0);
  object.y = 300; effects.trackMeteors([object], 450, 280, 0, 0);
  assert.equal(cues(effects, 'near').length, 1);
  assert.equal(cues(effects, 'near')[0].maxLife, .18);
  assert.equal(effects.observations.get(object).grazed, true);
  effects.update(.5);
  for (const y of [250, 270, 290, 300]) { object.y = y; effects.trackMeteors([object], 450, 280, 0, 0); }
  assert.equal(cues(effects, 'near').length, 0);
});

test('geometric contact, distant passes and invulnerability cannot produce a near-miss cue', t => {
  const { effects } = scene(t);
  for (const [x, invulnerable] of [[485, 0], [540, 0], [491, 1]]) {
    const object = meteor(x, 250);
    for (const y of [250, 270, 280, 290, 300]) { object.y = y; effects.trackMeteors([object], 450, 280, 0, invulnerable); }
    assert.equal(cues(effects, 'near').length, 0);
  }
});

test('pause/Game Over hide new cues and stop their clocks; restart clears observations', t => {
  const { effects } = scene(t);
  const object = meteor(450, -24);
  effects.trackMeteors([object], 450, 470, 0, 0);
  object.y = 50; effects.trackMeteors([object], 450, 470, 0, 0);
  effects.setPlaying(false);
  const before = effects.pool.map(effect => effect.life);
  effects.update(.5); effects.trackMeteors([meteor()], 450, 70, 0, 0);
  assert.deepEqual(effects.pool.map(effect => effect.life), before);
  assert.equal(arrows(effects).length, 0);
  assert.equal(effects.pool.some(effect => ['near', 'entry'].includes(effect.kind) && effect.view.visible), false);
  effects.clear(); effects.setPlaying(true);
  assert.equal(effects.observations.has(object), false);
  object.y = -24; effects.trackMeteors([object], 450, 470, 0, 0);
  object.y = 50;
  effects.trackMeteors([object], 450, 470, 0, 0);
  assert.equal(cues(effects, 'entry').length, 1);
});

test('reduced motion keeps static arrows and wave text while removing travel and repeated muzzle flashes', t => {
  const { effects } = scene(t);
  effects.setReducedMotion(true);
  effects.shot(100, 100, 0); effects.meteorTrail(100, 100, 20);
  assert.equal(effects.pool.some(effect => effect.life > 0), false);
  effects.meteorDestroyed(100, 100); effects.showWave(2);
  const y = effects.banner.y;
  effects.update(.1);
  assert.equal(effects.banner.y, y);
  assert.ok(cues(effects, 'spark').every(effect => effect.vx === 0 && effect.vy === 0));
  effects.trackMeteors([meteor()], 450, 70, 0, 0);
  assert.equal(arrows(effects).length, 1);
  assert.ok(cues(effects, 'burst')[0].opacity <= .5);
});

test('threat tracking reuses all geometry without game RNG or frame-rate-dependent cue motion', t => {
  const first = scene(t), second = scene(t);
  const views = first.effects.pool.map(effect => effect.view), indicators = first.effects.indicators.map(slot => slot.view);
  first.art.combatEffect = () => { throw Error('Allocated graphics after initialization'); };
  const original = Math.random;
  Math.random = () => { throw Error('Consumed gameplay RNG'); };
  try {
    const object = meteor(450, -24);
    first.effects.trackMeteors([object], 450, 470, 0, 0);
    const other = meteor(450, -24);
    second.effects.trackMeteors([other], 450, 470, 0, 0);
    object.y = other.y = 50;
    first.effects.trackMeteors([object], 450, 470, 0, 0);
    second.effects.trackMeteors([other], 450, 470, 0, 0);
    for (let i = 0; i < 3; i++) first.effects.update(1 / 30);
    for (let i = 0; i < 14; i++) second.effects.update(1 / 140);
    const a = cues(first.effects, 'entry')[0], b = cues(second.effects, 'entry')[0];
    assert.ok(Math.abs(a.y - b.y) < 1e-8 && Math.abs(a.view.alpha - b.view.alpha) < 1e-8);
    for (let i = 0; i < 3000; i++) first.effects.trackMeteors([object], 450, 470, 0, 0);
  } finally { Math.random = original; }
  assert.deepEqual(first.effects.pool.map(effect => effect.view), views);
  assert.deepEqual(first.effects.indicators.map(slot => slot.view), indicators);
});
