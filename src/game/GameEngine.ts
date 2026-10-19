import { Application, Container, Graphics } from 'pixi.js';
import { aimAt, circlesOverlap, clamp, cursorToWorld, limitedDirection } from './math.ts';
import { HEIGHT, MAX_LIVES, STORAGE_KEY, WIDTH, type Controls, type Snapshot, type Stick, type Vector } from './types.ts';
import { measureViewport } from './viewport.ts';
import { ACTOR_VISUAL_SCALE, PixelArt } from './PixelArt.ts';
import { Starfield } from './Starfield.ts';
import { CombatEffects } from './CombatEffects.ts';
import type { GameEvent } from './events.ts';

// The nose is 24 units from the pivot in the original pixel map.
const PLAYER_VISUAL_RADIUS = 24 * ACTOR_VISUAL_SCALE;
const MUZZLE_DISTANCE = 28 * ACTOR_VISUAL_SCALE;

type Enemy = { view: Graphics; x: number; y: number; radius: number; speed: number; health: number; wobble: number; dustTime: number };
type Bullet = { view: Graphics; x: number; y: number; radius: number; vx: number; vy: number };
type Particle = { view: Graphics; x: number; y: number; vx: number; vy: number; life: number; maxLife: number };

export class GameEngine {
  private app = new Application();
  private world = new Container();
  private decor = new Container();
  private actors = new Container();
  private fx = new Container();
  private art = new PixelArt();
  private player = this.art.player();
  private combat = new CombatEffects(this.art, this.fx, this.actors, this.player.children[0] as Graphics);
  private width = WIDTH;
  private height = HEIGHT;
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;
  private motionQuery: MediaQueryList | null = null;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private background: Starfield | null = null;
  private input: Controls = { left: false, right: false, up: false, down: false, firing: false };
  private pressed = new Set<string>();
  private moveStick: Vector = { x: 0, y: 0 };
  private aimStick: Vector = { x: 0, y: 0 };
  private aimAngle = -Math.PI / 2;
  private aimSource: 'mouse' | 'stick' = 'mouse';
  private cursor: Vector | null = null;
  private mousePointerId: number | null = null;
  private playerX = WIDTH / 2;
  private playerY = HEIGHT - 90;
  private elapsed = 0;
  private fireCooldown = 0;
  private spawnCooldown = 0;
  private invulnerable = 0;
  private emissionCooldown = 0;
  private mounted = false;
  private initializing = false;
  private destroyed = false;
  private rafIsRunning = false;
  private onChange: (snapshot: Snapshot) => void;
  private onEvent?: (event: GameEvent) => void;
  private lastPublished: Snapshot | null = null;
  private snapshot: Snapshot = { phase: 'ready', score: 0, lives: MAX_LIVES, wave: 1, elapsed: 0, best: 0, mute: false };

  constructor(onChange: (snapshot: Snapshot) => void, onEvent?: (event: GameEvent) => void) {
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.app.stage.addChild(this.world);
    this.world.addChild(this.decor, this.actors, this.fx);
    this.actors.addChild(this.player);
    this.combat.setPlaying(false);
  }

  async mount(host: HTMLElement) {
    if (this.destroyed) return;
    this.initializing = true;
    const bounds = host.getBoundingClientRect();
    const viewport = measureViewport(Math.max(1, bounds.width), Math.max(1, bounds.height), window.devicePixelRatio);
    try {
      await this.app.init({ width: viewport.width, height: viewport.height, background: '#060b1a', antialias: false, roundPixels: true, resolution: viewport.resolution, autoDensity: true, preference: 'webgl' });
    } catch (error) {
      this.app.stage.destroy({ children: true });
      this.art.destroy();
      throw error;
    } finally {
      this.initializing = false;
    }
    if (this.destroyed) { this.app.destroy(true, { children: true }); this.art.destroy(); return; }
    this.mounted = true;
    this.host = host;
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-label', 'Campo de batalha do Neon Survivor');
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.setupStage();
    this.motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    this.combat.setReducedMotion(this.motionQuery?.matches ?? false);
    this.motionQuery?.addEventListener('change', this.onMotionChange);
    this.resize();
    this.resizeObserver = new ResizeObserver(this.scheduleResize);
    this.resizeObserver.observe(host);
    try { this.snapshot.best = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { /* private mode */ }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.scheduleResize);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerEnd);
    window.addEventListener('pointercancel', this.onPointerEnd);
    this.app.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.app.canvas.addEventListener('lostpointercapture', this.onPointerEnd);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.app.ticker.add(this.tick);
    this.rafIsRunning = true;
    this.publish();
  }

  private setupStage() {
    this.background = new Starfield(this.art, this.decor, this.width, this.height);
    this.player.position.set(this.playerX, this.playerY);
  }

  private scheduleResize = () => {
    if (!this.resizeFrame && !this.destroyed) this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  };

  private resize = () => {
    if (!this.mounted || !this.host) return;
    const bounds = this.host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const viewport = measureViewport(bounds.width, bounds.height, window.devicePixelRatio);
    const ratioX = viewport.worldWidth / this.width;
    const ratioY = viewport.worldHeight / this.height;
    this.width = viewport.worldWidth;
    this.height = viewport.worldHeight;
    this.app.renderer.resize(viewport.width, viewport.height, viewport.resolution);
    // A changed DPR can keep the same physical buffer size. Refresh its logical
    // frame explicitly, since Pixi may skip the texture's resize notification.
    const texture = this.app.renderer.view.texture;
    texture.update();
    this.app.screen.copyFrom(texture.frame);
    // autoDensity rounds the backing buffer; CSS must still fill the host exactly.
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = '100%';
    this.world.scale.set(viewport.scale);
    this.playerX = clamp(this.playerX * ratioX, PLAYER_VISUAL_RADIUS, this.width - PLAYER_VISUAL_RADIUS);
    this.playerY = clamp(this.playerY * ratioY, PLAYER_VISUAL_RADIUS, this.height - PLAYER_VISUAL_RADIUS);
    this.player.position.set(this.playerX, this.playerY);
    // Reposition all entities together; radii and speeds stay in world units.
    for (const entity of [...this.enemies, ...this.bullets, ...this.particles]) {
      entity.x *= ratioX;
      entity.y *= ratioY;
      entity.view.position.set(entity.x, entity.y);
    }
    this.background?.resize(this.width, this.height, Math.min(bounds.width, bounds.height) <= 600);
    const styles = typeof getComputedStyle === 'function' ? getComputedStyle(this.host) : null;
    this.combat.resize(this.width, this.height, Math.min(bounds.width, bounds.height) <= 600, viewport.scale, {
      top: (Number.parseFloat(styles?.getPropertyValue('--safe-top') ?? '') || 0)
        + (Number.parseFloat(styles?.getPropertyValue('--hud-extra-height') ?? '') || 0),
      right: Number.parseFloat(styles?.getPropertyValue('--safe-right') ?? '') || 0,
      bottom: Number.parseFloat(styles?.getPropertyValue('--safe-bottom') ?? '') || 0,
      left: Number.parseFloat(styles?.getPropertyValue('--safe-left') ?? '') || 0,
    });
  };

  private onMotionChange = (event: MediaQueryListEvent) => this.combat.setReducedMotion(event.matches);

  private onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (event.target instanceof HTMLElement && event.target.closest('dialog, input, select, textarea')) return;
    // Let focused menu buttons receive their native Space/Enter activation once.
    if ((key === ' ' || key === 'enter') && event.target instanceof HTMLElement && event.target.closest('button')) return;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
    this.pressed.add(key);
    if (!event.repeat && (key === 'p' || key === 'escape')) this.togglePause();
    if (!event.repeat && key === 'enter' && (this.snapshot.phase === 'ready' || this.snapshot.phase === 'gameover')) { event.preventDefault(); this.start(); }
  };
  private onKeyUp = (event: KeyboardEvent) => { this.pressed.delete(event.key.toLowerCase()); };
  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (!this.cursor) this.cursor = { x: event.clientX, y: event.clientY };
    else { this.cursor.x = event.clientX; this.cursor.y = event.clientY; }
    this.aimSource = 'mouse';
  };
  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0 || this.snapshot.phase !== 'playing') return;
    event.preventDefault();
    this.onPointerMove(event);
    this.mousePointerId = event.pointerId;
    this.app.canvas.setPointerCapture(event.pointerId);
    // A short click between two ticker frames must still produce a shot.
    this.updateAim();
    if (this.fireCooldown <= 0) { this.fire(); this.fireCooldown = 0.17; }
  };
  private onPointerEnd = (event: PointerEvent) => {
    if (this.mousePointerId !== event.pointerId) return;
    this.mousePointerId = null;
    if (this.app.canvas.hasPointerCapture(event.pointerId)) this.app.canvas.releasePointerCapture(event.pointerId);
  };
  private updateAim() {
    if (this.aimSource === 'mouse' && this.cursor && this.host) {
      const bounds = this.app.canvas.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        const target = cursorToWorld(this.cursor.x, this.cursor.y, bounds, this.app.screen.width / this.world.scale.x, this.app.screen.height / this.world.scale.y);
        this.aimAngle = aimAt(this.playerX, this.playerY, target.x, target.y, this.aimAngle);
      }
    }
    this.player.rotation = this.aimAngle + Math.PI / 2;
  }
  private clearControls() {
    this.pressed.clear();
    this.input = { left: false, right: false, up: false, down: false, firing: false };
    this.moveStick.x = this.moveStick.y = this.aimStick.x = this.aimStick.y = 0;
    const pointerId = this.mousePointerId;
    this.mousePointerId = null;
    if (pointerId !== null && this.mounted && this.app.canvas.hasPointerCapture(pointerId)) this.app.canvas.releasePointerCapture(pointerId);
  }
  private onBlur = () => { this.clearControls(); if (this.snapshot.phase === 'playing') this.togglePause(); };
  private onVisibilityChange = () => { if (document.hidden) this.onBlur(); };

  setControls(partial: Partial<Controls>) { if (this.snapshot.phase === 'playing') Object.assign(this.input, partial); }
  setStick(stick: Stick, value: Vector) {
    if (this.snapshot.phase !== 'playing') return;
    const limited = limitedDirection(value.x, value.y);
    const target = stick === 'move' ? this.moveStick : this.aimStick;
    target.x = limited.x; target.y = limited.y;
    if (stick === 'aim' && (limited.x !== 0 || limited.y !== 0)) {
      this.aimSource = 'stick';
      this.aimAngle = Math.atan2(limited.y, limited.x);
    }
  }
  setMuted(muted: boolean) { if (this.snapshot.mute !== muted) { this.snapshot.mute = muted; this.publish(); } }
  toggleMute() { this.setMuted(!this.snapshot.mute); this.notify({ type: 'mute', muted: this.snapshot.mute }); }
  togglePause() {
    if (this.snapshot.phase === 'playing') this.snapshot.phase = 'paused';
    else if (this.snapshot.phase === 'paused') this.snapshot.phase = 'playing';
    else return;
    this.clearControls();
    this.combat.setPlaying(this.snapshot.phase === 'playing');
    this.notify({ type: this.snapshot.phase === 'paused' ? 'pause' : 'resume' });
    this.publish();
  }
  start() {
    if (!this.mounted || this.destroyed) return;
    this.resetEntities();
    this.clearControls();
    this.playerX = this.width / 2; this.playerY = this.height - 90;
    this.player.position.set(this.playerX, this.playerY);
    this.player.visible = true;
    this.player.alpha = 1;
    this.aimAngle = -Math.PI / 2;
    this.aimSource = 'mouse';
    this.player.rotation = 0;
    this.art.resetThruster(this.player);
    this.elapsed = 0; this.fireCooldown = 0; this.spawnCooldown = 0.7; this.invulnerable = 1.5; this.emissionCooldown = 0;
    this.snapshot = { ...this.snapshot, phase: 'playing', score: 0, lives: MAX_LIVES, wave: 1, elapsed: 0 };
    this.combat.setPlaying(true);
    this.combat.showWave(1);
    this.notify({ type: 'start' });
    this.publish();
  }
  private resetEntities() {
    this.combat.clear();
    for (const obj of [...this.enemies, ...this.bullets, ...this.particles]) { obj.view.destroy(); }
    this.enemies = []; this.bullets = []; this.particles = [];
  }
  private fire() {
    if (this.snapshot.phase !== 'playing') return;
    const dx = Math.cos(this.aimAngle);
    const dy = Math.sin(this.aimAngle);
    const bullet = this.art.bullet();
    const b: Bullet = { view: bullet, x: this.playerX + dx * MUZZLE_DISTANCE, y: this.playerY + dy * MUZZLE_DISTANCE, radius: 5, vx: dx * 625, vy: dy * 625 };
    bullet.rotation = this.aimAngle + Math.PI / 2;
    bullet.position.set(b.x, b.y);
    this.bullets.push(b); this.actors.addChild(bullet);
    this.combat.shot(b.x, b.y, this.aimAngle);
    this.notify({ type: 'shot' });
  }
  private spawnEnemy() {
    const radius = 14 + Math.random() * 9;
    const view = this.art.meteor(radius);
    const enemy: Enemy = { view, x: 30 + Math.random() * (this.width - 60), y: -30, radius, speed: 85 + Math.random() * 50 + this.snapshot.wave * 12, health: this.snapshot.wave >= 4 ? 2 : 1, wobble: Math.random() * Math.PI * 2, dustTime: .12 + radius * .002 };
    view.position.set(enemy.x, enemy.y); this.enemies.push(enemy); this.actors.addChild(view);
  }
  private explode(x: number, y: number, color: number, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 160;
      const view = this.art.particle(1.8 + Math.random() * 2.8, color);
      view.position.set(x, y);
      this.fx.addChildAt(view, 0);
      this.particles.push({ view, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.55, maxLife: 0.55 });
    }
  }
  private removeBullet(index: number) { const [entity] = this.bullets.splice(index, 1); entity.view.destroy(); }
  private removeEnemy(index: number) { const [entity] = this.enemies.splice(index, 1); entity.view.destroy(); }
  private loseLife() {
    if (this.snapshot.phase !== 'playing' || this.invulnerable > 0) return;
    this.snapshot.lives -= 1;
    this.invulnerable = 1.5;
    this.explode(this.playerX, this.playerY, 0x38ddff, 18);
    this.combat.damage(this.playerX, this.playerY);
    this.notify({ type: 'damage' });
    if (this.snapshot.lives <= 0) {
      this.snapshot.phase = 'gameover';
      this.combat.setPlaying(false);
      this.clearControls();
      this.player.visible = false;
      this.updateBest();
      this.notify({ type: 'gameover' });
    }
    this.publish();
  }
  private updateBest() {
    if (this.snapshot.score <= this.snapshot.best) return;
    this.snapshot.best = this.snapshot.score;
    try { localStorage.setItem(STORAGE_KEY, String(this.snapshot.best)); } catch { /* storage denied */ }
  }
  private tick = (ticker: { deltaMS: number }) => {
    if (this.snapshot.phase === 'paused' || this.snapshot.phase === 'gameover') return;
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    this.background?.update(dt);
    if (this.snapshot.phase !== 'playing') return;
    this.combat.update(dt);
    this.elapsed += dt;
    this.snapshot.elapsed = Math.floor(this.elapsed);
    const newWave = 1 + Math.floor(this.elapsed / 20);
    if (newWave !== this.snapshot.wave) { this.snapshot.wave = newWave; this.combat.showWave(newWave); this.notify({ type: 'wave', wave: newWave }); this.publish(); }
    const direction = limitedDirection(
      this.moveStick.x + Number(this.input.right || this.pressed.has('d') || this.pressed.has('arrowright')) - Number(this.input.left || this.pressed.has('a') || this.pressed.has('arrowleft')),
      this.moveStick.y + Number(this.input.down || this.pressed.has('s') || this.pressed.has('arrowdown')) - Number(this.input.up || this.pressed.has('w') || this.pressed.has('arrowup'))
    );
    const previousX = this.playerX, previousY = this.playerY;
    this.playerX = clamp(this.playerX + direction.x * 320 * dt, PLAYER_VISUAL_RADIUS, this.width - PLAYER_VISUAL_RADIUS);
    this.playerY = clamp(this.playerY + direction.y * 320 * dt, PLAYER_VISUAL_RADIUS, this.height - PLAYER_VISUAL_RADIUS);
    this.player.position.set(this.playerX, this.playerY);
    this.updateAim();
    const movement = dt > 0 ? Math.hypot(this.playerX - previousX, this.playerY - previousY) / (320 * dt) : 0;
    this.art.animateThruster(this.player, this.elapsed, dt, movement);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.player.alpha = this.invulnerable > 0 ? (Math.floor(this.elapsed * 12) % 2 ? 0.38 : 1) : 1;
    this.fireCooldown -= dt;
    if ((this.input.firing || this.pressed.has(' ') || this.mousePointerId !== null || this.aimStick.x !== 0 || this.aimStick.y !== 0) && this.fireCooldown <= 0) { this.fire(); this.fireCooldown = 0.17; }
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) { this.spawnEnemy(); this.spawnCooldown = Math.max(0.32, 1.12 - this.snapshot.wave * 0.085) * (0.75 + Math.random() * 0.4); }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt;
      bullet.view.position.set(bullet.x, bullet.y);
      if (bullet.x < -22 || bullet.x > this.width + 22 || bullet.y < -22 || bullet.y > this.height + 22) { this.removeBullet(i); continue; }
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        if (circlesOverlap(bullet, enemy)) {
          enemy.health--; this.explode(bullet.x, bullet.y, 0xa2edff, 3);
          if (enemy.health > 0) this.combat.impact(bullet.x, bullet.y);
          this.notify({ type: 'impact' });
          if (enemy.health <= 0) {
            this.explode(enemy.x, enemy.y, 0xff547d);
            this.combat.meteorDestroyed(enemy.x, enemy.y);
            this.notify({ type: 'destroy' });
            this.removeEnemy(j);
            this.snapshot.score += 100;
            this.updateBest();
            this.publish();
          }
          hit = true; break;
        }
      }
      if (hit) this.removeBullet(i);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.y += enemy.speed * dt;
      enemy.x += Math.sin(this.elapsed * 2 + enemy.wobble) * 22 * dt;
      enemy.view.position.set(enemy.x, enemy.y);
      enemy.view.rotation += dt * 1.5;
      const visualRadius = enemy.radius * ACTOR_VISUAL_SCALE;
      if (enemy.y - visualRadius > this.height || enemy.x + visualRadius < 0 || enemy.x - visualRadius > this.width) {
        this.removeEnemy(i);
        continue;
      }
      if (this.invulnerable === 0 && circlesOverlap({ x: this.playerX, y: this.playerY, radius: 17 }, enemy)) {
        this.explode(enemy.x, enemy.y, 0xff547d);
        this.removeEnemy(i);
        this.loseLife();
        if (this.snapshot.lives <= 0) return;
        continue;
      }
      enemy.dustTime -= dt;
      if (enemy.dustTime <= 0) {
        this.combat.meteorTrail(enemy.x, enemy.y, enemy.radius * ACTOR_VISUAL_SCALE);
        enemy.dustTime += .18;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]; particle.life -= dt;
      if (particle.life <= 0) { particle.view.destroy(); this.particles.splice(i, 1); continue; }
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.view.position.set(particle.x, particle.y);
      particle.view.alpha = particle.life / particle.maxLife;
    }
    this.combat.trackMeteors(this.enemies, this.playerX, this.playerY, this.elapsed, this.invulnerable);
    this.emissionCooldown += dt;
    if (this.emissionCooldown > 0.15) { this.emissionCooldown = 0; this.publish(); }
  };
  private notify(event: GameEvent) {
    try { this.onEvent?.(event); } catch { /* Presentation listeners cannot interrupt gameplay. */ }
  }
  private publish() {
    const previous = this.lastPublished;
    const next = this.snapshot;
    if (previous && previous.phase === next.phase && previous.score === next.score && previous.lives === next.lives && previous.wave === next.wave && previous.elapsed === next.elapsed && previous.best === next.best && previous.mute === next.mute) return;
    this.lastPublished = { ...next };
    this.onChange({ ...next });
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.scheduleResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerEnd);
    window.removeEventListener('pointercancel', this.onPointerEnd);
    if (this.mounted) {
      this.app.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.app.canvas.removeEventListener('lostpointercapture', this.onPointerEnd);
    }
    this.resizeObserver?.disconnect();
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.motionQuery = null;
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.clearControls();
    this.host = null;
    if (this.mounted) {
      if (this.rafIsRunning) this.app.ticker.remove(this.tick);
      this.app.destroy(true, { children: true });
      this.mounted = false;
    }
    if (!this.initializing) {
      if (!this.app.stage?.destroyed) this.app.stage?.destroy({ children: true });
      this.art.destroy();
    }
  }
}
