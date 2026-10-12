import { hash2 } from '../core/rng';
import { EL_GLOW, EL_RAMP, Element } from '../data/elements';
import { Item, MATERIALS, RARITIES } from '../data/items';
import { BOOT_LOOKS, CHEST_LOOKS } from './sprites';
import { canvas, ctx2d, hex, Painter, RGB } from './pixel';

export function elementGlow(e: Element): string {
  return EL_GLOW[e];
}

const WOODS = [
  ['#3a2414', '#5e3a20', '#8a5a34', '#b07a48'],
  ['#1c120c', '#2e1e14', '#4a3222', '#6a4a32'],
  ['#5a4a32', '#8a7450', '#b8a074', '#e0caa0'],
  ['#4a1a14', '#7a2e20', '#a84a32', '#d8704a'],
];
const WRAPS = ['#2a5a6a', '#6a2a2a', '#2a2a2a', '#5a4a2a', '#3a2a5a', '#2a5a3a'];
const GOLD = ['#6a4a1a', '#a87a2a', '#e0b04a', '#fff0a0'];

const cache = new Map<string, HTMLCanvasElement>();

const vh = (item: Item, salt: number) => hash2(item.look & 0xffff, item.look >>> 16, salt);

// ---------------------------------------------------------------------------
// Axis painter: every weapon is composed of segments along a grip→tip axis.

class Axis {
  constructor(
    readonly P: Painter,
    readonly ox: number,
    readonly oy: number,
    readonly ux: number,
    readonly uy: number,
    readonly L: number,
  ) {}

  pt(t: number, s: number): [number, number] {
    const nx = -this.uy;
    const ny = this.ux;
    return [this.ox + this.ux * t * this.L + nx * s, this.oy + this.uy * t * this.L + ny * s];
  }
}

/** Thick segment between two points with width interpolation, curve, and lighting across the width. */
function seg(P: Painter, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, ramp: string[] | RGB[], curve = 0) {
  const cols = (ramp as (string | RGB)[]).map((c) => (typeof c === 'string' ? hex(c) : c));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const pad = Math.max(w0, w1) + Math.abs(curve) + 2;
  for (let y = Math.floor(Math.min(y0, y1) - pad); y <= Math.ceil(Math.max(y0, y1) + pad); y++)
    for (let x = Math.floor(Math.min(x0, x1) - pad); x <= Math.ceil(Math.max(x0, x1) + pad); x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      const t = (px * ux + py * uy) / len;
      if (t < 0 || t > 1) continue;
      const s = px * nx + py * ny - curve * Math.sin(Math.PI * t);
      const hw = (w0 + (w1 - w0) * t) / 2;
      if (hw <= 0.05 || Math.abs(s) > hw) continue;
      const k = (s / hw + 1) / 2;
      const idx = k < 0.22 ? 3 : k < 0.55 ? 2 : k < 0.85 ? 1 : 0;
      P.set(x, y, cols[Math.min(cols.length - 1, idx)]);
    }
}

function dot(P: Painter, x: number, y: number, r: number, ramp: string[]) {
  P.blob(x, y, r, r, ramp);
}

function bladeRamp(item: Item): string[] {
  const mat = MATERIALS[item.mat ?? 0].ramp;
  if (item.element !== 'none' && vh(item, 3) > 0.3) return EL_RAMP[item.element];
  return mat;
}

function runes(P: Painter, A: Axis, t0: number, t1: number, item: Item, curve = 0) {
  if (item.element === 'none') return;
  const glow = EL_GLOW[item.element];
  const n = 3 + Math.floor(vh(item, 9) * 3);
  for (let i = 0; i < n; i++) {
    const t = t0 + ((i + 0.5) / n) * (t1 - t0);
    const [x, y] = A.pt(t, curve * Math.sin(Math.PI * ((t - t0) / (t1 - t0))));
    P.set(Math.round(x), Math.round(y), glow);
  }
  if (item.element2) {
    const [x, y] = A.pt((t0 + t1) / 2, 0);
    P.set(Math.round(x) + 1, Math.round(y), EL_GLOW[item.element2]);
  }
}

function gemColor(item: Item): string[] {
  if (item.element !== 'none') return EL_RAMP[item.element];
  return [['#3a1a4a', '#6a3a8a', '#a87ad8', '#ecd8ff'], ['#5a0a14', '#9a1a2a', '#e04a5a', '#ffc0c0'], ['#0a3a2a', '#1a7a4a', '#3ad07a', '#c0ffd8']][Math.floor(vh(item, 7) * 3)];
}

/** Paint a weapon along an axis. `L` is the overall length. */
function paintWeapon(P: Painter, item: Item, A: Axis, small: boolean) {
  const fam = item.family!;
  const v = item.variant ?? 0;
  const blade = bladeRamp(item);
  const wood = WOODS[Math.floor(vh(item, 1) * WOODS.length)];
  const metal = MATERIALS[item.mat ?? 0].ramp;
  const trim = vh(item, 2) > 0.5 ? GOLD : metal;
  const wrap = WRAPS[Math.floor(vh(item, 4) * WRAPS.length)];
  const k = small ? 0.55 : 1;
  const L = A.L;
  const S = (t0: number, s0: number, t1: number, s1: number, w0: number, w1: number, ramp: string[], curve = 0) => {
    const [x0, y0] = A.pt(t0, s0);
    const [x1, y1] = A.pt(t1, s1);
    seg(P, x0, y0, x1, y1, w0 * k, w1 * k, ramp, curve * k);
  };
  switch (fam) {
    case 'sword': {
      const bw = v === 2 ? 5 : v === 1 ? 3 : 4 + vh(item, 5);
      const curve = v === 1 || vh(item, 6) > 0.75 ? 2 + vh(item, 8) * 2 : 0;
      S(0.25, 0, 1, 0, bw, 0.6, blade, curve);
      if (vh(item, 10) > 0.5 && !small) S(0.3, 0, 0.8, 0, 1, 1, [blade[0], blade[0], blade[1], blade[1]], curve);
      runes(P, A, 0.32, 0.85, item, curve);
      S(0.02, 0, 0.24, 0, 2.4, 2.4, [wrap, wrap, wood[2], wood[3]]);
      const gw = 7 + vh(item, 11) * 4;
      S(0.22, -gw / 2, 0.22, gw / 2, 2.4, 2.4, trim);
      dot(P, ...A.pt(0.02, 0), 1.6 * k, gemColor(item));
      break;
    }
    case 'daggers': {
      S(0.38, 0, 1, 0, 3.2, 0.5, blade, v === 1 ? 1.5 : 0);
      runes(P, A, 0.45, 0.85, item);
      S(0.06, 0, 0.36, 0, 2.2, 2.2, [wrap, wrap, wood[2], wood[3]]);
      S(0.36, -3, 0.36, 3, 2, 2, trim);
      dot(P, ...A.pt(0.05, 0), 1.3 * k, gemColor(item));
      break;
    }
    case 'hammer': {
      S(0, 0, 0.86, 0, 2.6, 2.4, wood);
      S(0.0, 0, 0.06, 0, 3, 3, trim);
      const hw = v === 1 ? 7 : 6;
      const hl = v === 1 ? 7 : v === 2 ? 6 : 6.5;
      if (v === 2) {
        S(0.86, 0, 0.86, -hl * 1.6, hw, 1, metal);
        S(0.86, 0, 0.86, hl * 0.7, hw, hw, blade);
      } else {
        S(0.86, -hl, 0.86, hl, hw * (v === 1 ? 1.2 : 1), hw * (v === 1 ? 1.2 : 1), blade);
        S(0.86, -hl * 0.4, 0.86, -hl * 0.25, hw + 0.5, hw + 0.5, trim);
        S(0.86, hl * 0.25, 0.86, hl * 0.4, hw + 0.5, hw + 0.5, trim);
      }
      if (item.element !== 'none') {
        const [x, y] = A.pt(0.86, 0);
        P.set(Math.round(x), Math.round(y), EL_GLOW[item.element]);
      }
      break;
    }
    case 'spear': {
      S(0, 0, 0.78, 0, 2, 2, wood);
      if (v === 1) S(0.72, 0, 1, 0, 5, 0.5, blade, 2.5);
      else {
        S(0.74, 0, 0.84, 0, 1.5, v === 2 ? 5.5 : 4.4, blade);
        S(0.84, 0, 1, 0, v === 2 ? 5.5 : 4.4, 0.4, blade);
      }
      runes(P, A, 0.78, 0.94, item);
      S(0.74, -3, 0.74, 3, 1.8, 1.8, trim);
      if (vh(item, 12) > 0.4) S(0.72, 0, 0.62, 2.5, 1.6, 1, [wrap, wrap, wrap, '#ffffff']);
      break;
    }
    case 'scythe': {
      S(0, 0, 1, 0, 2.2, 2, wood, 1);
      const bl = (v === 2 ? 0.55 : v === 1 ? 0.38 : 0.48) * L;
      const [tx, ty] = A.pt(0.97, 0);
      const [ex, ey] = A.pt(0.82, -bl);
      seg(P, tx, ty, ex, ey, 6 * k, 0.8 * k, blade, -4 * k);
      S(0.95, -1.5, 0.95, 1.5, 3, 3, trim);
      if (item.element !== 'none') P.set(Math.round((tx + ex) / 2), Math.round((ty + ey) / 2), EL_GLOW[item.element]);
      break;
    }
    case 'axe': {
      S(0, 0, 0.94, 0, 2.4, 2.2, wood);
      const hw = v === 0 ? 6 : 8;
      const reach = v === 2 ? 6.5 : 7.5;
      // Crescent head on one side (both sides for battleaxes).
      for (const side of v === 1 ? [-1, 1] : [-1]) S(0.86, 0, 0.86, side * reach, hw * 0.7, hw * (v === 2 ? 1 : 1.35), blade);
      S(0.8, 0, 0.92, 0, 3.2, 3.2, metal);
      runes(P, A, 0.82, 0.9, item);
      S(0.0, 0, 0.05, 0, 3, 3, trim);
      break;
    }
    case 'bow': {
      const bulge = small ? 3 : 5 + vh(item, 5) * 2;
      const [x0, y0] = A.pt(0, 0);
      const [x1, y1] = A.pt(1, 0);
      seg(P, x0, y0, x1, y1, 2.2 * k, 2.2 * k, v === 1 ? WOODS[1] : wood, bulge);
      P.line(x0, y0, x1, y1, '#e8e0d0');
      dot(P, ...A.pt(0.5, bulge * 0.9), 1.6 * k, trim);
      if (item.element !== 'none') {
        P.set(Math.round(x0), Math.round(y0), EL_GLOW[item.element]);
        P.set(Math.round(x1), Math.round(y1), EL_GLOW[item.element]);
      }
      if (!small) {
        // A nocked arrow for the illustration.
        const [ax, ay] = A.pt(0.5, -2);
        const [bx, by] = A.pt(0.5, bulge + 8);
        seg(P, ax, ay, bx, by, 1.2, 1.2, ['#5a3a20', '#8a5a34', '#b07a48', '#d8a070']);
        dot(P, bx, by, 1.5, blade);
      }
      break;
    }
    case 'wand': {
      S(0, 0, 0.72, 0, 1.8, 2.4, v === 2 ? metal : wood);
      S(0.7, -2.5, 0.84, -1, 1.2, 1, trim);
      S(0.7, 2.5, 0.84, 1, 1.2, 1, trim);
      const [gx, gy] = A.pt(0.84, 0);
      dot(P, gx, gy, (v === 2 ? 4.2 : 3.2) * k, gemColor(item));
      if (v === 1) {
        dot(P, ...A.pt(0.78, 3.5), 1.4 * k, gemColor(item));
        dot(P, ...A.pt(0.78, -3.5), 1.4 * k, gemColor(item));
      }
      break;
    }
    case 'chakram': {
      const [cx, cy] = A.pt(0.5, 0);
      const r = L * (v === 2 ? 0.34 : 0.3);
      const cols = blade.map(hex);
      for (let y = Math.floor(cy - r - 4); y <= cy + r + 4; y++)
        for (let x = Math.floor(cx - r - 4); x <= cx + r + 4; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const spikes = v === 2 ? 10 : v === 1 ? 4 : 6;
          const outer = r + Math.max(0, Math.cos(a * spikes)) * (v === 2 ? 2 : 3) * k;
          if (d > outer || d < r * 0.55) continue;
          const l = 0.55 - (dx / r) * 0.3 - (dy / r) * 0.3 + (d - r * 0.8) / r;
          P.set(x, y, cols[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
        }
      if (item.element !== 'none') for (let i = 0; i < 4; i++) P.set(Math.round(cx + Math.cos(i * 1.57) * r * 0.7), Math.round(cy + Math.sin(i * 1.57) * r * 0.7), EL_GLOW[item.element]);
      if (v === 1 && !small) {
        // twin
        P.blob(cx + 6, cy + 6, r * 0.5, r * 0.5, blade);
      }
      break;
    }
  }
}

export function itemIcon(item: Item): HTMLCanvasElement {
  const key = `icon:${item.uid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const P = new Painter(32, 32);
  if (item.slot === 'weapon') {
    if (item.family === 'daggers') {
      paintWeapon(P, item, new Axis(P, 4, 26, 0.7071, -0.7071, 22), false);
      paintWeapon(P, item, new Axis(P, 28, 26, -0.7071, -0.7071, 22), false);
    } else if (item.family === 'bow') paintWeapon(P, item, new Axis(P, 7, 27, 0.7071, -0.7071, 28), false);
    else paintWeapon(P, item, new Axis(P, 4, 28, 0.7071, -0.7071, 33), false);
    if (item.element !== 'none' && !['wand', 'chakram'].includes(item.family!)) {
      for (let i = 0; i < 5; i++) {
        const x = 10 + Math.floor(vh(item, 20 + i) * 18);
        const y = 4 + Math.floor(vh(item, 30 + i) * 18);
        if (P.alpha(x, y) === 0) P.set(x, y, EL_GLOW[item.element], 150);
      }
    }
  } else if (item.slot === 'ring') ringIcon(P, item);
  else if (item.slot === 'chest') chestIcon(P, item);
  else if (item.slot === 'boots') bootIcon(P, item);
  else relicIcon(P, item);
  P.outline('#120e18');
  const c = P.toCanvas();
  cache.set(key, c);
  return c;
}

function ringIcon(P: Painter, item: Item) {
  const band = MATERIALS[item.mat ?? 5].ramp.map(hex);
  const gem = gemColor(item);
  const style = Math.floor(vh(item, 1) * 3);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dx = (x + 0.5 - 16) / 9;
      const dy = (y + 0.5 - 19) / 8;
      const d = Math.hypot(dx, dy);
      const inner = style === 1 ? 0.55 : 0.65;
      if (d > 1 || d < inner) continue;
      let l = 0.5 - dx * 0.3 - dy * 0.35 + (d - 0.8) * 0.8;
      if (style === 2 && Math.sin(Math.atan2(dy, dx) * 9) > 0.4) l -= 0.25;
      P.set(x, y, band[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
    }
  if (style === 1) P.rect(12, 6, 8, 7, gem[1]);
  P.blob(16, style === 1 ? 9 : 10, style === 0 ? 5 : 4, style === 0 ? 4.5 : 4, gem);
  P.set(14, 8, '#ffffff');
  if (RARITIES.indexOf(item.rarity) >= 3) {
    P.set(10, 9, gem[2]);
    P.set(22, 9, gem[2]);
  }
}

function chestIcon(P: Painter, item: Item) {
  const [c1, c2] = CHEST_LOOKS[item.look % CHEST_LOOKS.length];
  const style = Math.floor(vh(item, 1) * 3);
  const ramp = [c2, c2, c1, c1];
  for (let y = 6; y < (style === 1 ? 30 : 28); y++)
    for (let x = 6; x < 26; x++) {
      const inSleeve = y < 16 && (x < 9 || x > 22);
      const inBody = x >= 9 && x <= 22 + (style === 1 && y > 20 ? 1 : 0) && x >= (style === 1 && y > 20 ? 8 : 9);
      if (!inSleeve && !inBody) continue;
      if (y < 9 && x > 12 && x < 19) continue;
      const l = 0.6 - (x - 16) / 30 - (y - 6) / 60;
      P.set(x, y, ramp[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
      if (style === 2 && (x + y) % 3 === 0 && inBody) P.set(x, y, '#8a8a9a');
    }
  if (style === 0) {
    P.rect(9, 21, 14, 2, '#3a2416');
    P.rect(15, 21, 2, 2, GOLD[2]);
  } else if (style === 2) {
    P.rect(10, 11, 12, 2, '#c0c4d0');
    P.rect(10, 16, 12, 2, '#c0c4d0');
  }
  P.line(12, 9, 16, 14, '#2a1a10');
  P.line(20, 9, 16, 14, '#2a1a10');
}

function bootIcon(P: Painter, item: Item) {
  const [c1, c2] = BOOT_LOOKS[item.look % BOOT_LOOKS.length];
  const tall = vh(item, 1) > 0.5;
  for (const ox of [0, 9]) {
    for (let y = tall ? 4 : 9; y < 26; y++) for (let x = 6 + ox; x < 13 + ox; x++) P.set(x, y, x - ox < 8 ? c1 : c2);
    for (let y = 20; y < 26; y++) for (let x = 13 + ox; x < 17 + ox; x++) P.set(x, y, c1);
    P.rect(6 + ox, 25, 11, 2, '#2a1a10');
    P.rect(6 + ox, tall ? 4 : 9, 7, 2, c2);
    if (vh(item, 2) > 0.5) P.rect(6 + ox, 15, 7, 1, GOLD[2]);
  }
}

function relicIcon(P: Painter, item: Item) {
  const el = item.relic?.el ?? 'none';
  const glow = EL_RAMP[el === 'none' ? 'shock' : el];
  const metal = MATERIALS[Math.floor(vh(item, 1) * MATERIALS.length)].ramp;
  switch (item.relic?.ability) {
    case 'blink':
    case 'mirror':
      P.blob(16, 16, 9, 11, metal);
      P.blob(16, 16, 6.5, 8.5, ['#1a2a3a', '#3a5a7a', '#8ab0d8', '#e8f4ff']);
      P.line(13, 10, 18, 22, '#ffffff');
      break;
    case 'nova':
    case 'storm':
      P.rect(12, 4, 8, 3, metal[2]);
      P.blob(16, 17, 8, 10, metal);
      P.blob(16, 17, 5, 6, glow);
      P.rect(15, 26, 2, 3, metal[1]);
      break;
    case 'meteor':
      P.blob(18, 13, 7, 7, glow);
      for (let i = 0; i < 8; i++) P.line(12 - i, 19 + i, 14 - i, 17 + i, glow[2 - (i % 2)]);
      break;
    case 'vortex':
      for (let a = 0; a < 18; a += 0.15) {
        const r = a * 0.7;
        P.set(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, metal[1 + (Math.floor(a) % 3)]);
      }
      P.blob(16, 16, 3, 3, glow);
      break;
    case 'spirits':
    case 'turret':
      P.blob(16, 18, 7, 9, ['#3a2414', '#5e3a20', '#8a5a34', '#b07a48']);
      P.rect(12, 14, 3, 2, glow[3]);
      P.rect(18, 14, 3, 2, glow[3]);
      P.blob(16, 8, 5, 3, ['#2f5a24', '#4b8a2e', '#6fb03c', '#9ad055']);
      break;
    case 'bubble':
      P.blob(16, 16, 11, 11, ['#1a3a5a', '#3a7aaa', '#7ac0f0', '#e0f8ff']);
      P.blob(16, 16, 8, 8, metal);
      break;
    case 'timeslow':
      P.rect(9, 4, 14, 3, metal[2]);
      P.rect(9, 25, 14, 3, metal[2]);
      for (let y = 7; y < 25; y++) {
        const w = Math.abs(y - 16) * 0.6 + 1;
        P.rect(16 - w, y, w * 2, 1, y < 16 ? '#e8d8a0' : '#c0a060');
      }
      break;
    case 'quake':
    case 'warcry':
      P.blob(16, 18, 10, 7, metal);
      P.rect(7, 12, 18, 3, '#8a5a34');
      P.blob(16, 12, 9, 3, glow);
      break;
    default:
      P.blob(16, 16, 9, 9, metal);
  }
}

/** Small world sprite of a weapon pointing right; grip at (gx, gy). */
export interface HeldSprite {
  img: HTMLCanvasElement;
  gx: number;
  gy: number;
}

const HELD_LEN: Record<string, number> = { sword: 19, daggers: 12, hammer: 21, spear: 28, scythe: 24, axe: 19, bow: 18, wand: 15, chakram: 14 };

export function heldWeapon(item: Item): HeldSprite {
  const key = `held:${item.uid}`;
  const hit = cache.get(key) as (HTMLCanvasElement & { _g?: [number, number] }) | undefined;
  if (hit && hit._g) return { img: hit, gx: hit._g[0], gy: hit._g[1] };
  const L = HELD_LEN[item.family!] ?? 18;
  let P: Painter;
  let g: [number, number];
  if (item.family === 'bow') {
    P = new Painter(12, L + 2);
    paintWeapon(P, item, new Axis(P, 3, 1, 0, 1, L), true);
    g = [4, Math.round(L / 2) + 1];
  } else if (item.family === 'chakram') {
    P = new Painter(L, L);
    paintWeapon(P, item, new Axis(P, 0, L / 2, 1, 0, L), true);
    g = [Math.round(L / 2), Math.round(L / 2)];
  } else {
    const h = item.family === 'scythe' ? 30 : item.family === 'hammer' || item.family === 'axe' ? 16 : 10;
    P = new Painter(L + 2, h);
    const oy = item.family === 'scythe' ? h - 5 : h / 2;
    paintWeapon(P, item, new Axis(P, 1, oy, 1, 0, L), true);
    g = [2, Math.round(oy)];
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

/** Sigil for boons: element ring + glyph. */
export function boonIconUrl(el: Element, glyph: number, cursed: boolean, kind: 'proc' | 'stat' | 'cond' | 'rule' = 'proc'): string {
  const key = `boon:${el}:${glyph}:${cursed}:${kind}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const P = new Painter(24, 24);
  const ramp = cursed
    ? ['#3a0a14', '#7a1a2a', '#c03a4a', '#ff9aa0']
    : kind === 'stat'
      ? GOLD
      : kind === 'cond'
        ? ['#3a1a10', '#8a3a20', '#e07a4a', '#ffd0b0']
        : kind === 'rule'
          ? ['#5a2a0a', '#b0601a', '#ffae45', '#fff0c0']
          : el === 'none'
            ? ['#2a1a4a', '#5a3a8a', '#a87ad8', '#ecd8ff']
            : EL_RAMP[el];
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
      if (d < 10.5 && d > 8.5) P.set(x, y, ramp[d > 9.5 ? 1 : 2]);
    }
  const pts = [
    [12, 5, 12, 19],
    [5, 12, 19, 12],
    [7, 7, 17, 17],
    [17, 7, 7, 17],
  ];
  for (let i = 0; i <= glyph % 4; i++) P.line(pts[i][0], pts[i][1], pts[i][2], pts[i][3], ramp[3]);
  P.blob(12, 12, 2.5, 2.5, ramp);
  P.outline('#120e18');
  const c = canvas(96, 96);
  ctx2d(c).drawImage(P.toCanvas(), 0, 0, 96, 96);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
