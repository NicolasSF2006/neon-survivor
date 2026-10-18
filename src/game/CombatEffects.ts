import { Container, type Graphics } from 'pixi.js';
import { type CombatGraphic, type PixelArt } from './PixelArt.ts';
import { WIDTH, HEIGHT } from './types.ts';

type Effect = {
  view: Graphics; kind: CombatGraphic; x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; opacity: number;
};

/** Visual-only pool: dropping an effect never changes any game entity or RNG. */
export class CombatEffects {
  private art: PixelArt;
  private body: Graphics;
  private pool: Effect[] = [];
  private trails = new Container({ label: 'Meteor wakes', eventMode: 'none' });
  private flashes = new Container({ label: 'Combat flashes', eventMode: 'none' });
  private banner = new Container({ label: 'Wave announcement', eventMode: 'none' });
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
    front.addChild(this.flashes, this.banner);
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
    const start = kind === 'dust' ? 32 : 0;
    const end = kind === 'dust' ? (this.compact ? 48 : 80) : (this.compact ? 24 : 32);
    for (let i = start; i < end; i++) {
      const effect = this.pool[i];
      if (effect.life > 0) continue;
      effect.kind = kind; effect.x = x; effect.y = y; effect.vx = vx; effect.vy = vy;
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
    this.emit('muzzle', x - Math.cos(angle) * 4, y - Math.sin(angle) * 4, .07, 0, 0, angle + Math.PI / 2, .85);
  }

  impact(x: number, y: number) { this.emit('impact', x, y, .12); }

  meteorDestroyed(x: number, y: number) {
    this.emit('burst', x, y, .22, 0, 0, 0, .9);
    for (let i = 0; i < (this.compact ? 3 : 5); i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 75 + this.random() * 75;
      this.emit('spark', x, y, .28, Math.cos(angle) * speed, Math.sin(angle) * speed, 0, .8);
    }
  }

  damage(x: number, y: number) {
    this.damageLife = .22;
    this.body.tint = 0xffc3ea;
    this.emit('damage', x, y, .2, 0, 0, 0, .85);
  }

  meteorTrail(x: number, y: number, radius: number) {
    this.emit('dust', x + (this.random() - .5) * radius * .6, y - radius,
      .24, (this.random() - .5) * 12, -14, 0, .32);
  }

  showWave(wave: number) {
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
    this.banner.position.set(this.width / 2, this.bannerY - 4);
  }

  update(dt: number) {
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
      this.banner.y = this.bannerY - Math.round((1 - fade) * 4);
      this.banner.visible = this.waveLife > 0;
    }
  }

  resize(width: number, height: number, compact: boolean, worldScale: number) {
    const ratioX = width / this.width, ratioY = height / this.height;
    this.width = width; this.height = height; this.compact = compact;
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
  }
}
