import { Container, type Graphics } from 'pixi.js';
import type { PixelArt } from './PixelArt.ts';

const PADDING = 4;
const DEPTHS = [
  { count: 40, compactCount: 24, radius: .7, color: 0x8b9dbf, alpha: .2, speed: 6 },
  { count: 22, compactCount: 12, radius: 1.3, color: 0xb3d9ee, alpha: .3, speed: 14 },
  { count: 8, compactCount: 4, radius: 2, color: 0xa3edff, alpha: .44, speed: 28 },
] as const;

type Star = { view: Graphics; x: number; y: number; speed: number };

function wrap(value: number, size: number) {
  if (value >= -PADDING && value <= size + PADDING) return value;
  const span = size + PADDING * 2;
  return ((value + PADDING) % span + span) % span - PADDING;
}

/** Decorative coordinates only: no camera transform or gameplay input. */
export class Starfield {
  readonly layers: { view: Container; stars: Star[] }[] = [];
  private width: number;
  private height: number;
  private compact = false;

  constructor(art: PixelArt, parent: Container, width: number, height: number, random = Math.random) {
    this.width = width;
    this.height = height;
    for (const depth of DEPTHS) {
      const view = new Container({ label: 'Star depth layer' });
      const stars: Star[] = [];
      parent.addChild(view);
      for (let i = 0; i < depth.count; i++) {
        const starView = art.star(depth.radius, depth.color, depth.alpha + random() * .12);
        const star = { view: starView, x: random() * width, y: random() * height, speed: depth.speed * (.8 + random() * .4) };
        starView.position.set(star.x, star.y);
        stars.push(star);
        view.addChild(starView);
      }
      this.layers.push({ view, stars });
    }
  }

  resize(width: number, height: number, compact: boolean) {
    const ratioX = width / this.width;
    const ratioY = height / this.height;
    this.width = width;
    this.height = height;
    this.compact = compact;
    this.layers.forEach((layer, index) => {
      layer.stars.forEach((star, i) => {
        star.x = wrap(star.x * ratioX, width);
        star.y = wrap(star.y * ratioY, height);
        star.view.position.set(star.x, star.y);
        star.view.visible = !compact || i < DEPTHS[index].compactCount;
      });
    });
  }

  update(dt: number) {
    const elapsed = dt * (this.compact ? .75 : 1);
    for (const layer of this.layers) {
      for (const star of layer.stars) {
        if (!star.view.visible) continue;
        star.x = wrap(star.x - star.speed * .12 * elapsed, this.width);
        star.y = wrap(star.y + star.speed * elapsed, this.height);
        star.view.position.set(star.x, star.y);
      }
    }
  }
}
