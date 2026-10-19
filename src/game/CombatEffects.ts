import { Container, type Graphics } from 'pixi.js';
import { ACTOR_VISUAL_SCALE, type CombatGraphic, type PixelArt } from './PixelArt.ts';
import { WIDTH, HEIGHT } from './types.ts';

type Effect = {
  view: Graphics; kind: CombatGraphic; x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; opacity: number;
};
type Meteor = Readonly<{ x: number; y: number; radius: number; speed: number; wobble: number }>;
type Observation = { entered: boolean; entryEdge: number; grazed: boolean; contact: boolean; closest: number; dx: number; dy: number; version: number };
type Indicator = { view: Graphics; meteor: Meteor | null; score: number; x: number; y: number; edge: number };
type Insets = { top: number; right: number; bottom: number; left: number };

/** Visual-only pool: dropping an effect never changes any game entity or RNG. */
export class CombatEffects {
  private art: PixelArt;
  private body: Graphics;
  private pool: Effect[] = [];
  private trails = new Container({ label: 'Meteor wakes', eventMode: 'none' });
  private flashes = new Container({ label: 'Combat flashes', eventMode: 'none' });
  private banner = new Container({ label: 'Wave announcement', eventMode: 'none' });
  private warnings = new Container({ label: 'Incoming threats', eventMode: 'none' });
  private indicators: Indicator[] = [];
  private observations = new WeakMap<Meteor, Observation>();
  private playing = true;
  private reducedMotion = false;
  private nearCooldown = 0;
  private entryCooldown = 0;
  private layoutVersion = 0;
  private worldScale = 1;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private word: Graphics;
  private digits: Graphics[] = [];
  private waveLife = 0;
  private damageLife = 0;
  private width = WIDTH;
  private height = HEIGHT;
  private compact = false;
  private bannerY = HEIGHT * .2;
  private seed = 0x6e656f6e;

  constructor(art: PixelArt, front: Container, actors: Container, body: Graphics) {
    this.art = art;
    this.body = body;
    actors.addChildAt(this.trails, 0);
    front.addChild(this.flashes, this.warnings, this.banner);
    for (let i = 0; i < 3; i++) {
      const view = art.combatEffect('danger');
      view.visible = false;
      this.warnings.addChild(view);
      this.indicators.push({ view, meteor: null, score: Infinity, x: 0, y: 0, edge: 0 });
    }
    for (let i = 0; i < 80; i++) {
      const view = art.combatEffect('spark');
      view.visible = false;
      (i < 32 ? this.flashes : this.trails).addChild(view);
      this.pool.push({ view, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, opacity: 0 });
    }
    this.word = art.waveLabel();
    this.banner.addChild(this.word);
    this.banner.scale.set(2);
    this.banner.visible = false;
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private emit(kind: CombatGraphic, x: number, y: number, life: number, vx = 0, vy = 0, rotation = 0, opacity = 1) {
    if (!this.playing) return;
    const decorative = kind === 'dust' || kind === 'entry' || kind === 'near';
    const start = decorative ? 32 : 0;
    const end = decorative ? (this.compact ? 48 : 80) : (this.compact ? 24 : 32);
    for (let i = start; i < end; i++) {
      const effect = this.pool[i];
      if (effect.life > 0) continue;
      effect.kind = kind; effect.x = x; effect.y = y; effect.vx = this.reducedMotion ? 0 : vx; effect.vy = this.reducedMotion ? 0 : vy;
      effect.life = effect.maxLife = life; effect.opacity = opacity;
      this.art.setCombatEffect(effect.view, kind);
      effect.view.position.set(x, y);
      effect.view.rotation = rotation;
      effect.view.scale.set(kind === 'burst' ? 2 : 1);
      effect.view.tint = 0xffffff;
      effect.view.alpha = opacity;
      effect.view.visible = true;
      return;
    }
  }

  shot(x: number, y: number, angle: number) {
    if (this.reducedMotion) return;
    this.emit('muzzle', x - Math.cos(angle) * 4, y - Math.sin(angle) * 4, .07, 0, 0, angle + Math.PI / 2, .85);
  }

  impact(x: number, y: number) { this.emit('impact', x, y, .12, 0, 0, 0, this.reducedMotion ? .5 : .85); }

  meteorDestroyed(x: number, y: number) {
    if (!this.playing) return;
    this.emit('burst', x, y, .22, 0, 0, 0, this.reducedMotion ? .5 : .9);
    for (let i = 0; i < (this.reducedMotion ? 1 : this.compact ? 3 : 5); i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 75 + this.random() * 75;
      this.emit('spark', x, y, .28, Math.cos(angle) * speed, Math.sin(angle) * speed, 0, .8);
    }
  }

  damage(x: number, y: number) {
    if (!this.playing) return;
    this.damageLife = .22;
    this.body.tint = 0xffc3ea;
    this.emit('damage', x, y, .2, 0, 0, 0, .85);
  }

  meteorTrail(x: number, y: number, radius: number) {
    if (this.reducedMotion) return;
    this.emit('dust', x + (this.random() - .5) * radius * .6, y - radius,
      .24, (this.random() - .5) * 12, -14, 0, .32);
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.warnings.visible = playing;
    for (const indicator of this.indicators) { indicator.view.visible = false; indicator.meteor = null; }
    if (!playing) for (const effect of this.pool) {
      if (effect.kind === 'entry' || effect.kind === 'near') effect.view.visible = false;
    }
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced) for (const effect of this.pool) {
      effect.vx = effect.vy = 0;
      if (effect.kind === 'muzzle' || effect.kind === 'dust') { effect.life = 0; effect.view.visible = false; }
    }
  }

  /** Read-only observations after the engine has resolved every real collision. */
  trackMeteors(meteors: readonly Meteor[], playerX: number, playerY: number, elapsed: number, invulnerable: number) {
    if (!this.playing) return;
    for (const indicator of this.indicators) { indicator.meteor = null; indicator.score = Infinity; indicator.view.visible = false; }
    for (const meteor of meteors) {
      const radius = meteor.radius * ACTOR_VISUAL_SCALE;
      const visible = meteor.x + radius >= 0 && meteor.x - radius <= this.width && meteor.y + radius >= 0 && meteor.y - radius <= this.height;
      const dx = meteor.x - playerX, dy = meteor.y - playerY, distance = Math.hypot(dx, dy), hitDistance = 17 + meteor.radius;
      let observation = this.observations.get(meteor);
      if (!observation) {
        const entryEdge = meteor.y < radius ? 0 : meteor.x < radius ? 1 : meteor.x > this.width - radius ? 2 : -1;
        observation = { entered: entryEdge === -1, entryEdge, grazed: false, contact: false, closest: Infinity, dx, dy, version: this.layoutVersion };
        this.observations.set(meteor, observation);
      }
      if (observation.version !== this.layoutVersion) {
        observation.dx = dx; observation.dy = dy; observation.closest = Infinity; observation.version = this.layoutVersion;
      }
      if (visible) {
        // Let the leading edge clear the HUD gradient before drawing its accent.
        // This never hides, scales or delays the meteor itself or its collisions.
        if (!observation.entered && meteor.y + radius >= (this.insets.top + 72) / this.worldScale) {
          observation.entered = true;
          const top = observation.entryEdge === 0, left = observation.entryEdge === 1;
          if (this.entryCooldown === 0) {
            const x = top ? meteor.x : left ? Math.max(4, meteor.x + radius + 3) : Math.min(this.width - 4, meteor.x - radius - 3);
            const y = top ? Math.max(4, meteor.y + radius + 3) : meteor.y;
            const rotation = top ? 0 : left ? -Math.PI / 2 : Math.PI / 2;
            this.emit('entry', x, y, .18, 0, top ? meteor.speed * .35 : 0, rotation, this.reducedMotion ? .25 : .42);
            this.entryCooldown = .12;
          }
        }
        const mx = dx - observation.dx, my = dy - observation.dy, length = mx * mx + my * my;
        const t = length > 0 ? Math.max(0, Math.min(1, -(observation.dx * mx + observation.dy * my) / length)) : 0;
        const clearance = Math.hypot(observation.dx + mx * t, observation.dy + my * t) - hitDistance;
        observation.contact ||= clearance <= 0;
        observation.closest = Math.min(observation.closest, clearance);
        if (!observation.grazed && !observation.contact && observation.closest <= 12 && distance > Math.hypot(observation.dx, observation.dy) + .001) {
          observation.grazed = true;
          if (distance - hitDistance <= 26 && invulnerable === 0 && this.nearCooldown === 0) {
            this.emit('near', playerX + dx / distance * 26, playerY + dy / distance * 26, .18, 0, 0, Math.atan2(dy, dx), .55);
            this.nearCooldown = .35;
          }
        }
      } else this.considerThreat(meteor, playerX, playerY, elapsed, invulnerable);
      observation.dx = dx; observation.dy = dy;
    }
    for (const indicator of this.indicators) {
      if (!indicator.meteor) continue;
      indicator.view.position.set(indicator.x, indicator.y);
      indicator.view.rotation = indicator.edge === 0 ? 0 : indicator.edge === 1 ? -Math.PI / 2 : Math.PI / 2;
      indicator.view.alpha = this.reducedMotion ? .6 : .7;
      indicator.view.visible = true;
    }
  }

  private considerThreat(meteor: Meteor, playerX: number, playerY: number, elapsed: number, invulnerable: number) {
    const radius = meteor.radius * ACTOR_VISUAL_SCALE;
    const vx = Math.sin(elapsed * 2 + meteor.wobble) * 22, vy = meteor.speed;
    let edge: number, entry: number;
    if (meteor.y + radius < 0 && vy > 0) { edge = 0; entry = (-radius - meteor.y) / vy; }
    else if (meteor.x + radius < 0 && vx > 0) { edge = 1; entry = (-radius - meteor.x) / vx; }
    else if (meteor.x - radius > this.width && vx < 0) { edge = 2; entry = (this.width + radius - meteor.x) / vx; }
    else return; // In particular, meteors leaving the bottom are never incoming threats.
    if (entry > .65) return;
    const dx = meteor.x - playerX, dy = meteor.y - playerY;
    const closest = -(dx * vx + dy * vy) / (vx * vx + vy * vy);
    if (closest < entry || closest > 1.15 || closest < invulnerable) return;
    if (Math.hypot(dx + vx * closest, dy + vy * closest) > 17 + meteor.radius + 22) return;
    const scale = this.worldScale;
    const left = (this.insets.left + 12) / scale, right = this.width - (this.insets.right + 12) / scale;
    const top = (this.insets.top + 84) / scale, bottom = this.height - (this.insets.bottom + 12) / scale;
    const x = edge === 0 ? Math.max(left, Math.min(right, meteor.x + vx * entry)) : edge === 1 ? left : right;
    const y = edge === 0 ? top : Math.max(top, Math.min(bottom, meteor.y + vy * entry));
    // Reserve joystick space on large touch/hybrid viewports as well as phones.
    if (y > this.height - (this.insets.bottom + 156) / scale &&
      (x < (this.insets.left + 160) / scale || x > this.width - (this.insets.right + 160) / scale)) return;
    const limit = this.compact ? 2 : 3;
    let target = -1;
    for (let i = 0; i < limit; i++) {
      const slot = this.indicators[i];
      if (slot.meteor && slot.edge === edge && Math.hypot(slot.x - x, slot.y - y) * scale < 32) {
        if (closest >= slot.score) return;
        target = i;
      }
    }
    if (target !== -1) {
      // A more urgent arrow can replace two neighboring ones, without overlap.
      for (let i = 0; i < limit; i++) {
        const slot = this.indicators[i];
        if (slot.meteor && slot.edge === edge && Math.hypot(slot.x - x, slot.y - y) * scale < 32) {
          slot.meteor = null; slot.score = Infinity;
        }
      }
    } else {
      let worst = -Infinity, worstIndex = -1;
      for (let i = 0; i < limit; i++) {
        const slot = this.indicators[i];
        if (!slot.meteor && target === -1) target = i;
        if (slot.meteor && slot.score > worst) { worst = slot.score; worstIndex = i; }
      }
      if (target === -1 && closest < worst) target = worstIndex;
    }
    if (target !== -1) {
      const slot = this.indicators[target];
      slot.meteor = meteor; slot.score = closest; slot.x = x; slot.y = y; slot.edge = edge;
    }
  }

  showWave(wave: number) {
    if (!this.playing) return;
    const text = String(wave).padStart(2, '0');
    while (this.digits.length < text.length) {
      const digit = this.art.waveDigit();
      this.digits.push(digit);
      this.banner.addChild(digit);
    }
    const numberWidth = text.length * 12 - 2;
    const width = 46 + 12 + numberWidth;
    this.word.x = -width / 2 + 23;
    this.digits.forEach((digit, i) => {
      digit.visible = i < text.length;
      if (!digit.visible) return;
      this.art.setWaveDigit(digit, Number(text[i]));
      digit.x = -width / 2 + 46 + 12 + 5 + i * 12;
    });
    this.waveLife = 1.15;
    this.banner.visible = true;
    this.banner.alpha = 0;
    this.banner.position.set(this.width / 2, this.bannerY - (this.reducedMotion ? 0 : 4));
  }

  update(dt: number) {
    if (!this.playing) return;
    this.nearCooldown = Math.max(0, this.nearCooldown - dt);
    this.entryCooldown = Math.max(0, this.entryCooldown - dt);
    for (const effect of this.pool) {
      if (effect.life <= 0) continue;
      effect.life = Math.max(0, effect.life - dt);
      effect.view.visible = effect.life > 0;
      if (!effect.view.visible) continue;
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.view.position.set(effect.x, effect.y);
      effect.view.alpha = effect.opacity * effect.life / effect.maxLife;
    }
    this.damageLife = Math.max(0, this.damageLife - dt);
    this.body.tint = this.damageLife > .12 ? 0xffc3ea : this.damageLife > 0 ? 0xd5dfff : 0xffffff;
    if (this.waveLife > 0) {
      this.waveLife = Math.max(0, this.waveLife - dt);
      const age = 1.15 - this.waveLife;
      const fade = Math.min(1, age / .12, this.waveLife / .38);
      this.banner.alpha = fade * .85;
      this.banner.y = this.bannerY - (this.reducedMotion ? 0 : Math.round((1 - fade) * 4));
      this.banner.visible = this.waveLife > 0;
    }
  }

  resize(width: number, height: number, compact: boolean, worldScale: number, insets?: Insets) {
    const ratioX = width / this.width, ratioY = height / this.height;
    this.width = width; this.height = height; this.compact = compact;
    this.worldScale = worldScale; this.insets = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    this.layoutVersion++;
    this.setPlaying(this.playing);
    for (const indicator of this.indicators) indicator.view.scale.set(Math.max(1, Math.round(1 / worldScale)));
    for (let i = 0; i < this.pool.length; i++) {
      const effect = this.pool[i];
      if (compact && (i >= 48 || (i >= 24 && i < 32))) {
        effect.life = 0;
        effect.view.visible = false;
      }
      effect.x *= ratioX; effect.y *= ratioY;
      effect.view.position.set(effect.x, effect.y);
    }
    this.bannerY = Math.max(112 / worldScale, height * .2);
    this.banner.position.set(width / 2, this.bannerY);
  }

  clear() {
    for (const effect of this.pool) { effect.life = 0; effect.view.visible = false; }
    this.waveLife = this.damageLife = 0;
    this.banner.visible = false;
    this.body.tint = 0xffffff;
    this.observations = new WeakMap();
    this.nearCooldown = this.entryCooldown = 0;
    this.setPlaying(this.playing);
  }
}
