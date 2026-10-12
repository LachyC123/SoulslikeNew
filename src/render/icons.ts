import { AffixId, Element, Item } from '../data/items';
import { hash2 } from '../core/rng';
import { CHEST_LOOKS, BOOT_LOOKS } from './sprites';
import { canvas, ctx2d, hex, Painter, RGB } from './pixel';

const BLADE: Record<Element, string[]> = {
  none: ['#4a5262', '#7d889a', '#b8c2d0', '#eef2f8'],
  poison: ['#1c4a22', '#358a34', '#6cc444', '#c4f08a'],
  frost: ['#24507e', '#418fc6', '#84d2f4', '#e2f8ff'],
};
const GOLD = ['#6a4a1a', '#a87a2a', '#e0b04a', '#fff0a0'];
const WOOD = ['#3a2414', '#5e3a20', '#8a5a34', '#b07a48'];

export function elementGlow(e: Element): string {
  return e === 'poison' ? '#9cf05a' : e === 'frost' ? '#9ae8ff' : '#ffffff';
}

const cache = new Map<string, HTMLCanvasElement>();

/** Inventory illustration (32x32). Same construction as the world sprite. */
export function itemIcon(item: Item): HTMLCanvasElement {
  const key = `icon:${item.uid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let c: HTMLCanvasElement;
  if (item.slot === 'weapon') c = weaponIcon(item);
  else if (item.slot === 'ring') c = ringIcon(item);
  else if (item.slot === 'chest') c = chestIcon(item);
  else c = bootIcon(item);
  cache.set(key, c);
  return c;
}

function variant(item: Item, n: number, salt = 0): number {
  return Math.floor(hash2(item.look & 0xffff, item.look >>> 16, salt) * n);
}

/** Rasterise a thick line with lighting across its width (blade/shaft). */
function thick(P: Painter, x0: number, y0: number, x1: number, y1: number, w: number, ramp: string[], taper = 0) {
  const cols = ramp.map(hex);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const minX = Math.floor(Math.min(x0, x1) - w - 1);
  const maxX = Math.ceil(Math.max(x0, x1) + w + 1);
  const minY = Math.floor(Math.min(y0, y1) - w - 1);
  const maxY = Math.ceil(Math.max(y0, y1) + w + 1);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const t = (px * ux + py * uy) / len;
      if (t < 0 || t > 1) continue;
      const s = px * nx + py * ny;
      const hw = (w / 2) * (1 - taper * Math.max(0, t - 0.6) * 2.5);
      if (Math.abs(s) > hw) continue;
      const k = (s / hw + 1) / 2; // 0..1 across width
      const idx = k < 0.25 ? 3 : k < 0.55 ? 2 : k < 0.85 ? 1 : 0;
      P.set(x, y, cols[idx] as RGB);
    }
}

function weaponIcon(item: Item): HTMLCanvasElement {
  const P = new Painter(32, 32);
  const ramp = BLADE[item.element];
  const v = variant(item, 3);
  if (item.family === 'sword') {
    const bw = v === 2 ? 4.5 : 3.5;
    if (v === 1) {
      // Curved blade
      for (let i = 0; i < 18; i++) {
        const t0 = i / 18;
        const t1 = (i + 1) / 18;
        const bx0 = 9 + t0 * 18 + Math.sin(t0 * Math.PI) * 2.5;
        const by0 = 22 - t0 * 18 + Math.sin(t0 * Math.PI) * 2.5;
        const bx1 = 9 + t1 * 18 + Math.sin(t1 * Math.PI) * 2.5;
        const by1 = 22 - t1 * 18 + Math.sin(t1 * Math.PI) * 2.5;
        thick(P, bx0, by0, bx1, by1, bw * (1 - t0 * 0.45), ramp);
      }
    } else thick(P, 9, 22, 27, 4, bw, ramp, 0.5);
    thick(P, 5, 18, 13, 26, 2.2, GOLD);
    thick(P, 3, 29, 9, 23, 2.2, WOOD);
    P.set(3, 29, GOLD[2]);
    P.set(2, 30, GOLD[1]);
  } else if (item.family === 'daggers') {
    for (const flip of [0, 1]) {
      const fx = (x: number) => (flip ? 32 - x : x);
      thick(P, fx(10), 20, fx(24), 6, 3, ramp, 0.6);
      thick(P, fx(7), 18, fx(12), 23, 1.8, GOLD);
      thick(P, fx(4), 26, fx(9), 21, 2, WOOD);
    }
    if (v === 1) {
      // Hooked tips
      P.set(25, 7, ramp[3]);
      P.set(26, 8, ramp[2]);
      P.set(7, 7, ramp[3]);
      P.set(6, 8, ramp[2]);
    }
  } else {
    // Hammer: shaft then a rotated head.
    thick(P, 4, 29, 19, 13, 2.6, WOOD);
    P.set(4, 29, GOLD[2]);
    P.set(3, 30, GOLD[1]);
    const hx = 21;
    const hy = 11;
    const a = -Math.PI / 4;
    const hw = v === 1 ? 7 : 6;
    const hh = v === 2 ? 5 : 4.5;
    const cols = ramp.map(hex);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const px = x + 0.5 - hx;
        const py = y + 0.5 - hy;
        const u = px * Math.cos(a) + py * Math.sin(a);
        const w = -px * Math.sin(a) + py * Math.cos(a);
        const bell = v === 1 ? 1 + Math.abs(u) / hw * 0.4 : 1;
        if (Math.abs(u) > hh || Math.abs(w) > hw * bell) continue;
        const l = 0.55 - (u / hh) * 0.35 - (w / hw) * 0.2;
        P.set(x, y, cols[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
        if (Math.abs(Math.abs(w) - hw * 0.55) < 0.6) P.set(x, y, GOLD[Math.abs(u) < hh * 0.5 ? 2 : 1]);
      }
    if (item.element === 'frost') {
      for (let i = 0; i < 6; i++) {
        const x = 15 + ((i * 7) % 14);
        const y = 3 + ((i * 5) % 14);
        if (P.alpha(x, y) > 0) continue;
        P.set(x, y, '#e2f8ff');
      }
    }
    if (v === 2) {
      // Spikes
      P.set(26, 6, ramp[3]);
      P.set(27, 5, ramp[2]);
      P.set(16, 16, ramp[2]);
    }
  }
  if (item.element === 'poison') {
    for (let i = 0; i < 5; i++) {
      const x = 12 + ((i * 9) % 16);
      const y = 6 + ((i * 7) % 18);
      if (P.alpha(x, y) === 0) P.set(x, y, '#9cf05a', 160);
    }
  }
  P.outline('#120e18');
  return P.toCanvas();
}

const RING_GEM: Partial<Record<AffixId, string[]>> = {
  frostNova: ['#24507e', '#418fc6', '#84d2f4', '#e2f8ff'],
  rimeHeart: ['#24507e', '#418fc6', '#84d2f4', '#e2f8ff'],
  frostStep: ['#2a6a7e', '#4aa0c0', '#9adcec', '#e8fcff'],
  sporeBloom: ['#1c4a22', '#358a34', '#6cc444', '#c4f08a'],
  venomHeart: ['#2a4a12', '#4a8a22', '#8ad04a', '#d8ff9a'],
  shadowEcho: ['#2a1a4a', '#4a3080', '#7a5ac0', '#c8b0ff'],
  bloodPrice: ['#5a1018', '#9a2030', '#d84a4a', '#ffb0a0'],
  luckyStrike: ['#6a4a10', '#b08020', '#f0c040', '#fff4b0'],
};

function ringIcon(item: Item): HTMLCanvasElement {
  const P = new Painter(32, 32);
  const gem = RING_GEM[item.affixes[0]?.id] ?? ['#3a5a3a', '#5a8a5a', '#8ac08a', '#d0f0d0'];
  const band = variant(item, 2) ? ['#5a5a6a', '#8a8a9a', '#c0c0d0', '#f0f0ff'] : GOLD;
  const cols = band.map(hex);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dx = (x + 0.5 - 16) / 9;
      const dy = (y + 0.5 - 18) / 8;
      const d = Math.hypot(dx, dy);
      if (d > 1 || d < 0.62) continue;
      const l = 0.5 - dx * 0.3 - dy * 0.35 + (d - 0.8) * 0.8;
      P.set(x, y, cols[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
    }
  P.blob(16, 9, 5, 4.5, gem);
  P.set(14, 7, '#ffffff');
  P.outline('#120e18');
  return P.toCanvas();
}

function chestIcon(item: Item): HTMLCanvasElement {
  const [c1, c2] = CHEST_LOOKS[item.look % CHEST_LOOKS.length];
  const P = new Painter(32, 32);
  const ramp = [c2, c2, c1, c1];
  // torso
  for (let y = 6; y < 28; y++)
    for (let x = 6; x < 26; x++) {
      const inSleeve = y < 16 && (x < 9 || x > 22);
      const inBody = x >= 9 && x <= 22;
      if (!inSleeve && !inBody) continue;
      if (y < 9 && x > 12 && x < 19) continue; // neckline
      const l = 0.6 - (x - 16) / 30 - (y - 6) / 60;
      P.set(x, y, ramp[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
    }
  P.rect(9, 21, 14, 2, '#3a2416');
  P.rect(15, 21, 2, 2, GOLD[2]);
  P.line(12, 9, 16, 14, '#3a2416');
  P.line(20, 9, 16, 14, '#3a2416');
  P.outline('#120e18');
  return P.toCanvas();
}

function bootIcon(item: Item): HTMLCanvasElement {
  const [c1, c2] = BOOT_LOOKS[item.look % BOOT_LOOKS.length];
  const P = new Painter(32, 32);
  for (const ox of [0, 9]) {
    for (let y = 6; y < 26; y++)
      for (let x = 6 + ox; x < 13 + ox; x++) P.set(x, y, x - ox < 8 ? c1 : c2);
    for (let y = 20; y < 26; y++) for (let x = 13 + ox; x < 17 + ox; x++) P.set(x, y, c1);
    P.rect(6 + ox, 25, 11, 2, '#2a1a10');
    P.rect(6 + ox, 6, 7, 2, c2);
  }
  P.outline('#120e18');
  return P.toCanvas();
}

/** Small world sprite of a weapon pointing right; grip at (gx, gy). */
export interface HeldSprite {
  img: HTMLCanvasElement;
  gx: number;
  gy: number;
}

export function heldWeapon(item: Item): HeldSprite {
  const key = `held:${item.uid}`;
  const hit = cache.get(key) as (HTMLCanvasElement & { _g?: [number, number] }) | undefined;
  if (hit && hit._g) return { img: hit, gx: hit._g[0], gy: hit._g[1] };
  const ramp = BLADE[item.element];
  const v = variant(item, 3);
  let P: Painter;
  let g: [number, number];
  if (item.family === 'hammer') {
    P = new Painter(22, 12);
    thick(P, 1, 6, 15, 6, 2, WOOD);
    const head = ramp.map(hex);
    const hh = v === 1 ? 6 : 5;
    for (let y = 6 - hh; y < 6 + hh; y++)
      for (let x = 14; x < 20; x++) {
        const l = 0.6 - (y - 6) / (hh * 2.5) - (x - 17) / 12;
        P.set(x, y, head[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
      }
    P.rect(16, 6 - hh, 1, hh * 2, GOLD[2]);
    g = [2, 6];
  } else if (item.family === 'daggers') {
    P = new Painter(12, 6);
    thick(P, 4, 3, 11, 3, 2.4, ramp, 0.6);
    P.rect(3, 1, 1, 4, GOLD[2]);
    thick(P, 0, 3, 3, 3, 1.8, WOOD);
    g = [1, 3];
  } else {
    P = new Painter(19, 8);
    if (v === 1) for (let i = 0; i < 12; i++) P.set(6 + i, 4 - Math.round(Math.sin((i / 12) * Math.PI) * 1.2), ramp[2]);
    thick(P, 5, 4, 18, 4, v === 2 ? 3.4 : 2.6, ramp, 0.5);
    P.rect(4, 1, 1, 6, GOLD[2]);
    P.rect(5, 2, 1, 4, GOLD[1]);
    thick(P, 0, 4, 4, 4, 1.8, WOOD);
    g = [1, 4];
  }
  P.outline('#120e18');
  const img = P.toCanvas() as HTMLCanvasElement & { _g?: [number, number] };
  img._g = g;
  cache.set(key, img);
  return { img, gx: g[0], gy: g[1] };
}

/** Upscaled copy for UI cards (nearest-neighbour). */
export function iconDataUrl(item: Item, scale = 4): string {
  const key = `url:${item.uid}:${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const src = itemIcon(item);
  const c = canvas(src.width * scale, src.height * scale);
  const g = ctx2d(c);
  g.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
const urlCache = new Map<string, string>();
