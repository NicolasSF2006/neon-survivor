import { Container, Graphics, GraphicsContext } from 'pixi.js';

type Palette = Record<string, number>;

/** Presentation only: collision radii remain in the engine's logical units. */
export const ACTOR_VISUAL_SCALE = 1.25;

/** Compile small pixel maps once. Adjacent pixels of one color share a rectangle. */
function pixelMap(rows: string[], palette: Palette, pixelSize: number, originY = rows.length * pixelSize / 2) {
  const context = new GraphicsContext();
  context.batchMode = 'batch';
  const width = Math.max(...rows.map(row => row.length));
  const originX = width * pixelSize / 2;
  for (const [symbol, color] of Object.entries(palette)) {
    let painted = false;
    rows.forEach((row, y) => {
      const offset = (width - row.length) / 2;
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== symbol) continue;
        const start = x;
        while (row[x + 1] === symbol) x++;
        context.rect((start + offset) * pixelSize - originX, y * pixelSize - originY, (x - start + 1) * pixelSize, pixelSize);
        painted = true;
      }
    });
    if (painted) context.fill(color);
  }
  return context;
}

const SHIP_PALETTE = { o: 0x173763, b: 0x3268bd, c: 0x38d4f1, h: 0xe6fcff, v: 0x8a65ee, m: 0xf365ce };
const SHIP = [
  'h', 'oco', 'oco', 'occco', 'occco', 'obcccbo', 'obhhhbo',
  'obchhhcbo', 'obchhhcbo', 'obcvhvcbo', 'obccvccbo',
  'ovobccvccbovo', 'ovcobccvccbocvo', 'ocvcobccvccbocvco',
  'ohccobccvccboccho', 'obccobccvccboccbo',
  'ovmo..occco..omvo', 'ooo...obcbo...ooo', 'ovvvo', 'mhm',
];

// From the exhaust at y=16, even the longest flame stays inside the existing
// 24-unit visual envelope. Each transition adds whole pixels, never blur/stretch.
const FLAMES = [
  ['bcb'],
  ['bcb', 'c'],
  ['bcb', 'chc', 'b'],
  ['vbcbv', 'bchcb', 'bcb', 'b'],
];

/** Three deterministic silhouettes/crater patterns; gameplay randomness is unchanged. */
function meteorMap(variant: number) {
  const radii = [[8, 7, 8, 7, 8, 8, 7, 8], [7, 8, 7, 8, 8, 7, 8, 8], [8, 8, 7, 7, 8, 7, 8, 7]][variant];
  const mask = Array.from({ length: 17 }, (_, y) => Array.from({ length: 17 }, (_, x) => {
    const dx = x - 8, dy = y - 8;
    const sector = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
    return Math.hypot(dx, dy) <= radii[sector];
  }));
  const craters = [[[-3, -2], [3, 3]], [[2, -3], [-3, 2]], [[-2, -3], [3, 1]]][variant];
  return mask.map((row, y) => row.map((inside, x) => {
    if (!inside) return '.';
    const dx = x - 8, dy = y - 8;
    const edge = !mask[y - 1]?.[x] || !mask[y + 1]?.[x] || !row[x - 1] || !row[x + 1];
    if (edge) return dx + dy < -1 ? 'h' : 'o';
    for (const [cx, cy] of craters) {
      const distance = Math.hypot(dx - cx, dy - cy);
      if (distance < 1.6) return 'o';
      if (distance < 2.6) return dy < cy ? 'd' : 'l';
    }
    if (x === 8 + variant && y >= 7 && y <= 10) return 'm';
    return dx + dy < -3 ? 'l' : dx + dy > 5 ? 'd' : 'b';
  }).join(''));
}

/** Per-engine, shared geometry. Entity destruction never destroys sibling artwork. */
export class PixelArt {
  private ship = pixelMap(SHIP, SHIP_PALETTE, 2, 24);
  private flameFrames = FLAMES.map(rows => pixelMap(rows, SHIP_PALETTE, 2, 0));
  private thrusters = new WeakMap<Container, { view: Graphics; power: number }>();
  private meteors = [
    pixelMap(meteorMap(0), { o: 0x4a2a6d, d: 0x694283, b: 0x9a5cb1, l: 0xc788d8, h: 0xf1c2f3, m: 0xff77c5 }, 2),
    pixelMap(meteorMap(1), { o: 0x52294f, d: 0x823b79, b: 0xb95396, l: 0xe987c5, h: 0xffcce9, m: 0xb297fa }, 2),
    pixelMap(meteorMap(2), { o: 0x30386c, d: 0x4c508c, b: 0x7774b8, l: 0xa6aae4, h: 0xd8e9ff, m: 0xe183cf }, 2),
  ];
  private bolt = pixelMap(['..h..', '.chc.', '.chc.', '.chc.', '.ccc.', '.ccc.', '..c..', '..c..', '..b..', '..b..', '..g..', '..g..'], { h: 0xf0fdff, c: 0x78eaff, b: 0x3a8ebd, g: 0x173552 }, 2);
  private stars = [
    pixelMap(['w'], { w: 0xb6cce7 }, 1),
    pixelMap(['ww', 'ww'], { w: 0x9cc4e5 }, 1),
    pixelMap(['.b.', 'bhb', '.b.'], { b: 0x5c96bc, h: 0xc2eafa }, 1),
  ];
  private fragment = pixelMap(['ww', 'ww'], { w: 0xffffff }, 1);

  player() {
    const view = new Container({ label: 'Pixel ship' });
    const body = new Graphics({ context: this.ship, roundPixels: true, label: 'Pixel ship body' });
    const flame = new Graphics({ context: this.flameFrames[0], roundPixels: true, label: 'Pixel thruster' });
    flame.position.set(0, 16);
    view.addChild(body, flame);
    this.thrusters.set(view, { view: flame, power: 0 });
    view.scale.set(ACTOR_VISUAL_SCALE);
    this.resetThruster(view);
    return view;
  }

  resetThruster(view: Container) {
    const thruster = this.thrusters.get(view);
    if (!thruster) return;
    thruster.power = 0;
    this.animateThruster(view, 0);
  }

  animateThruster(view: Container, elapsed: number, dt = 0, movement = 0) {
    const thruster = this.thrusters.get(view);
    if (!thruster) return;
    const target = Math.max(0, Math.min(1, movement));
    // Exponential interpolation has the same response at any frame rate.
    const rate = target > thruster.power ? 12 : 7;
    thruster.power += (target - thruster.power) * (1 - Math.exp(-rate * dt));
    const pulse = .5 + .5 * Math.sin(elapsed * Math.PI * 3);
    const frame = this.flameFrames[Math.min(3, Math.round(thruster.power * 2.3 + pulse * .9))];
    if (thruster.view.context !== frame) thruster.view.context = frame;
    thruster.view.alpha = .5 + .36 * thruster.power + .12 * pulse;
  }

  meteor(radius: number) {
    const view = new Graphics({ context: this.meteors[Math.floor(radius * 10) % this.meteors.length], roundPixels: true, label: 'Pixel meteor' });
    view.scale.set(radius / 17 * ACTOR_VISUAL_SCALE);
    return view;
  }

  bullet() { return new Graphics({ context: this.bolt, roundPixels: true, label: 'Pixel bolt' }); }

  star(radius: number, color: number, alpha: number) {
    return new Graphics({ context: this.stars[radius < 1 ? 0 : radius < 1.7 ? 1 : 2], tint: color, alpha, roundPixels: true, label: 'Pixel star' });
  }

  particle(radius: number, color: number) {
    const view = new Graphics({ context: this.fragment, tint: color, roundPixels: true, label: 'Pixel fragment' });
    view.scale.set(Math.round(radius));
    return view;
  }

  destroy() {
    for (const context of [this.ship, ...this.flameFrames, ...this.meteors, this.bolt, ...this.stars, this.fragment]) context.destroy();
  }
}
