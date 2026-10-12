import { EL_GLOW, EL_RGB, Element } from '../data/elements';
import type { BurstKind, NumKind } from '../sim/world';

interface Particle {
  kind: 'spark' | 'leaf' | 'shard' | 'bubble' | 'dust' | 'ring' | 'glow' | 'mote' | 'petal' | 'pixel' | 'flame' | 'ray' | 'streak';
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  vr: number;
  add: boolean;
}

export interface DamageNumber {
  x: number;
  y: number;
  text: string;
  kind: NumKind;
  life: number;
  max: number;
  vx: number;
}

export interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  el: Element;
  kind: 'chain' | 'heal';
  life: number;
  max: number;
}

const MAX_PARTICLES = 1400;
const pixelCache = new WeakMap<HTMLCanvasElement, { x: number; y: number; c: string }[]>();

export class Particles {
  list: Particle[] = [];
  numbers: DamageNumber[] = [];
  beams: Beam[] = [];
  lowEffects = false;

  private add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX_PARTICLES * (this.lowEffects ? 0.4 : 1)) return;
    const life = p.life ?? 0.5;
    this.list.push({ kind: 'spark', vx: 0, vy: 0, g: 0, drag: 2, life, max: p.max ?? life, color: '#ffffff', size: 1, rot: 0, vr: 0, add: false, ...p });
  }

  number(x: number, y: number, text: string, kind: NumKind): void {
    const big = kind === 'crit' || kind === 'shatter';
    const life = big ? 1 : kind === 'proc' || kind === 'poison' || kind === 'burn' ? 0.6 : 0.8;
    this.numbers.push({ x: x + (Math.random() - 0.5) * 8, y, text, kind, life, max: life, vx: (Math.random() - 0.5) * 18 });
    if (this.numbers.length > 50) this.numbers.shift();
  }

  beam(x1: number, y1: number, x2: number, y2: number, el: Element, kind: 'chain' | 'heal'): void {
    this.beams.push({ x1, y1, x2, y2, el, kind, life: kind === 'chain' ? 0.22 : 0.45, max: kind === 'chain' ? 0.22 : 0.45 });
    if (kind === 'chain') this.add({ kind: 'glow', x: x2, y: y2, life: 0.2, size: 9, color: EL_RGB[el], add: true });
  }

  /** Break a sprite into its pixels and scatter them. */
  disintegrate(img: HTMLCanvasElement, x: number, y: number, flip: boolean, scale = 1): void {
    let px = pixelCache.get(img);
    if (!px) {
      px = [];
      const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
      for (let yy = 0; yy < img.height; yy++)
        for (let xx = 0; xx < img.width; xx++) {
          const i = (yy * img.width + xx) * 4;
          if (d[i + 3] < 128) continue;
          px.push({ x: xx, y: yy, c: `rgb(${d[i]},${d[i + 1]},${d[i + 2]})` });
        }
      pixelCache.set(img, px);
    }
    const step = this.lowEffects ? 4 : px.length > 300 ? 2 : 1;
    const cx = img.width / 2;
    const cy = img.height * 0.6;
    for (let i = 0; i < px.length; i += step) {
      const p = px[i];
      const lx = (flip ? img.width - 1 - p.x : p.x) * scale;
      const dx = lx - cx * scale;
      const dy = (p.y - cy) * scale;
      const a = Math.atan2(dy, dx);
      const s = 20 + Math.random() * 70;
      this.add({ kind: 'pixel', x: x + lx, y: y + p.y * scale, vx: Math.cos(a) * s + (Math.random() - 0.5) * 20, vy: Math.sin(a) * s - 40 - Math.random() * 40, g: 220, drag: 1.5, life: 0.5 + Math.random() * 0.5, color: p.c, size: 1 });
    }
  }

  burst(kind: BurstKind, x: number, y: number, angle = 0, scale = 1, el: Element = 'none'): void {
    const n = (k: number) => Math.max(1, Math.round(k * scale * (this.lowEffects ? 0.45 : 1)));
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const glow = EL_GLOW[el];
    const rgb = EL_RGB[el];
    switch (kind) {
      case 'hit':
        for (let i = 0; i < n(7); i++) {
          const a = angle + rnd(-0.9, 0.9);
          const s = rnd(50, 130);
          this.add({ kind: 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.12, 0.25), color: i % 3 === 0 && el !== 'none' ? glow : i % 2 ? '#ffffff' : '#ffe9a8', drag: 7 });
        }
        this.add({ kind: 'glow', x, y, life: 0.12, size: 8, color: el === 'none' ? '255,240,200' : rgb, add: true });
        break;
      case 'heavyHit':
        for (let i = 0; i < n(14); i++) {
          const a = angle + rnd(-1.4, 1.4);
          const s = rnd(60, 170);
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 200, life: rnd(0.25, 0.5), color: i % 3 ? '#e8dcc0' : el !== 'none' ? glow : '#ffffff', drag: 3, size: i % 4 ? 1 : 2 });
        }
        this.add({ kind: 'ring', x, y, life: 0.25, size: 16, color: el !== 'none' ? glow : '#fff4d0' });
        this.add({ kind: 'glow', x, y, life: 0.18, size: 14, color: el === 'none' ? '255,230,180' : rgb, add: true });
        break;
      case 'muzzle':
        for (let i = 0; i < n(4); i++) {
          const a = angle + rnd(-0.5, 0.5);
          this.add({ kind: 'streak', x, y, vx: Math.cos(a) * rnd(40, 90), vy: Math.sin(a) * rnd(40, 90), life: 0.12, color: el !== 'none' ? glow : '#fff4d0', drag: 8 });
        }
        this.add({ kind: 'glow', x, y, life: 0.1, size: 6, color: el === 'none' ? '255,240,200' : rgb, add: true });
        break;
      case 'shatter':
        for (let i = 0; i < n(30); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(40, 190);
          this.add({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 160, life: rnd(0.4, 0.8), color: i % 3 ? '#9ae8ff' : '#e8fcff', drag: 2.5, size: rnd(2, 4), rot: a, vr: rnd(-12, 12) });
        }
        this.add({ kind: 'ring', x, y, life: 0.35, size: 28, color: '#bff4ff' });
        this.add({ kind: 'glow', x, y, life: 0.35, size: 30, color: '150,230,255', add: true });
        break;
      case 'freeze':
        for (let i = 0; i < n(10); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'shard', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 20, vy: -rnd(10, 40), life: rnd(0.3, 0.6), color: '#cff6ff', size: 2, rot: a, vr: 4, drag: 3 });
        }
        this.add({ kind: 'glow', x, y, life: 0.3, size: 14, color: '150,230,255', add: true });
        break;
      case 'frostStep':
        for (let i = 0; i < n(18); i++) {
          const a = (i / 18) * Math.PI * 2;
          this.add({ kind: 'shard', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, life: 0.35, color: '#bff4ff', size: 2, rot: a, drag: 5 });
        }
        this.add({ kind: 'ring', x, y, life: 0.3, size: 30 * scale, color: '#9ae8ff' });
        break;
      case 'spores':
        for (let i = 0; i < n(14); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(15, 60);
          this.add({ kind: 'bubble', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: rnd(0.5, 1), color: i % 2 ? '#9cf05a' : '#5ab83a', size: rnd(1, 2.5), drag: 2 });
        }
        this.add({ kind: 'glow', x, y, life: 0.3, size: 14 * scale, color: '150,240,90', add: true });
        break;
      case 'poisonTick':
        for (let i = 0; i < n(3); i++) this.add({ kind: 'bubble', x: x + rnd(-4, 4), y: y + rnd(-2, 3), vy: -rnd(10, 25), life: rnd(0.4, 0.7), color: '#9cf05a', size: 1.5, drag: 1 });
        break;
      case 'burnTick':
        for (let i = 0; i < n(4); i++) this.add({ kind: 'flame', x: x + rnd(-5, 5), y: y + rnd(-2, 4), vy: -rnd(20, 40), life: rnd(0.25, 0.5), color: i % 2 ? '#ffae4a' : '#ffe08a', size: 2, drag: 1 });
        break;
      case 'ignite':
        for (let i = 0; i < n(14); i++) {
          const a = rnd(-Math.PI, 0);
          this.add({ kind: 'flame', x: x + rnd(-4, 4), y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 50, life: rnd(0.3, 0.6), color: i % 3 ? '#ff8a2a' : '#ffe08a', size: 2, drag: 2 });
        }
        this.add({ kind: 'glow', x, y, life: 0.35, size: 16, color: '255,150,60', add: true });
        break;
      case 'shockTick':
        for (let i = 0; i < n(3); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'streak', x: x + Math.cos(a) * 5, y: y + Math.sin(a) * 5, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.1, color: '#fff27a', drag: 4 });
        }
        break;
      case 'electrify':
        for (let i = 0; i < n(12); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'streak', x, y, vx: Math.cos(a) * rnd(60, 140), vy: Math.sin(a) * rnd(60, 140), life: rnd(0.1, 0.2), color: i % 2 ? '#fff27a' : '#c0b0ff', drag: 5 });
        }
        this.add({ kind: 'glow', x, y, life: 0.25, size: 18, color: '255,240,120', add: true });
        this.add({ kind: 'ring', x, y, life: 0.2, size: 16, color: '#fff8b0' });
        break;
      case 'death':
        for (let i = 0; i < n(10); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(20, 90);
          this.add({ kind: i % 2 ? 'leaf' : 'dust', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: i % 2 ? 60 : 0, life: rnd(0.4, 0.9), color: i % 2 ? '#6fae3c' : '#cdbf9a', size: i % 2 ? 2 : rnd(3, 5), drag: 3, rot: a, vr: rnd(-6, 6) });
        }
        this.add({ kind: 'glow', x, y, life: 0.25, size: 18, color: '255,220,150', add: true });
        this.add({ kind: 'ring', x, y, life: 0.25, size: 14 * scale, color: '#fff2c0' });
        break;
      case 'bossDeath':
        for (let i = 0; i < n(70); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(30, 220);
          this.add({ kind: i % 3 ? 'leaf' : 'petal', x, y: y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 90, life: rnd(0.8, 1.8), color: i % 3 ? '#7ab443' : '#ffd6c4', size: 2, drag: 1.5, rot: a, vr: rnd(-6, 6) });
        }
        for (let i = 0; i < 12; i++) this.add({ kind: 'ray', x, y: y - 10, life: 1.2, size: 120, rot: (i / 12) * Math.PI * 2, color: '255,230,170', add: true, vr: 0.4 });
        this.add({ kind: 'ring', x, y, life: 0.6, size: 70, color: '#fff2c0' });
        this.add({ kind: 'glow', x, y, life: 0.9, size: 70, color: '255,220,150', add: true });
        break;
      case 'dust':
        for (let i = 0; i < n(2); i++) this.add({ kind: 'dust', x: x + rnd(-3, 3), y: y + rnd(-1, 1), vx: rnd(-10, 10), vy: rnd(-8, 0), life: rnd(0.25, 0.45), color: '#d8ccaa', size: rnd(1.5, 3), drag: 3 });
        break;
      case 'fracture':
        for (let i = 0; i < n(26); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(60, 190);
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 40, g: 260, life: rnd(0.4, 0.7), color: i % 2 ? '#9b957c' : '#6a6450', size: i % 3 ? 1 : 2, drag: 2 });
        }
        this.add({ kind: 'ring', x, y, life: 0.35, size: 56 * scale, color: '#f0e6c8' });
        this.add({ kind: 'ring', x, y, life: 0.25, size: 38 * scale, color: '#ffffff' });
        this.add({ kind: 'glow', x, y, life: 0.2, size: 32, color: '255,230,180', add: true });
        break;
      case 'nova':
        this.add({ kind: 'ring', x, y, life: 0.32, size: 42 * scale, color: glow });
        this.add({ kind: 'ring', x, y, life: 0.22, size: 30 * scale, color: '#ffffff' });
        this.add({ kind: 'glow', x, y, life: 0.3, size: 40 * scale, color: rgb, add: true });
        for (let i = 0; i < n(18); i++) {
          const a = (i / 18) * Math.PI * 2 + rnd(0, 0.3);
          const s = rnd(80, 140) * scale;
          this.add({ kind: el === 'burn' ? 'flame' : el === 'frost' ? 'shard' : 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.75, life: 0.3, color: i % 2 ? glow : '#ffffff', drag: 4, size: 2, rot: a });
        }
        break;
      case 'explosion':
        for (let i = 0; i < n(22); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(40, 150) * scale;
          this.add({ kind: 'flame', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 20, life: rnd(0.3, 0.6), color: i % 3 === 0 ? '#ffffff' : el === 'none' ? (i % 2 ? '#ff8a2a' : '#ffd060') : glow, size: rnd(2, 3), drag: 3 });
        }
        for (let i = 0; i < n(8); i++) this.add({ kind: 'dust', x: x + rnd(-8, 8), y: y + rnd(-6, 6), vy: -rnd(5, 20), life: rnd(0.5, 0.9), color: '#5a5048', size: rnd(4, 7), drag: 2 });
        this.add({ kind: 'ring', x, y, life: 0.3, size: 30 * scale, color: el === 'none' ? '#ffd080' : glow });
        this.add({ kind: 'glow', x, y, life: 0.35, size: 40 * scale, color: el === 'none' ? '255,170,80' : rgb, add: true });
        break;
      case 'meteor':
        this.burst('explosion', x, y, 0, scale * 1.3, el);
        this.burst('fracture', x, y, 0, scale * 0.8);
        break;
      case 'blink':
        for (let i = 0; i < n(14); i++) this.add({ kind: 'spark', x: x + rnd(-6, 6), y: y + rnd(-8, 6), vx: rnd(-20, 20), vy: rnd(-40, -10), life: rnd(0.3, 0.6), color: i % 2 ? '#c8b0ff' : '#ffffff', drag: 2 });
        this.add({ kind: 'glow', x, y, life: 0.25, size: 18 * scale, color: el === 'none' ? '200,160,255' : rgb, add: true });
        break;
      case 'summon':
        for (let i = 0; i < n(16); i++) {
          const a = (i / 16) * Math.PI * 2;
          this.add({ kind: 'spark', x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 8, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 30 - 10, life: 0.4, color: glow, drag: 1 });
        }
        this.add({ kind: 'glow', x, y, life: 0.4, size: 20, color: rgb, add: true });
        break;
      case 'shield':
        this.add({ kind: 'ring', x, y, life: 0.3, size: 14 * scale, color: '#9ad8ff' });
        this.add({ kind: 'glow', x, y, life: 0.25, size: 18 * scale, color: '140,210,255', add: true });
        break;
      case 'haste':
        for (let i = 0; i < n(10); i++) this.add({ kind: 'streak', x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-20, 20), vy: -rnd(40, 80), life: 0.3, color: '#ffe27a', drag: 2 });
        break;
      case 'ward':
        this.add({ kind: 'ring', x, y, life: 0.2, size: 12 * scale, color: '#c8b0ff' });
        break;
      case 'split':
        for (let i = 0; i < n(12); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'bubble', x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 50, life: 0.5, color: '#b8e07a', size: 2, drag: 3 });
        }
        break;
      case 'heal':
        for (let i = 0; i < n(14); i++) this.add({ kind: 'spark', x: x + rnd(-7, 7), y: y + rnd(-6, 6), vy: -rnd(20, 45), life: rnd(0.5, 0.9), color: i % 2 ? '#9affb0' : '#eaffee', drag: 1, size: 1 });
        this.add({ kind: 'glow', x, y, life: 0.5, size: 16, color: '120,255,160', add: true });
        break;
      case 'chest':
        for (let i = 0; i < n(22); i++) {
          const a = rnd(-Math.PI, 0);
          const s = rnd(30, 110);
          this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 80, life: rnd(0.5, 1), color: i % 2 ? '#ffe07a' : '#fff8d0', drag: 2 });
        }
        for (let i = 0; i < 6; i++) this.add({ kind: 'ray', x, y, life: 0.6, size: 30, rot: -Math.PI / 2 + (i - 2.5) * 0.35, color: '255,220,130', add: true, vr: 0 });
        this.add({ kind: 'glow', x, y, life: 0.5, size: 24, color: '255,220,130', add: true });
        break;
      case 'legendary':
        for (let i = 0; i < 10; i++) this.add({ kind: 'ray', x, y, life: 1.4, size: 60 * scale, rot: (i / 10) * Math.PI * 2, color: scale > 1.2 ? '255,170,60' : '210,140,255', add: true, vr: 0.8 });
        this.add({ kind: 'ring', x, y, life: 0.6, size: 40 * scale, color: scale > 1.2 ? '#ffae45' : '#c98bff' });
        this.add({ kind: 'glow', x, y, life: 0.8, size: 40 * scale, color: scale > 1.2 ? '255,180,80' : '210,150,255', add: true });
        break;
      case 'roomClear':
        this.add({ kind: 'ring', x, y, life: 0.6, size: 90, color: '#fff2c0' });
        for (let i = 0; i < n(24); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'petal', x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 20 - 30, vx: rnd(-20, 20), vy: rnd(-10, 20), g: 30, life: rnd(1, 1.8), color: i % 2 ? '#ffd6c4' : '#fff2a6', size: 2, drag: 1, rot: a, vr: rnd(-5, 5) });
        }
        break;
      case 'sparkle':
        this.add({ kind: 'spark', x, y, vy: -10, life: 0.6, color: '#fff8d0', drag: 1 });
        break;
      case 'leaves':
        for (let i = 0; i < n(8); i++) {
          const a = angle + rnd(-1.2, 1.2);
          const s = rnd(30, 90);
          this.add({ kind: 'leaf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 50, life: rnd(0.4, 0.8), color: i % 2 ? '#7ab443' : '#4f8a34', size: 2, drag: 3, rot: a, vr: rnd(-8, 8) });
        }
        this.add({ kind: 'dust', x, y, life: 0.3, size: 6, color: '#cdbf9a', drag: 1 });
        break;
      case 'erupt':
        for (let i = 0; i < n(10); i++) {
          const a = -Math.PI / 2 + rnd(-0.8, 0.8);
          const s = rnd(50, 120);
          this.add({ x: x + rnd(-6, 6), y, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s, g: 300, life: rnd(0.3, 0.5), color: i % 2 ? '#8a5a34' : '#b8433a', size: 2, drag: 1 });
        }
        this.add({ kind: 'dust', x, y, life: 0.4, size: 10, color: '#a89a78', drag: 1 });
        break;
      case 'roar':
        this.add({ kind: 'ring', x, y, life: 0.5, size: 70 * scale, color: '#ffe0a0' });
        this.add({ kind: 'ring', x, y, life: 0.4, size: 50 * scale, color: '#ffffff' });
        for (let i = 0; i < n(20); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'leaf', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 90, life: 0.7, color: '#7ab443', size: 2, drag: 2, rot: a, vr: 6 });
        }
        break;
    }
  }

  ambient(x: number, y: number, kind: 'mote' | 'firefly' | 'stair' | 'leafFall' | 'butterfly'): void {
    if (kind === 'mote') this.add({ kind: 'mote', x, y, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 4, life: 3, color: '255,245,210', size: 1, drag: 0, add: true });
    else if (kind === 'firefly') this.add({ kind: 'mote', x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 2.5, color: '230,255,140', size: 1, drag: 0, add: true });
    else if (kind === 'leafFall') this.add({ kind: 'leaf', x, y, vx: 8 + Math.random() * 6, vy: 10 + Math.random() * 8, life: 5, color: Math.random() < 0.5 ? '#7ab443' : '#a6d860', size: 2, drag: 0, rot: 0, vr: 2 });
    else if (kind === 'butterfly') this.add({ kind: 'petal', x, y, vx: (Math.random() - 0.5) * 20, vy: -4, life: 4, color: Math.random() < 0.5 ? '#fff2a6' : '#e8d2ff', size: 2, drag: 0, rot: 0, vr: 9 });
    else this.add({ kind: 'spark', x, y, vy: -12 - Math.random() * 10, life: 1.2, color: '#ffd88a', drag: 0.5 });
  }

  /** Continuous trail behind projectiles and summons. */
  trail(x: number, y: number, el: Element, size = 1): void {
    if (Math.random() < (this.lowEffects ? 0.7 : 0.25)) return;
    this.add({ kind: el === 'burn' ? 'flame' : 'spark', x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2, vy: el === 'burn' ? -15 : 0, life: 0.25, color: EL_GLOW[el], size, drag: 2 });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'leaf' || p.kind === 'petal') p.vx += Math.sin(p.life * 9 + p.rot) * 20 * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= dt * (n.life > n.max * 0.6 ? 30 : 8);
      n.x += n.vx * dt;
      n.vx *= Math.exp(-4 * dt);
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
  }

  drawBeams(g: CanvasRenderingContext2D): void {
    for (const b of this.beams) {
      const t = b.life / b.max;
      if (b.kind === 'heal') {
        g.globalAlpha = t;
        g.strokeStyle = '#7aff9a';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(b.x1, b.y1);
        g.lineTo(b.x2, b.y2);
        g.stroke();
        g.globalAlpha = 1;
        continue;
      }
      // Jagged lightning, re-jittered every frame.
      const segs = Math.max(3, Math.round(Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 7));
      for (const pass of [0, 1]) {
        g.strokeStyle = pass === 0 ? `rgba(${EL_RGB[b.el]}, ${0.6 * t})` : `rgba(255,255,255,${t})`;
        g.lineWidth = pass === 0 ? 3 : 1;
        g.beginPath();
        g.moveTo(b.x1, b.y1);
        for (let i = 1; i < segs; i++) {
          const f = i / segs;
          g.lineTo(b.x1 + (b.x2 - b.x1) * f + (Math.random() - 0.5) * 7, b.y1 + (b.y2 - b.y1) * f + (Math.random() - 0.5) * 7);
        }
        g.lineTo(b.x2, b.y2);
        g.stroke();
      }
    }
  }

  draw(g: CanvasRenderingContext2D, additive: boolean): void {
    for (const p of this.list) {
      if (p.add !== additive) continue;
      const t = p.life / p.max;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      switch (p.kind) {
        case 'glow': {
          const r = p.size * (1.2 - t * 0.2);
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, `rgba(${p.color},${0.6 * t})`);
          grd.addColorStop(1, `rgba(${p.color},0)`);
          g.fillStyle = grd;
          g.fillRect(x - r, y - r, r * 2, r * 2);
          break;
        }
        case 'ray': {
          const len = p.size * (0.6 + (1 - t) * 0.4);
          g.save();
          g.translate(x, y);
          g.rotate(p.rot);
          const grd = g.createLinearGradient(0, 0, len, 0);
          grd.addColorStop(0, `rgba(${p.color},${0.35 * t})`);
          grd.addColorStop(1, `rgba(${p.color},0)`);
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(len, -len * 0.06);
          g.lineTo(len, len * 0.06);
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        case 'mote': {
          g.fillStyle = `rgba(${p.color},${Math.sin((1 - t) * Math.PI) * 0.8})`;
          g.fillRect(x, y, 1, 1);
          break;
        }
        case 'ring': {
          const r = p.size * (1 - t * t);
          g.strokeStyle = p.color;
          g.globalAlpha = t;
          g.lineWidth = 1 + t * 1.5;
          g.beginPath();
          g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'dust': {
          g.globalAlpha = t * 0.6;
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size * (1.4 - t * 0.6)));
          g.fillRect(x - (s >> 1), y - (s >> 1), s, s);
          g.globalAlpha = 1;
          break;
        }
        case 'shard': {
          g.fillStyle = p.color;
          g.globalAlpha = Math.min(1, t * 2);
          const s = Math.round(p.size);
          const cx = Math.cos(p.rot);
          const sy = Math.sin(p.rot);
          for (let i = 0; i < s; i++) g.fillRect(Math.round(x + cx * i), Math.round(y + sy * i), 1, 1);
          g.globalAlpha = 1;
          break;
        }
        case 'streak': {
          g.strokeStyle = p.color;
          g.globalAlpha = Math.min(1, t * 2.5);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(Math.round(p.x - p.vx * 0.03), Math.round(p.y - p.vy * 0.03));
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'flame': {
          g.globalAlpha = Math.min(1, t * 2);
          g.fillStyle = t > 0.5 ? p.color : '#c0401a';
          const s = Math.max(1, Math.round(p.size * t + 0.5));
          g.fillRect(x, y, s, s);
          g.globalAlpha = 1;
          break;
        }
        case 'leaf':
        case 'petal': {
          g.globalAlpha = Math.min(1, t * 2);
          g.fillStyle = p.color;
          const horiz = Math.cos(p.rot) > 0;
          g.fillRect(x, y, horiz ? 2 : 1, horiz ? 1 : 2);
          g.globalAlpha = 1;
          break;
        }
        case 'bubble': {
          g.globalAlpha = Math.min(1, t * 1.5);
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size));
          g.fillRect(x, y, s, s);
          g.globalAlpha = 1;
          break;
        }
        default: {
          g.globalAlpha = Math.min(1, t * 2.5);
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size));
          g.fillRect(x, y, s, s);
          g.globalAlpha = 1;
        }
      }
    }
  }
}
