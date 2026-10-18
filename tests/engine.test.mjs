import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.ts';
import { STORAGE_KEY } from '../src/game/types.ts';

// Exercise the real engine and Pixi Graphics without requiring a GPU in Node.
// Only browser events, storage and renderer resizing are substituted.
globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 3 });
globalThis.document = new EventTarget();
const storage = new Map();
globalThis.localStorage = { setItem: (key, value) => storage.set(key, value) };

function game(t) {
  const updates = [];
  const engine = new GameEngine(snapshot => updates.push(snapshot));
  engine.setupStage();
  engine.mounted = true;
  engine.start();
  t.after(() => {
    engine.mounted = false;
    engine.app.stage.destroy({ children: true });
    engine.destroy();
  });
  return { engine, updates };
}

test('resize keeps player in bounds and bullet/enemy collision coordinates aligned', t => {
  const { engine } = game(t);
  const renderer = { resize() {}, canvas: { style: {} }, view: { texture: { update() {}, frame: {} } }, screen: { copyFrom() {} } };
  engine.app.renderer = renderer;
  engine.playerX = 878;
  engine.playerY = 534;
  engine.fire();
  engine.spawnEnemy();
  const bullet = engine.bullets[0];
  const enemy = engine.enemies[0];
  bullet.x = enemy.x = 450;
  bullet.y = enemy.y = 250;
  for (const [width, height] of [[390, 844], [844, 390], [1920, 1080], [320, 568]]) {
    engine.host = { getBoundingClientRect: () => ({ width, height }) };
    engine.resize();
    assert.equal(engine.app.renderer, renderer);
    assert.equal(engine.world.scale.x, engine.world.scale.y);
    assert.ok(engine.playerX >= 30 && engine.playerX <= engine.width - 30);
    assert.ok(engine.playerY >= 30 && engine.playerY <= engine.height - 30);
    assert.equal(bullet.x, enemy.x);
    assert.equal(bullet.y, enemy.y);
    assert.equal(bullet.view.x, bullet.x);
    assert.equal(enemy.view.y, enemy.y);
  }
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.score, 100);
  assert.equal(engine.bullets.length, 0);
  assert.equal(engine.enemies.length, 0);
});

test('pause freezes movement, stars, shots, particles, timers and wave progression', t => {
  const { engine, updates } = game(t);
  engine.setControls({ right: true, firing: true });
  engine.tick({ deltaMS: 50 });
  engine.spawnEnemy();
  engine.explode(100, 100, 0xffffff);
  engine.togglePause();
  const read = () => JSON.stringify({
    x: engine.playerX, y: engine.playerY, elapsed: engine.elapsed,
    spawn: engine.spawnCooldown, fire: engine.fireCooldown, invulnerable: engine.invulnerable,
    stars: engine.background.layers.flatMap(layer => layer.stars.map(s => [s.x, s.y])),
    enemies: engine.enemies.map(e => [e.x, e.y, e.view.rotation]),
    bullets: engine.bullets.map(b => [b.x, b.y]),
    particles: engine.particles.map(p => [p.x, p.y, p.life]),
    snapshot: engine.snapshot, updates: updates.length,
  });
  const before = read();
  for (let i = 0; i < 100; i++) engine.tick({ deltaMS: 1000 });
  assert.equal(read(), before);
  engine.togglePause();
  engine.tick({ deltaMS: 50 });
  assert.equal(engine.playerX, JSON.parse(before).x);
  assert.ok(engine.elapsed > JSON.parse(before).elapsed);
});

test('focus loss clears held keyboard and touch input before resuming', t => {
  const { engine } = game(t);
  engine.pressed.add('d');
  engine.setControls({ down: true, firing: true });
  engine.onBlur();
  assert.equal(engine.snapshot.phase, 'paused');
  assert.equal(engine.pressed.size, 0);
  assert.ok(Object.values(engine.input).every(value => value === false));
  engine.togglePause();
  const before = [engine.playerX, engine.playerY];
  engine.tick({ deltaMS: 50 });
  assert.deepEqual([engine.playerX, engine.playerY], before);
  assert.equal(engine.bullets.length, 0);
});

test('thrust follows actual displacement, freezes on pause and resets on replay', t => {
  const { engine } = game(t);
  engine.spawnCooldown = 999;
  const thruster = engine.art.thrusters.get(engine.player);
  engine.setControls({ firing: true });
  engine.tick({ deltaMS: 50 });
  assert.equal(thruster.power, 0, 'firing alone does not boost the flame');
  engine.setControls({ firing: false, right: true });
  engine.tick({ deltaMS: 50 });
  assert.ok(thruster.power > 0);
  engine.togglePause();
  const paused = [thruster.power, thruster.view.alpha, thruster.view.context];
  for (let i = 0; i < 20; i++) engine.tick({ deltaMS: 50 });
  assert.deepEqual([thruster.power, thruster.view.alpha, thruster.view.context], paused);
  engine.togglePause();
  engine.playerX = engine.width - 30;
  engine.setControls({ right: true });
  engine.tick({ deltaMS: 50 });
  assert.ok(thruster.power < paused[0], 'holding movement against the edge eases the flame');
  engine.start();
  assert.equal(thruster.power, 0);
});

test('last life stops the current collision loop and preserves the final score and record', t => {
  const { engine } = game(t);
  storage.clear();
  engine.snapshot.score = 1250;
  engine.snapshot.lives = 1;
  engine.invulnerable = 0;
  for (let i = 0; i < 2; i++) {
    engine.spawnEnemy();
    const enemy = engine.enemies[i];
    enemy.x = engine.playerX;
    enemy.y = engine.playerY;
  }
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.phase, 'gameover');
  assert.equal(engine.snapshot.lives, 0);
  assert.equal(engine.enemies.length, 1);
  assert.equal(storage.get(STORAGE_KEY), '1250');
  const final = JSON.stringify(engine.snapshot);
  engine.loseLife();
  engine.tick({ deltaMS: 50 });
  assert.equal(JSON.stringify(engine.snapshot), final);
  assert.equal(engine.enemies.length, 1);
  engine.start();
  assert.equal(engine.snapshot.phase, 'playing');
  assert.equal(engine.snapshot.lives, 3);
  assert.equal(engine.snapshot.score, 0);
  assert.equal(engine.snapshot.best, 1250);
  assert.equal(engine.enemies.length + engine.particles.length + engine.bullets.length, 0);
});

test('wave progression uses elapsed play time and publishes no duplicate snapshots', t => {
  const { engine, updates } = game(t);
  const count = updates.length;
  engine.publish();
  engine.publish();
  assert.equal(updates.length, count);
  engine.elapsed = 19.99;
  engine.tick({ deltaMS: 50 });
  assert.equal(engine.snapshot.wave, 2);
  assert.equal(engine.snapshot.elapsed, 20);
  assert.equal(updates.length, count + 1);
});

test('combat presentation follows real hit/kill/damage/wave events and freezes with the simulation', t => {
  const { engine } = game(t);
  engine.spawnCooldown = 999;
  engine.spawnEnemy();
  const enemy = engine.enemies[0];
  enemy.health = 2;
  engine.fire();
  enemy.x = engine.bullets[0].x; enemy.y = engine.bullets[0].y;
  engine.tick({ deltaMS: 0 });
  assert.equal(enemy.health, 1);
  assert.equal(engine.snapshot.score, 0);
  assert.ok(engine.combat.pool.some(e => e.life > 0 && e.kind === 'impact'));
  assert.equal(engine.combat.pool.some(e => e.life > 0 && e.kind === 'burst'), false);
  engine.fire(); engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.score, 100);
  assert.equal(engine.enemies.length, 0);
  assert.ok(engine.combat.pool.some(e => e.life > 0 && e.kind === 'burst'));
  engine.elapsed = 19.99; engine.tick({ deltaMS: 50 });
  assert.equal(engine.snapshot.wave, 2);
  assert.ok(engine.combat.banner.visible);
  engine.invulnerable = 0; engine.spawnEnemy();
  engine.enemies[0].x = engine.playerX; engine.enemies[0].y = engine.playerY;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.lives, 2);
  assert.equal(engine.invulnerable, 1.5);
  assert.equal(engine.combat.damageLife, .22);
  engine.tick({ deltaMS: 50 });
  assert.notEqual(engine.player.children[0].tint, 0xffffff);
  engine.togglePause();
  const visualState = () => JSON.stringify([
    engine.combat.pool.map(e => [e.x, e.y, e.life, e.view.alpha]),
    engine.combat.waveLife, engine.combat.damageLife, engine.player.children[0].tint,
  ]);
  const before = visualState();
  for (let i = 0; i < 50; i++) engine.tick({ deltaMS: 50 });
  assert.equal(visualState(), before);
  engine.togglePause(); engine.start();
  assert.equal(engine.player.children[0].tint, 0xffffff);
  assert.equal(engine.combat.pool.some(e => e.life > 0), false);
});

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function mouseCanvas(engine, bounds = { left: 0, top: 0, width: 900, height: 560 }) {
  const capture = new Set();
  const canvas = {
    getBoundingClientRect: () => bounds,
    setPointerCapture: id => capture.add(id),
    hasPointerCapture: id => capture.has(id),
    releasePointerCapture: id => capture.delete(id),
  };
  engine.host = { getBoundingClientRect: () => bounds };
  engine.app.renderer = { canvas, screen: { width: 900, height: 560 } };
  return capture;
}

test('mouse aim accounts for offset and scale, and follows a stationary cursor while moving', t => {
  const { engine } = game(t);
  mouseCanvas(engine, { left: 100, top: 50, width: 450, height: 280 });
  engine.playerX = 450; engine.playerY = 280;
  engine.onPointerMove({ pointerType: 'mouse', clientX: 425, clientY: 190 });
  engine.tick({ deltaMS: 0 });
  near(engine.aimAngle, 0); near(engine.player.rotation, Math.PI / 2);
  engine.setControls({ down: true });
  engine.tick({ deltaMS: 50 });
  assert.ok(engine.aimAngle < 0);
  near(engine.playerX, 450);
  near(engine.playerY, 296);
});

test('shots spawn in front and keep their original velocity after ship rotation', t => {
  const { engine } = game(t);
  engine.playerX = 450; engine.playerY = 280;
  engine.setStick('aim', { x: 1, y: 0 });
  engine.tick({ deltaMS: 0 });
  const first = engine.bullets[0];
  near(first.x, 485); near(first.y, 280);
  near(first.vx, 625); near(first.vy, 0);
  near(first.view.rotation, Math.PI / 2);
  engine.setStick('aim', { x: 0, y: 1 });
  engine.tick({ deltaMS: 50 });
  near(first.x, 485 + 625 * .05); near(first.y, 280);
  near(first.vx, 625); near(first.vy, 0);
  near(engine.player.rotation, Math.PI);
  engine.setStick('aim', { x: 0, y: 0 });
  const count = engine.bullets.length;
  for (let i = 0; i < 5; i++) engine.tick({ deltaMS: 20 });
  assert.equal(engine.bullets.length, count);
});

test('the four cardinal aim directions produce matching muzzle positions and bullet velocities', t => {
  const { engine } = game(t);
  for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    engine.setStick('aim', { x, y });
    engine.fire();
    const bullet = engine.bullets.at(-1);
    near(bullet.x - engine.playerX, x * 35);
    near(bullet.y - engine.playerY, y * 35);
    near(bullet.vx, x * 625);
    near(bullet.vy, y * 625);
  }
});

test('keyboard movement is independent of aim and diagonals stay normalized', t => {
  const { engine } = game(t);
  engine.playerX = 450; engine.playerY = 280;
  engine.setStick('aim', { x: 1, y: 0 });
  engine.pressed.add('a');
  engine.tick({ deltaMS: 50 });
  near(engine.playerX, 434); near(engine.playerY, 280);
  engine.pressed.clear(); engine.pressed.add('w'); engine.pressed.add('d');
  const x = engine.playerX, y = engine.playerY;
  engine.tick({ deltaMS: 50 });
  near(Math.hypot(engine.playerX - x, engine.playerY - y), 16);
  engine.pressed.clear();
  engine.setStick('move', { x: -.5, y: 0 });
  const partialX = engine.playerX;
  engine.tick({ deltaMS: 50 });
  near(engine.playerX, partialX - 8);
});

test('mouse clicks, held mouse and Space share one fire cooldown', t => {
  const { engine } = game(t);
  const captured = mouseCanvas(engine);
  const down = { pointerType: 'mouse', pointerId: 1, clientX: 700, clientY: 200, button: 0, preventDefault() {} };
  engine.onPointerDown(down);
  assert.equal(engine.bullets.length, 1);
  engine.onPointerEnd({ pointerId: 1 });
  assert.equal(captured.size, 0);
  engine.onPointerDown(down);
  engine.pressed.add(' ');
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.bullets.length, 1);
  for (let i = 0; i < 8; i++) engine.tick({ deltaMS: 20 });
  assert.equal(engine.bullets.length, 1);
  engine.tick({ deltaMS: 20 });
  assert.equal(engine.bullets.length, 2);
  engine.onPointerEnd({ pointerId: 1 });
  engine.pressed.clear();
  for (let i = 0; i < 10; i++) engine.tick({ deltaMS: 20 });
  assert.equal(engine.bullets.length, 2);
});

test('menu, pause and Game Over reject mouse, stick and direct fire', t => {
  const { engine } = game(t);
  mouseCanvas(engine);
  for (const phase of ['ready', 'paused', 'gameover']) {
    engine.snapshot.phase = phase;
    engine.onPointerDown({ pointerType: 'mouse', button: 0 });
    engine.setStick('aim', { x: 1, y: 0 });
    engine.pressed.add(' ');
    engine.fire();
    engine.tick({ deltaMS: 50 });
    assert.equal(engine.bullets.length, 0);
    assert.deepEqual(engine.aimStick, { x: 0, y: 0 });
    assert.equal(engine.mousePointerId, null);
  }
});

test('focus loss, pause and pointercancel release analog and mouse firing inputs', t => {
  const { engine } = game(t);
  const captured = mouseCanvas(engine);
  engine.onPointerDown({ pointerType: 'mouse', pointerId: 7, button: 0, clientX: 500, clientY: 100, preventDefault() {} });
  engine.onPointerEnd({ pointerId: 99 });
  assert.equal(engine.mousePointerId, 7);
  engine.onPointerEnd({ pointerId: 7 });
  assert.equal(engine.mousePointerId, null);
  engine.setStick('move', { x: 1, y: 1 });
  engine.setStick('aim', { x: 1, y: 0 });
  engine.onBlur();
  assert.equal(engine.snapshot.phase, 'paused');
  assert.deepEqual(engine.moveStick, { x: 0, y: 0 });
  assert.deepEqual(engine.aimStick, { x: 0, y: 0 });
  assert.equal(captured.size, 0);
  engine.togglePause();
  const count = engine.bullets.length;
  engine.tick({ deltaMS: 50 });
  assert.equal(engine.bullets.length, count);
});

test('meteors leaving bottom or sides do not damage, score or explode and waves keep advancing', t => {
  const { engine } = game(t);
  engine.invulnerable = 0;
  engine.snapshot.score = 1500;
  const exits = [
    enemy => { enemy.y = engine.height + enemy.radius * 1.25 + 1; },
    enemy => { enemy.x = -enemy.radius * 1.25 - 1; },
    enemy => { enemy.x = engine.width + enemy.radius * 1.25 + 1; },
  ];
  for (const exit of exits) {
    engine.spawnEnemy();
    const enemy = engine.enemies[0];
    exit(enemy);
    engine.tick({ deltaMS: 0 });
    assert.equal(enemy.view.destroyed, true);
    assert.equal(engine.enemies.length, 0);
    assert.equal(engine.snapshot.lives, 3);
    assert.equal(engine.snapshot.score, 1500);
    assert.equal(engine.snapshot.phase, 'playing');
    assert.equal(engine.particles.length, 0);
  }
  engine.elapsed = 19.99;
  engine.tick({ deltaMS: 50 });
  assert.equal(engine.snapshot.wave, 2);
  assert.equal(engine.snapshot.lives, 3);
});

test('direct contact near a border damages once and respects invulnerability', t => {
  const { engine } = game(t);
  engine.invulnerable = 0;
  engine.playerY = engine.height - 26;
  engine.spawnEnemy();
  const enemy = engine.enemies[0];
  enemy.x = engine.playerX;
  enemy.y = engine.height + 2;
  enemy.radius = 23;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.lives, 2);
  assert.equal(enemy.view.destroyed, true);
  engine.spawnEnemy();
  engine.enemies[0].x = engine.playerX;
  engine.enemies[0].y = engine.playerY;
  engine.tick({ deltaMS: 50 });
  assert.equal(engine.snapshot.lives, 2);
  assert.equal(engine.snapshot.phase, 'playing');
});

test('partially visible meteors stay alive until they have completely left the field', t => {
  const { engine } = game(t);
  engine.spawnEnemy();
  const enemy = engine.enemies[0];
  enemy.y = engine.height + enemy.radius - 1;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.enemies.length, 1);
  assert.equal(engine.snapshot.lives, 3);
});

test('the enlarged visual edge stays alive past the hitbox boundary and leaves without penalty', t => {
  const { engine } = game(t);
  engine.invulnerable = 0;
  engine.spawnEnemy();
  const enemy = engine.enemies[0];
  enemy.y = engine.height + enemy.radius * 1.1;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.enemies.length, 1);
  enemy.y = engine.height + enemy.radius * 1.25 + .1;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.enemies.length, 0);
  assert.equal(engine.snapshot.lives, 3);
  assert.equal(engine.snapshot.score, 0);
  assert.equal(engine.particles.length, 0);
});

test('larger artwork does not expand the original ship or meteor collision radii', t => {
  const { engine } = game(t);
  engine.invulnerable = 0;
  engine.playerX = 450; engine.playerY = 280;
  engine.spawnEnemy();
  const enemy = engine.enemies[0];
  const radius = enemy.radius;
  enemy.x = engine.playerX + 17 + radius + .1;
  enemy.y = engine.playerY;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.lives, 3);
  assert.equal(engine.enemies.length, 1);
  assert.equal(enemy.radius, radius);
  enemy.x = engine.playerX + 17 + radius - .1;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.snapshot.lives, 2);
  assert.equal(engine.enemies.length, 0);
});

test('directional bullet collisions award the existing 100 points and retain effects', t => {
  const { engine } = game(t);
  engine.setStick('aim', { x: -1, y: 0 });
  engine.tick({ deltaMS: 0 });
  engine.spawnEnemy();
  engine.enemies[0].x = engine.bullets[0].x;
  engine.enemies[0].y = engine.bullets[0].y;
  engine.tick({ deltaMS: 0 });
  assert.equal(engine.bullets.length, 0);
  assert.equal(engine.enemies.length, 0);
  assert.equal(engine.snapshot.score, 100);
  assert.equal(engine.snapshot.lives, 3);
  assert.ok(engine.particles.length > 0);
});

test('projectile travel is frame-rate independent and all four exit edges remove bullets', t => {
  const first = game(t).engine, second = game(t).engine;
  for (const engine of [first, second]) {
    engine.playerX = 450; engine.playerY = 280;
    engine.aimAngle = Math.PI / 4;
    engine.fire();
  }
  for (let i = 0; i < 4; i++) first.tick({ deltaMS: 50 });
  for (let i = 0; i < 12; i++) second.tick({ deltaMS: 1000 / 60 });
  near(first.bullets[0].x, second.bullets[0].x);
  near(first.bullets[0].y, second.bullets[0].y);
  first.resetEntities();
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    first.aimAngle = angle;
    first.fire();
    const b = first.bullets.at(-1);
    b.x = angle === 0 ? first.width + 23 : angle === Math.PI ? -23 : 450;
    b.y = angle === Math.PI / 2 ? first.height + 23 : angle === -Math.PI / 2 ? -23 : 280;
  }
  first.tick({ deltaMS: 0 });
  assert.equal(first.bullets.length, 0);
});
