import { hash2 } from '../core/rng';
import { canvas, ctx2d, flipX, fromMap, hex, mix, Painter, silhouette } from './pixel';

// ---------------------------------------------------------------------------
// Player (hand-authored). Chest/boots recolour the tunic/boot layers.

const PLAYER_BASE_PAL: Record<string, string> = {
  k: '#1c1a28',
  h: '#2c2a44',
  H: '#4f4c78',
  s: '#f4cba3',
  S: '#cf9a78',
  e: '#1c1a28',
  t: '#3cc8b4',
  T: '#1f8a86',
  b: '#8b5a35',
  B: '#5e3b22',
  m: '#e2bf6a',
  p: '#343c60',
  P: '#242944',
  o: '#5a3a26',
  O: '#3a2616',
};

const BODY_DOWN = [
  '................',
  '......kkkk......',
  '....kkhhHHkk....',
  '...khhhhhHHhk...',
  '..khhhhhhhhHhk..',
  '..khhhhhhhhhhk..',
  '..khhshhhhshhk..',
  '..khsssssssshk..',
  '..kssessssessk..',
  '...kSssssssSk...',
  '..kTttttttttTk..',
  '.kbbtTttttTtbbk.',
  '.kbkbbbTtbbbkbk.',
  '.kSkBBBmmBBBkSk.',
  '..kkpppppppPkk..',
];

const BODY_UP = [
  '................',
  '......kkkk......',
  '....kkhhHHkk....',
  '...khhhhhHHhk...',
  '..khhhhhhhhHhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..kHhhhhhhhhhk..',
  '...khhhhhhhhk...',
  '..kTttttttttTk..',
  '.kbbbbTtTbbbbbk.',
  '.kbkbbbTtbbbkbk.',
  '.kSkBBBTTBBBkSk.',
  '..kkpppppppPkk..',
];

const BODY_SIDE = [
  '................',
  '.....kkkkkk.....',
  '....khhhhHHk....',
  '...khhhhhhHHk...',
  '..khhhhhhhhhHk..',
  '..khhhhhhhhhhhk.',
  '..khhhhhhhsshk..',
  '..khhhhhhssssk..',
  '..khhhhhsssesk..',
  '...khhhSssssk...',
  '...kTttttttTk...',
  '.kTtkbbbbbbbk...',
  '..kTkbbbbSbbk...',
  '...kBBBBmBBk....',
  '...kpppppppk....',
];

const LEGS_FRONT = {
  idle: ['...kppPkkpPPk...', '...koOk..kOok...', '...kkk....kkk...'],
  l: ['...kppPkkpPPk...', '...koOk..kkkk...', '...kkk..........'],
  r: ['...kppPkkpPPk...', '...kkkk..kOok...', '..........kkk...'],
};
const LEGS_SIDE = {
  idle: ['....kppPpk......', '....kOooOk......', '....kkkkkk......'],
  l: ['...kppk.kPpk....', '..kOok...kOok...', '..kkk.....kkk...'],
  r: ['....kpPPk.......', '....kOoOk.......', '....kkkkk.......'],
};

export interface PlayerLook {
  tunic: string;
  tunicDark: string;
  boot: string;
  bootDark: string;
}

export const DEFAULT_LOOK: PlayerLook = { tunic: '#8b5a35', tunicDark: '#5e3b22', boot: '#5a3a26', bootDark: '#3a2616' };

export const CHEST_LOOKS: [string, string][] = [
  ['#8b5a35', '#5e3b22'],
  ['#5d7a3a', '#3e5527'],
  ['#6a6f86', '#464a5e'],
  ['#8a3f3a', '#5c2926'],
  ['#3f6b78', '#294852'],
];
export const BOOT_LOOKS: [string, string][] = [
  ['#5a3a26', '#3a2616'],
  ['#9aa6b8', '#6a7486'],
  ['#3d5a2e', '#273c1d'],
  ['#7a4a6a', '#523048'],
];

export interface PlayerFrames {
  /** [dir][frame] — dir 0=down 1=up 2=left 3=right; frames 0 idle, 1 stepL, 2 idle, 3 stepR */
  frames: HTMLCanvasElement[][];
  white: HTMLCanvasElement[][];
}

const playerCache = new Map<string, PlayerFrames>();

export function playerFrames(look: PlayerLook): PlayerFrames {
  const key = `${look.tunic}${look.boot}`;
  const hit = playerCache.get(key);
  if (hit) return hit;
  const pal = { ...PLAYER_BASE_PAL, b: look.tunic, B: look.tunicDark, o: look.boot, O: look.bootDark };
  const build = (body: string[], legs: string[]) => fromMap([...body, ...legs], pal, 'player');
  const front = [LEGS_FRONT.idle, LEGS_FRONT.l, LEGS_FRONT.idle, LEGS_FRONT.r];
  const side = [LEGS_SIDE.idle, LEGS_SIDE.l, LEGS_SIDE.idle, LEGS_SIDE.r];
  const down = front.map((l) => build(BODY_DOWN, l));
  const up = front.map((l) => build(BODY_UP, l));
  const right = side.map((l) => build(BODY_SIDE, l));
  const left = right.map(flipX);
  const frames = [down, up, left, right];
  const res = { frames, white: frames.map((d) => d.map((f) => silhouette(f, '#ffffff'))) };
  playerCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// Enemies (procedurally painted with quantised lighting and outlines).

export interface EnemySprites {
  frames: HTMLCanvasElement[];
  /** Windup pose. */
  windup: HTMLCanvasElement;
  /** Attack/impact pose. */
  attack: HTMLCanvasElement;
  white: HTMLCanvasElement[];
  w: number;
  h: number;
  /** Offset from feet point to sprite top-left. */
  ox: number;
  oy: number;
}

const BARK = ['#3e2716', '#5a3a22', '#7a5232', '#9a6c44'];
const MOSS = ['#365c22', '#4b7d2c', '#6faa3c', '#9bd055'];

function rootling(squash: number, step: number, elite: boolean): HTMLCanvasElement {
  const P = new Painter(22, 22);
  const cx = 11;
  const by = 18;
  const ry = 6.5 * (1 - squash * 0.25);
  const rx = 7 * (1 + squash * 0.2);
  const cy = by - ry - 1;
  // root legs
  const legC = hex('#4a3020');
  for (const [lx, off] of [
    [cx - 5, step],
    [cx - 1, -step],
    [cx + 3, step],
  ])
    for (let i = 0; i < 3 + (off > 0 ? 0 : 1); i++) P.set(lx + (i > 1 ? 1 : 0), by - 2 + i, legC);
  P.blob(cx, cy, rx, ry, BARK, { tex: (x) => (hash2(x, 3) - 0.5) * 0.25 });
  // moss cap
  const mossCols = MOSS.map(hex);
  for (let y = Math.floor(cy - ry - 3); y < cy - 1; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const nx = (x + 0.5 - cx) / (rx + 0.5);
      const capY = cy - ry * 0.15 - Math.sin(x * 1.7) * 1.2;
      if (y > capY) continue;
      const ny = (y + 0.5 - (cy - 1)) / (ry + 2.5);
      if (nx * nx + ny * ny > 1) continue;
      const l = 0.5 - nx * 0.35 - ny * 0.4 + (hash2(x, y, 9) - 0.5) * 0.4;
      P.set(x, y, mossCols[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
    }
  // sprout leaves
  P.set(cx - 1, cy - ry - 3, MOSS[3]);
  P.set(cx, cy - ry - 4, MOSS[2]);
  P.set(cx + 1, cy - ry - 4, MOSS[3]);
  P.set(cx + 2, cy - ry - 5, MOSS[2]);
  // glowing eyes
  const ey = Math.round(cy + 1);
  for (const ex of [cx - 3, cx + 2]) {
    P.set(ex, ey, elite ? '#ff6a4a' : '#ffcf4a');
    P.set(ex + 1, ey, elite ? '#ffd0b0' : '#fff6c0');
    P.set(ex, ey + 1, elite ? '#c03020' : '#e09a2a');
    P.set(ex + 1, ey + 1, elite ? '#ff6a4a' : '#ffcf4a');
  }
  // mouth
  P.set(cx - 1, ey + 3, '#2a1a10');
  P.set(cx, ey + 3, '#2a1a10');
  P.set(cx + 1, ey + 3, '#2a1a10');
  P.outline('#1d140c');
  return P.toCanvas();
}

const WING = ['#a8845a', '#d8bc8a', '#f0dcb0', '#fff2d6'];

function moth(flap: number, cast: boolean, elite: boolean): HTMLCanvasElement {
  const P = new Painter(24, 20);
  const cx = 12;
  const cy = 10;
  const wy = 4.5 * (0.55 + flap * 0.45);
  // wings (back pair then front pair)
  for (const side of [-1, 1]) {
    P.blob(cx + side * 6, cy - 2, 5, wy, WING, { light: [-0.3 * side, -0.8] });
    P.blob(cx + side * 5, cy + 3, 3.5, wy * 0.7, WING, { light: [-0.3 * side, -0.8] });
    // orange eye spots
    P.set(cx + side * 7, Math.round(cy - 2), elite ? '#c03a6a' : '#e8873a');
    P.set(cx + side * 7 + (side > 0 ? -1 : 1), Math.round(cy - 2), elite ? '#ff6a9a' : '#f6b25a');
    P.set(cx + side * 9, Math.round(cy - 3), '#7a5232');
  }
  // body
  P.blob(cx, cy + 2, 2, 4, ['#3a241c', '#5a3a2e', '#7a5240']);
  // skull head
  P.blob(cx, cy - 3, 2.6, 2.4, ['#b8ae98', '#e6dcc6', '#fff8ea']);
  P.set(cx - 1, cy - 3, '#2a1d1a');
  P.set(cx + 1, cy - 3, '#2a1d1a');
  // antennae
  P.set(cx - 2, cy - 6, '#5a3a2e');
  P.set(cx - 3, cy - 7, '#5a3a2e');
  P.set(cx + 2, cy - 6, '#5a3a2e');
  P.set(cx + 3, cy - 7, '#5a3a2e');
  // wand
  P.line(cx + 3, cy + 3, cx + 6, cy + 6, '#6a4a2a');
  P.set(cx + 6, cy + 6, cast ? '#eaffa0' : '#9ae05a');
  if (cast) {
    P.set(cx + 7, cy + 6, '#b8ff6a');
    P.set(cx + 6, cy + 7, '#b8ff6a');
    P.set(cx + 5, cy + 6, '#b8ff6a');
    P.set(cx + 6, cy + 5, '#b8ff6a');
  }
  P.outline('#2a1d1a');
  return P.toCanvas();
}

const BULB = ['#2f5a24', '#3f7a2c', '#5aa23a', '#86cc52'];

function thornling(squash: number, step: number, elite: boolean): HTMLCanvasElement {
  const P = new Painter(20, 20);
  const cx = 10;
  const by = 17;
  const ry = 5 * (1 - squash * 0.3);
  const rx = 5.5 * (1 + squash * 0.25);
  const cy = by - ry - 1;
  // feet
  P.set(cx - 3, by - 1 + (step > 0 ? -1 : 0), '#2f4a1c');
  P.set(cx - 3, by + (step > 0 ? -1 : 0), '#2f4a1c');
  P.set(cx + 2, by - 1 + (step < 0 ? -1 : 0), '#2f4a1c');
  P.set(cx + 2, by + (step < 0 ? -1 : 0), '#2f4a1c');
  // thorns
  const thorn = elite ? '#e04a3a' : '#b8433a';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9 + Math.PI * 0.05;
    const x0 = cx + Math.cos(a) * rx;
    const y0 = cy + Math.sin(a) * ry;
    P.line(x0, y0, x0 + Math.cos(a) * 2.5, y0 + Math.sin(a) * 2.5, thorn);
  }
  P.blob(cx, cy, rx, ry, BULB);
  // eyes
  const ey = Math.round(cy);
  P.set(cx - 2, ey, '#ffffff');
  P.set(cx + 1, ey, '#ffffff');
  P.set(cx - 2, ey + 1, '#1a1a1a');
  P.set(cx + 1, ey + 1, '#1a1a1a');
  P.set(cx - 1, ey + 3, '#1f3a14');
  P.set(cx, ey + 3, '#1f3a14');
  // leaf on top
  P.set(cx, Math.round(cy - ry - 1), '#9bd055');
  P.set(cx + 1, Math.round(cy - ry - 2), '#9bd055');
  P.set(cx + 2, Math.round(cy - ry - 2), '#6faa3c');
  P.outline('#14240c');
  return P.toCanvas();
}

const enemyCache = new Map<string, EnemySprites>();

export function enemySprites(kind: string, elite: boolean): EnemySprites {
  const key = `${kind}:${elite}`;
  const hit = enemyCache.get(key);
  if (hit) return hit;
  let frames: HTMLCanvasElement[];
  let windup: HTMLCanvasElement;
  let attack: HTMLCanvasElement;
  if (kind === 'root') {
    frames = [rootling(0, 1, elite), rootling(0.05, -1, elite)];
    windup = rootling(-0.35, 0, elite);
    attack = rootling(0.6, 0, elite);
  } else if (kind === 'moth') {
    frames = [moth(1, false, elite), moth(0.5, false, elite), moth(0.1, false, elite), moth(0.5, false, elite)];
    windup = moth(0.8, true, elite);
    attack = moth(0.2, true, elite);
  } else {
    frames = [thornling(0, 1, elite), thornling(0.1, -1, elite)];
    windup = thornling(0.5, 0, elite);
    attack = thornling(-0.3, 0, elite);
  }
  const w = frames[0].width;
  const h = frames[0].height;
  const res: EnemySprites = {
    frames,
    windup,
    attack,
    white: [...frames, windup, attack].map((f) => silhouette(f, '#ffffff')),
    w,
    h,
    ox: -w / 2,
    oy: -h + (kind === 'moth' ? -6 : 3),
  };
  enemyCache.set(key, res);
  return res;
}

// Thorn Warden: a large treant with a hidden core.
export function wardenSprite(pose: 'idle' | 'windup' | 'attack' | 'stun', phase: number, t: number, exposed: boolean): HTMLCanvasElement {
  const key = `warden:${pose}:${phase}:${t}:${exposed}`;
  const hit = bossCache.get(key);
  if (hit) return hit;
  const P = new Painter(56, 60);
  const cx = 28;
  const by = 56;
  const lean = pose === 'windup' ? -2 : pose === 'attack' ? 2 : 0;
  const sq = pose === 'stun' ? 0.12 : 0;
  // roots / legs
  for (const [x, dir] of [
    [cx - 8, -1],
    [cx - 3, -0.4],
    [cx + 3, 0.4],
    [cx + 8, 1],
  ])
    for (let i = 0; i < 6; i++) {
      P.set(x + dir * i * 0.8, by - 6 + i * 0.9 + ((t + i) % 2) * 0, BARK[1]);
      P.set(x + dir * i * 0.8 + 1, by - 6 + i * 0.9, BARK[0]);
    }
  // trunk
  P.blob(cx + lean * 0.5, by - 18, 12 * (1 + sq), 15 * (1 - sq), BARK, { tex: (x, y) => (hash2(x, Math.floor(y / 3), 4) - 0.5) * 0.35 });
  // bark grooves
  for (let i = 0; i < 5; i++) {
    const gx = cx - 8 + i * 4 + lean * 0.5;
    for (let y = by - 28; y < by - 8; y++) if (hash2(gx, y, 11) > 0.35) P.set(gx + Math.sin(y * 0.4) * 0.8, y, '#3a2414');
  }
  // arms (branches)
  const armY = by - 24;
  const armL = pose === 'windup' ? -0.9 : pose === 'attack' ? 0.5 : -0.2;
  for (const side of [-1, 1]) {
    const a = side < 0 ? Math.PI + armL * side : armL * side;
    for (let i = 0; i < 14; i++) {
      const x = cx + side * 9 + Math.cos(a) * i * side * side;
      const y = armY + Math.sin(a + (side < 0 ? 0 : 0)) * i * 0.6 + i * 0.35;
      P.set(x, y, BARK[2]);
      P.set(x, y + 1, BARK[1]);
      P.set(x, y + 2, BARK[0]);
    }
    // claw twigs
    const tx = cx + side * 22;
    const ty = armY + 6;
    P.line(tx, ty, tx + side * 3, ty + 3, BARK[3]);
    P.line(tx, ty, tx + side * 4, ty - 1, BARK[3]);
  }
  // canopy crown
  const crownCols = phase === 2 ? ['#3a3a1a', '#6a5a22', '#a8742a', '#e0a040'] : MOSS;
  P.blob(cx + lean, by - 37, 16, 10, crownCols, { tex: (x, y) => (hash2(x >> 1, y >> 1, 21) - 0.5) * 0.5 });
  P.blob(cx - 9 + lean, by - 33, 8, 6, crownCols, { tex: (x, y) => (hash2(x >> 1, y >> 1, 22) - 0.5) * 0.5 });
  P.blob(cx + 10 + lean, by - 34, 8, 6, crownCols, { tex: (x, y) => (hash2(x >> 1, y >> 1, 23) - 0.5) * 0.5 });
  // flowers in canopy
  for (let i = 0; i < 7; i++) {
    const fx = cx - 12 + ((i * 37) % 25) + lean;
    const fy = by - 44 + ((i * 17) % 12);
    if (P.alpha(fx, fy) === 0) continue;
    P.set(fx, fy, phase === 2 ? '#ff7a3a' : '#f6d8c8');
    P.set(fx + 1, fy, '#ffd27a');
  }
  // thorns on trunk
  for (let i = 0; i < 6; i++) {
    const tx = cx + (i % 2 ? 10 : -10) + lean * 0.5;
    const ty = by - 30 + i * 4;
    P.line(tx, ty, tx + (i % 2 ? 3 : -3), ty - 1, '#b8433a');
  }
  // face: glowing eyes
  const eyeCol = pose === 'stun' ? '#8a8a6a' : phase === 2 ? '#ff6a3a' : '#ffcf4a';
  for (const ex of [cx - 5, cx + 3]) {
    P.rect(ex + lean * 0.5, by - 27, 3, 2, eyeCol);
    P.set(ex + 1 + lean * 0.5, by - 27, '#fff6c0');
  }
  // core
  if (exposed) {
    P.blob(cx + lean * 0.5, by - 17, 4, 4, ['#a8401a', '#ff8a2a', '#ffd06a', '#fff6c0']);
  } else {
    P.rect(cx - 3 + lean * 0.5, by - 18, 6, 2, '#3a2414');
  }
  P.outline('#160e08');
  const c = P.toCanvas();
  bossCache.set(key, c);
  return c;
}
const bossCache = new Map<string, HTMLCanvasElement>();

// ---------------------------------------------------------------------------
// Props

export interface PropSprites {
  chestClosed: HTMLCanvasElement;
  chestOpen: HTMLCanvasElement;
  chestGuarded: HTMLCanvasElement;
  urn: HTMLCanvasElement[];
  statue: HTMLCanvasElement;
  pillar: HTMLCanvasElement;
  fern: HTMLCanvasElement[];
  flowerBig: HTMLCanvasElement[];
  spring: HTMLCanvasElement;
  springUsed: HTMLCanvasElement;
  coin: HTMLCanvasElement[];
  orb: HTMLCanvasElement;
  seed: HTMLCanvasElement;
  gate: HTMLCanvasElement;
}

let props: PropSprites | null = null;

export function propSprites(): PropSprites {
  if (props) return props;
  const chestPal = { k: '#24160c', w: '#8a5530', W: '#5e3a20', l: '#b07440', g: '#e6c06a', G: '#a8823a', d: '#120a06', b: '#7fd6ff', B: '#3fa0d8' };
  const chestClosed = fromMap(
    [
      '................',
      '..kkkkkkkkkkkk..',
      '.kllllllllllllk.',
      '.kwwwwwwwwwwwwk.',
      '.kgGGGGggGGGGgk.',
      '.kwwwwwkgkwwwwk.',
      '.kWwwwwkGkwwwWk.',
      '.kwwwwwwkwwwwwk.',
      '.kwwwwwwwwwwwwk.',
      '.kgGGGGGGGGGGgk.',
      '.kWWWWWWWWWWWWk.',
      '..kkkkkkkkkkkk..',
    ],
    chestPal,
    'chest',
  );
  const chestOpen = fromMap(
    [
      '..kkkkkkkkkkkk..',
      '.kllllllllllllk.',
      '.kWWWWWWWWWWWWk.',
      '.kgGGGGGGGGGGgk.',
      '.kddddddddddddk.',
      '.kdbBdddddbBddk.',
      '.kWwwwwkGkwwwWk.',
      '.kwwwwwwkwwwwwk.',
      '.kwwwwwwwwwwwwk.',
      '.kgGGGGGGGGGGgk.',
      '.kWWWWWWWWWWWWk.',
      '..kkkkkkkkkkkk..',
    ],
    chestPal,
    'chestOpen',
  );
  const guardedPal = { ...chestPal, w: '#4a5a6a', W: '#2e3a46', l: '#6a7c8e', g: '#f0d070', G: '#c09a3a' };
  const chestGuarded = fromMap(
    [
      '................',
      '..kkkkkkkkkkkk..',
      '.kllllllllllllk.',
      '.kwwwwwwwwwwwwk.',
      '.kgGGGGggGGGGgk.',
      '.kwwgwwkgkwwgwk.',
      '.kWwgwwkGkwwgWk.',
      '.kwwgwwwkwwwgwk.',
      '.kwwgwwwwwwwgwk.',
      '.kgGGGGGGGGGGgk.',
      '.kWWWWWWWWWWWWk.',
      '..kkkkkkkkkkkk..',
    ],
    guardedPal,
    'chestG',
  );

  const urn = [0, 1].map((v) => {
    const P = new Painter(12, 14);
    const ramp = v ? ['#5a3a2a', '#7a5038', '#9a6a48', '#c08a5a'] : ['#4a4a3a', '#6a6a52', '#8a8a6a', '#aaa888'];
    P.blob(6, 8.5, 4.5, 4.5, ramp);
    P.rect(4, 2, 4, 2, ramp[1]);
    P.rect(4, 2, 4, 1, ramp[2]);
    P.set(5, 3, ramp[0]);
    if (v === 0) {
      P.set(3, 7, '#5f9a3a');
      P.set(4, 6, '#7ab443');
      P.set(8, 9, '#5f9a3a');
    }
    P.outline('#1c1810');
    return P.toCanvas();
  });

  // Hooded statue (as in the reference garden).
  const statue = (() => {
    const P = new Painter(18, 30);
    const stone = ['#5e5a4c', '#7c7866', '#9c9884', '#bdb8a2'];
    P.rect(2, 24, 14, 5, stone[1]);
    P.rect(2, 24, 14, 1, stone[3]);
    P.rect(2, 28, 14, 1, stone[0]);
    P.blob(9, 17, 5.5, 8, stone, { tex: (x, y) => (hash2(x, y, 5) - 0.5) * 0.15 });
    P.blob(9, 8, 4.2, 4.5, stone);
    // hood shadow / face
    P.rect(7, 8, 4, 3, '#3e3a30');
    P.set(8, 10, '#4e4a3e');
    // folded hands
    P.rect(7, 16, 5, 2, stone[2]);
    // moss
    for (let i = 0; i < 18; i++) {
      const x = 3 + ((i * 7) % 12);
      const y = 5 + ((i * 11) % 22);
      if (P.alpha(x, y) > 0 && hash2(x, y, 1) > 0.4) P.set(x, y, i % 3 ? '#5f9a3a' : '#7ab443');
    }
    P.outline('#1c1810');
    return P.toCanvas();
  })();

  const pillar = (() => {
    const P = new Painter(16, 34);
    const stone = ['#5e5a4c', '#7c7866', '#9c9884', '#c4bea6'];
    // capital
    P.rect(1, 0, 14, 4, stone[2]);
    P.rect(1, 0, 14, 1, stone[3]);
    P.rect(1, 3, 14, 1, stone[0]);
    // shaft with cylinder shading
    for (let y = 4; y < 29; y++)
      for (let x = 3; x < 13; x++) {
        const t = (x - 3) / 9;
        const idx = t < 0.2 ? 2 : t < 0.55 ? 3 : t < 0.85 ? 1 : 0;
        P.set(x, y, stone[idx]);
        if (y % 6 === 0 && hash2(x, y, 2) > 0.5) P.set(x, y, stone[0]);
      }
    // base
    P.rect(1, 29, 14, 5, stone[1]);
    P.rect(1, 29, 14, 1, stone[3]);
    // ivy
    for (let y = 2; y < 30; y++) {
      const x = 4 + Math.round(Math.sin(y * 0.45) * 3 + 3);
      if (hash2(x, y, 7) > 0.3) P.set(x, y, y % 3 ? '#5f9a3a' : '#86c24a');
      if (hash2(x, y, 8) > 0.7) P.set(x + 1, y, '#3f6a26');
    }
    P.outline('#1c1810');
    return P.toCanvas();
  })();

  const fern = [0, 1].map((v) => {
    const P = new Painter(16, 14);
    const cols = ['#2f5a24', '#4b8a2e', '#6fb03c', '#9ad055'];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.45 + v * 0.1;
      for (let j = 0; j < 7; j++) {
        const x = 8 + Math.cos(a) * j;
        const y = 13 + Math.sin(a) * j + j * j * 0.06;
        P.set(x, y, cols[Math.min(3, 1 + (j >> 1))]);
        if (j % 2) P.set(x + 1, y + 1, cols[0]);
      }
    }
    return P.toCanvas();
  });

  const flowerBig = [0, 1].map((v) => {
    const P = new Painter(14, 14);
    const petal = v ? ['#c87a5a', '#f0a080', '#ffd0b0', '#fff0e0'] : ['#c89a7a', '#f2c8a8', '#ffe2cc', '#fff6ec'];
    // leaves
    P.blob(4, 10, 3, 1.6, ['#3f6a26', '#5f9a3a', '#7ab443']);
    P.blob(10, 10, 3, 1.6, ['#3f6a26', '#5f9a3a', '#7ab443']);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      P.blob(7 + Math.cos(a) * 2.6, 6 + Math.sin(a) * 2, 2.2, 1.8, petal);
    }
    P.blob(7, 6, 1.5, 1.5, ['#d89a2a', '#ffd25a', '#fff0a0']);
    P.outline('#2a2018');
    return P.toCanvas();
  });

  const spring = (() => {
    const P = new Painter(24, 18);
    const stone = ['#5e5a4c', '#7c7866', '#9c9884', '#c4bea6'];
    P.blob(12, 10, 11, 7, stone);
    P.blob(12, 9.5, 8.5, 5, ['#145e66', '#1f8a8e', '#38c0b8', '#8af0dc']);
    for (let i = 0; i < 8; i++) P.set(6 + i * 2, 7 + (i % 3), '#c9f5ec');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      P.set(12 + Math.cos(a) * 10.5, 10 + Math.sin(a) * 6.5, i % 2 ? '#5f9a3a' : '#86c24a');
    }
    P.outline('#1c1810');
    return P.toCanvas();
  })();
  const springUsed = (() => {
    const c = canvas(spring.width, spring.height);
    const g = ctx2d(c);
    g.filter = 'saturate(0.25) brightness(0.75)';
    g.drawImage(spring, 0, 0);
    return c;
  })();

  const coin = [0, 1, 2, 3].map((f) => {
    const P = new Painter(6, 6);
    const w = [2.6, 1.8, 0.8, 1.8][f];
    P.blob(3, 3, w, 2.6, ['#a8701a', '#e0a832', '#ffe07a', '#fff8d0']);
    return P.toCanvas();
  });
  const orb = (() => {
    const P = new Painter(8, 8);
    P.blob(4, 4, 3, 3, ['#2a8a4a', '#4ad07a', '#9affb0', '#eaffee']);
    return P.toCanvas();
  })();
  const seed = (() => {
    const P = new Painter(8, 8);
    P.blob(4, 4, 2.6, 2.6, ['#3a7a1a', '#7ad03a', '#c0ff6a', '#f0ffd0']);
    P.outline('#1a3a0a');
    return P.toCanvas();
  })();

  const gate = (() => {
    const P = new Painter(16, 24);
    for (let i = 0; i < 9; i++) {
      const x0 = 1 + ((i * 5) % 14);
      for (let y = 23; y > 4 + (i % 3) * 2; y--) {
        const x = x0 + Math.sin(y * 0.5 + i) * 1.5;
        P.set(x, y, y % 4 === 0 ? '#6a4a2a' : '#4a3020');
        if (y % 5 === i % 5) P.set(x + (i % 2 ? 1 : -1), y - 1, '#b8433a');
      }
    }
    P.outline('#120a06');
    return P.toCanvas();
  })();

  props = { chestClosed, chestOpen, chestGuarded, urn, statue, pillar, fern, flowerBig, spring, springUsed, coin, orb, seed, gate };
  return props;
}

export function shadeColor(c: string, t: number): string {
  const m = mix(hex(c), t < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(t));
  return `rgb(${m[0] | 0},${m[1] | 0},${m[2] | 0})`;
}
