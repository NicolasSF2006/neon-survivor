import { Container, Graphics, GraphicsContext } from 'pixi.js';

type Palette = Record<string, number>;
export type CombatGraphic = 'muzzle' | 'impact' | 'burst' | 'damage' | 'spark' | 'dust' | 'entry' | 'near' | 'danger';

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

const SHIP_PALETTE = { o: 0x173763, b: 0x3268bd, c: 0x38d4f1, h: 0xe6fcff, v: 0x8a65ee, m: 0xf365ce,
  n: 0x0c1c39, t: 0x197b9d, l: 0x9aebf5 };
const SHIP = [
  'h', 'oco', 'olo', 'obhbo', 'obtbo', 'obchcbo', 'obhthbo',
  'oblnhnlbo', 'obltntlbo', 'obcvcvcbo', 'obccvccbo',
  'ovobctvtcbovo', 'ovlobctvtcbolvo', 'ocvlobctvtcbolvco',
  'ohlcobctvtcboclho', 'oblcobcntncboclbo',
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

// Small fixed bitmap alphabet: wave announcements need no fonts or text textures.
const GLYPHS: Record<string, string[]> = {
  O: ['.www.', 'w...w', 'w...w', 'w...w', 'w...w', 'w...w', '.www.'],
  N: ['w...w', 'ww..w', 'ww..w', 'w.w.w', 'w..ww', 'w..ww', 'w...w'],
  D: ['wwww.', 'w...w', 'w...w', 'w...w', 'w...w', 'w...w', 'wwww.'],
  A: ['.www.', 'w...w', 'w...w', 'wwwww', 'w...w', 'w...w', 'w...w'],
  0: ['.www.', 'w...w', 'w..ww', 'w.w.w', 'ww..w', 'w...w', '.www.'],
  1: ['..w..', '.ww..', '..w..', '..w..', '..w..', '..w..', '.www.'],
  2: ['.www.', 'w...w', '....w', '...w.', '..w..', '.w...', 'wwwww'],
  3: ['wwww.', '....w', '....w', '.www.', '....w', '....w', 'wwww.'],
  4: ['...w.', '..ww.', '.w.w.', 'w..w.', 'wwwww', '...w.', '...w.'],
  5: ['wwwww', 'w....', 'w....', 'wwww.', '....w', '....w', 'wwww.'],
  6: ['.www.', 'w....', 'w....', 'wwww.', 'w...w', 'w...w', '.www.'],
  7: ['wwwww', '....w', '...w.', '..w..', '.w...', '.w...', '.w...'],
  8: ['.www.', 'w...w', 'w...w', '.www.', 'w...w', 'w...w', '.www.'],
  9: ['.www.', 'w...w', 'w...w', '.wwww', '....w', '....w', '.www.'],
};

function lettering(text: string) {
  return Array.from({ length: 7 }, (_, y) => [...text].map(letter => GLYPHS[letter][y]).join('.'));
}

const COMBAT_PALETTE = { h: 0xedfcff, c: 0x72e8ff, b: 0x578bdf, v: 0x9b73e5, m: 0xf485cf };

/** Three deterministic silhouettes/crater patterns; gameplay randomness is unchanged. */
function meteorMap(variant: number) {
  const radii = [[8, 7, 8, 7, 8, 8, 7, 8], [7, 8, 7, 8, 8, 7, 8, 8], [8, 8, 7, 7, 8, 7, 8, 7]][variant];
  const mask = Array.from({ length: 17 }, (_, y) => Array.from({ length: 17 }, (_, x) => {
    const dx = x - 8, dy = y - 8;
    const sector = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 8;
    // The original radial envelope stays intact; only decorative corners change.
    if (variant === 1 && Math.abs(dx) + Math.abs(dy) > 10.5) return false;
    if (variant === 2 && Math.abs(dx - dy * .3) > 6.7) return false;
    return Math.hypot(dx, dy) <= radii[sector];
  }));
  const craters = [[[-3, -2, 1.5], [3, 3, 1]], [[2, -3, 1], [-3, 2, 1.7]], [[-3, -2, 1.2], [2, 3, 1]]][variant];
  return mask.map((row, y) => row.map((inside, x) => {
    if (!inside) return '.';
    const dx = x - 8, dy = y - 8;
    const edge = !mask[y - 1]?.[x] || !mask[y + 1]?.[x] || !row[x - 1] || !row[x + 1];
    if (edge) return dx + dy < -1 ? 'h' : 'o';
    const fracture = variant === 1 ? dy - Math.floor(dx * .5) : dx - Math.floor(dy * .3) + (variant === 2 ? 1 : 0);
    const seam = variant === 1 ? Math.abs(dx) < 5 : Math.abs(dy) < 5;
    if (seam && fracture === 0) return 'o';
    if (seam && fracture === 1 && (x + y + variant) % 4 === 0) return 'v';
    if (variant === 2 && Math.abs(dx - 3) + Math.abs(dy + 2) <= 1) return dx === 3 ? 'v' : 'm';
    for (const [cx, cy, radius] of craters) {
      const distance = Math.hypot(dx - cx, dy - cy);
      if (distance < radius) return 'o';
      if (distance < radius + 1) return dy < cy ? 'd' : 'l';
    }
    if ((x * 13 + y * 7 + variant * 11) % 19 === 0) return dx + dy < 0 ? 'l' : 'd';
    return dx + dy < -3 ? 'l' : dx + dy > 5 ? 'd' : 'b';
  }).join(''));
}

/** Large, dark color islands with stepped edges; no filters or raster textures. */
function nebulaMap() {
  return Array.from({ length: 23 }, (_, y) => Array.from({ length: 49 }, (_, x) => {
    const dx = (x - 24) / 23, dy = (y - 11) / 8;
    const bend = dy + Math.sin(x * .18) * .45;
    const distance = dx * dx + bend * bend;
    const grain = ((x * 7 + y * 13) % 17) / 17;
    if (distance > 1 || (distance > .78 && grain < .55)) return '.';
    return distance > .6 ? 'a' : distance > .42 ? 'v' : distance > .23 || grain > .7 ? 'b' : 'c';
  }).join(''));
}

function moonMap() {
  return Array.from({ length: 33 }, (_, y) => Array.from({ length: 33 }, (_, x) => {
    const dx = x - 16, dy = y - 16;
    const distance = Math.hypot(dx, dy);
    if (distance > 15.5) return '.';
    const light = dx * .8 - dy * .35;
    if (distance > 14 && light < -3) return 'r';
    if (Math.hypot(dx + 6, dy + 4) < 3 || Math.hypot(dx - 2, dy - 7) < 2) return light < -2 ? 'b' : 'd';
    return light < -4 ? 'l' : light < 4 ? 'b' : 'd';
  }).join(''));
}

/** Per-engine, shared geometry. Entity destruction never destroys sibling artwork. */
export class PixelArt {
  private ship = pixelMap(SHIP, SHIP_PALETTE, 2, 24);
  private flameFrames = FLAMES.map(rows => pixelMap(rows, SHIP_PALETTE, 2, 0));
  private thrusters = new WeakMap<Container, { view: Graphics; power: number }>();
  private meteors = [
    pixelMap(meteorMap(0), { o: 0x4a2a6d, d: 0x694283, b: 0x9a5cb1, l: 0xc788d8, h: 0xf1c2f3, m: 0xff77c5, v: 0x9ab2df }, 2),
    pixelMap(meteorMap(1), { o: 0x52294f, d: 0x823b79, b: 0xb95396, l: 0xe987c5, h: 0xffcce9, m: 0xb297fa, v: 0xe2a1e6 }, 2),
    pixelMap(meteorMap(2), { o: 0x30386c, d: 0x4c508c, b: 0x7774b8, l: 0xa6aae4, h: 0xd8e9ff, m: 0xe183cf, v: 0xb5d5ec }, 2),
  ];
  private bolt = pixelMap(['..h..', '.chc.', '.bhb.', '.ccc.', '..c..', '.bcb.', '..b..', '.g.g.', '..g..', '..g..'], { h: 0xf0fdff, c: 0x78eaff, b: 0x3a8ebd, g: 0x173552 }, 2);
  private combat = {
    muzzle: pixelMap(['..c..', '.chc.', 'bhhhb', '.chc.', '..b..'], COMBAT_PALETTE, 2),
    impact: pixelMap(['.c.c.', 'b...b', '..h..', 'b...b', '.c.c.'], COMBAT_PALETTE, 2),
    burst: pixelMap(['....c....', '..b...b..', '.v..m..v.', '..m.c.m..', 'c..chc..c', '..m.c.m..', '.v..m..v.', '..b...b..', '....c....'], COMBAT_PALETTE, 2),
    damage: pixelMap(['..m.m..', '.b...b.', 'm..c..m', '...h...', 'm..c..m', '.b...b.', '..m.m..'], COMBAT_PALETTE, 2),
    spark: pixelMap(['cw', 'wb'], { c: 0xb3edff, w: 0xffffff, b: 0x6b80d7 }, 1),
    dust: pixelMap(['w'], { w: 0x8a78bd }, 2),
    entry: pixelMap(['..vvv..', '.b...b.', 'c.....c'], COMBAT_PALETTE, 2),
    near: pixelMap(['c....', '.b...', '..c..', '...b.', '....c'], COMBAT_PALETTE, 1),
    danger: pixelMap(['...m...', '..mvm..', '.mv.vm.', 'mv...vm', '...v...', '...v...', '...v...'], { m: 0xd568a7, v: 0x764e85 }, 2),
  };
  private waveWord = pixelMap(lettering('ONDA'), { w: 0x88d9f5 }, 2);
  private waveDigits = Array.from({ length: 10 }, (_, digit) => pixelMap(GLYPHS[digit], { w: 0xdff6ff }, 2));
  private stars = [
    pixelMap(['w'], { w: 0xb6cce7 }, 1),
    pixelMap(['ww', 'ww'], { w: 0x9cc4e5 }, 1),
    pixelMap(['.b.', 'bhb', '.b.'], { b: 0x5c96bc, h: 0xc2eafa }, 1),
  ];
  private fragment = pixelMap(['ww', 'ww'], { w: 0xffffff }, 1);
  private scenery = {
    nebula: pixelMap(nebulaMap(), { a: 0x101529, v: 0x1b1c38, b: 0x1c2540, c: 0x1e2941 }, 6),
    moon: pixelMap(moonMap(), { d: 0x101a30, b: 0x17243c, l: 0x24344d, r: 0x35465d }, 2),
  };

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

  combatEffect(kind: CombatGraphic) {
    return new Graphics({ context: this.combat[kind], roundPixels: true, label: 'Pixel combat effect' });
  }

  setCombatEffect(view: Graphics, kind: CombatGraphic) { view.context = this.combat[kind]; }
  waveLabel() { return new Graphics({ context: this.waveWord, roundPixels: true, label: 'ONDA' }); }
  waveDigit() { return new Graphics({ context: this.waveDigits[0], roundPixels: true, label: 'Wave digit' }); }
  setWaveDigit(view: Graphics, digit: number) { view.context = this.waveDigits[digit]; }

  star(radius: number, color: number, alpha: number) {
    return new Graphics({ context: this.stars[radius < 1 ? 0 : radius < 1.7 ? 1 : 2], tint: color, alpha, roundPixels: true, label: 'Pixel star' });
  }

  spaceDecoration(kind: 'nebula' | 'moon') {
    return new Graphics({ context: this.scenery[kind], roundPixels: true, label: `Distant ${kind}` });
  }

  particle(radius: number, color: number) {
    const view = new Graphics({ context: this.fragment, tint: color, roundPixels: true, label: 'Pixel fragment' });
    view.scale.set(Math.round(radius));
    return view;
  }

  destroy() {
    for (const context of [this.ship, ...this.flameFrames, ...this.meteors, this.bolt, ...this.stars, this.fragment,
      ...Object.values(this.combat), this.waveWord, ...this.waveDigits, ...Object.values(this.scenery)]) context.destroy();
  }
}
